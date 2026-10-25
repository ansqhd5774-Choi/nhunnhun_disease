import {createHmac, randomUUID} from 'node:crypto';
import {mkdir, open, readFile, rename, unlink, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, resolve, sep} from 'node:path';

export const COUPANG_BASE_URL='https://api-gateway.coupang.com';
export const COUPANG_API_PREFIX='/v2/providers/affiliate_open_api/apis/openapi/v1';
export const COUPANG_LIMITS=Object.freeze({search:10,other:100,windowMs:60*60*1000});
export const DEFAULT_RATE_STATE_PATH=join(homedir(),'.nhunnhun','coupang-partners-rate-state.json');

export function buildSignedDate(now=new Date()){
  return now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'').slice(2);
}

export function buildQueryString(query={}){
  return Object.entries(query)
    .filter(([,value])=>value!==undefined&&value!==null&&value!=='')
    .map(([key,value])=>`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

export function buildAuthorizationHeader({method,path,queryString='',accessKey,secretKey,now=new Date()}){
  if(!accessKey||!secretKey)throw new Error('E_COUPANG_CREDENTIALS');
  const signedDate=buildSignedDate(now);
  const signature=createHmac('sha256',secretKey).update(signedDate+method.toUpperCase()+path+queryString).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${signedDate}, signature=${signature}`;
}

function assertExternalStatePath(statePath){
  if(typeof statePath!=='string'||!isAbsolute(statePath))throw new Error('E_COUPANG_RATE_STATE_PATH');
  const cwd=resolve(process.cwd())+sep;
  if(resolve(statePath).startsWith(cwd))throw new Error('E_COUPANG_RATE_STATE_MUST_BE_EXTERNAL');
}

async function reserveCall({statePath,bucket,limit,now=Date.now(),waitMs=1500}){
  assertExternalStatePath(statePath);
  const path=resolve(statePath),lockPath=path+'.lock';
  await mkdir(dirname(path),{recursive:true});
  let lock;
  const until=Date.now()+waitMs;
  while(!lock){
    try{lock=await open(lockPath,'wx');}
    catch(error){
      if(error?.code!=='EEXIST')throw error;
      if(Date.now()>=until)throw new Error('E_COUPANG_RATE_LOCKED');
      await new Promise(resolve=>setTimeout(resolve,35));
    }
  }
  try{
    let state={version:1,calls:[]};
    try{state=JSON.parse(await readFile(path,'utf8'));}
    catch(error){if(error?.code!=='ENOENT')throw new Error('E_COUPANG_RATE_STATE_INVALID');}
    if(state?.version!==1||!Array.isArray(state.calls)||state.calls.some(x=>!Number.isFinite(x?.at)||typeof x?.bucket!=='string'))throw new Error('E_COUPANG_RATE_STATE_INVALID');
    const recent=state.calls.filter(x=>now-x.at<COUPANG_LIMITS.windowMs);
    const used=recent.filter(x=>x.bucket===bucket).length;
    if(used>=limit)throw new Error('E_COUPANG_RATE_LIMIT_LOCAL');
    recent.push({at:now,bucket});
    const temp=path+'.'+randomUUID()+'.tmp';
    await writeFile(temp,JSON.stringify({version:1,calls:recent},null,2)+'\n',{flag:'wx'});
    await rename(temp,path);
  }finally{
    await lock.close().catch(()=>{});
    await unlink(lockPath).catch(()=>{});
  }
}

function assertSuccessEnvelope(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('E_COUPANG_RESPONSE');
  if(payload.rCode!==undefined&&String(payload.rCode)!=='0')throw new Error('E_COUPANG_API_ENVELOPE');
  if(payload.code!==undefined&&String(payload.code)!=='SUCCESS'&&String(payload.code)!=='0')throw new Error('E_COUPANG_API_ENVELOPE');
  return payload;
}

/**
 * Minimal Node.js client adapted from the MIT-licensed n8n community node.
 * It performs one request per call, never retries, and reserves quota before
 * sending so parallel jobs cannot silently overspend the hourly allowance.
 */
export class CoupangPartnersClient{
  constructor({accessKey=process.env.COUPANG_ACCESS_KEY,secretKey=process.env.COUPANG_SECRET_KEY,rateStatePath=process.env.COUPANG_RATE_STATE_PATH||DEFAULT_RATE_STATE_PATH,fetchImpl=globalThis.fetch,clock=()=>new Date()}={}){
    if(!accessKey||!secretKey)throw new Error('E_COUPANG_CREDENTIALS');
    if(typeof fetchImpl!=='function')throw new Error('E_COUPANG_FETCH');
    assertExternalStatePath(rateStatePath);
    this.accessKey=accessKey; this.secretKey=secretKey; this.rateStatePath=rateStatePath; this.fetchImpl=fetchImpl; this.clock=clock;
  }

  async request({method,path,query={},body,bucket='other'}){
    const limit=bucket==='search'?COUPANG_LIMITS.search:COUPANG_LIMITS.other;
    const now=this.clock();
    await reserveCall({statePath:this.rateStatePath,bucket,limit,now:now.getTime()});
    const queryString=buildQueryString(query);
    const url=COUPANG_BASE_URL+COUPANG_API_PREFIX+path+(queryString?'?'+queryString:'');
    const headers={Authorization:buildAuthorizationHeader({method,path:COUPANG_API_PREFIX+path,queryString,accessKey:this.accessKey,secretKey:this.secretKey,now}),'Content-Type':'application/json'};
    let response;
    try{response=await this.fetchImpl(url,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});}
    catch{throw new Error('E_COUPANG_NETWORK');}
    if(response.status===429)throw new Error('E_COUPANG_RATE_LIMIT_REMOTE');
    if(!response.ok)throw new Error(`E_COUPANG_HTTP_${response.status}`);
    let payload;
    try{payload=await response.json();}catch{throw new Error('E_COUPANG_RESPONSE');}
    return assertSuccessEnvelope(payload);
  }

  async searchProducts(keyword,{limit=10,subId='',srpLinkOnly=false}={}){
    const term=String(keyword??'').trim();
    if(!term||term.length>100||/[\r\n]/.test(term))throw new Error('E_COUPANG_KEYWORD');
    if(!Number.isInteger(limit)||limit<1||limit>10)throw new Error('E_COUPANG_SEARCH_LIMIT');
    const payload=await this.request({method:'GET',path:'/products/search',bucket:'search',query:{keyword:term,limit,srpLinkOnly,...(subId?{subId}:{})}});
    const data=payload.data;
    if(!data||typeof data!=='object')throw new Error('E_COUPANG_RESPONSE_SHAPE');
    const products=Array.isArray(data.productData)?data.productData:[];
    return {products,landingUrl:typeof data.landingUrl==='string'?data.landingUrl:null};
  }

  async createDeeplinks(coupangUrls,{subId=''}={}){
    if(!Array.isArray(coupangUrls)||coupangUrls.length<1||coupangUrls.length>3)throw new Error('E_COUPANG_LINK_COUNT');
    for(const value of coupangUrls){
      let url;try{url=new URL(value);}catch{throw new Error('E_COUPANG_PRODUCT_URL');}
      if(url.protocol!=='https:'||url.hostname!=='www.coupang.com'||url.username||url.password)throw new Error('E_COUPANG_PRODUCT_URL');
    }
    const payload=await this.request({method:'POST',path:'/deeplink',bucket:'other',body:{coupangUrls,...(subId?{subId}:{})}});
    const rows=Array.isArray(payload.data)?payload.data:[];
    if(rows.length!==coupangUrls.length||rows.some(row=>{
      if(typeof row?.landingUrl!=='string')return true;
      try{const url=new URL(row.landingUrl);return url.protocol!=='https:'||url.hostname!=='link.coupang.com';}catch{return true;}
    }))throw new Error('E_COUPANG_RESPONSE_SHAPE');
    return rows;
  }
}
