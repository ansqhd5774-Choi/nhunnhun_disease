import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {BLOG,loadPosts} from './core.mjs';
import {assertTistoryAuthenticated} from './auth-preflight.mjs';
import {localBrowserConfig,openEditorConnection,closeEditorConnection} from './local-browser.mjs';

const MAX_MANAGER_PAGES=100;
const CLI_TIMEOUT_MS=90000;
const IDENTITY_KEYS=new Set(['sourceId','operation','topic','aliases','reviewed','proposedTitle']);

export function normalizeIdentityText(value){
  return String(value??'').normalize('NFC').toLocaleLowerCase('ko-KR').replace(/\s+/g,' ').trim();
}
function escapeRegExp(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
export function titleMatchesAlias(title,alias){
  const text=normalizeIdentityText(title),needle=normalizeIdentityText(alias);
  if(!text||!needle)return false;
  if(text===needle)return true;
  const pattern=escapeRegExp(needle).replace(/\s+/g,'\\s+');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${pattern}(?=$|[^\\p{L}\\p{N}])`,'iu').test(text);
}
export function primaryTitleSegment(title){
  return String(title??'').trim().split(/\s*[｜|]\s*/u,1)[0].trim();
}
export function validateIdentityRequest(identity,{sourceId=null}={}){
  if(!identity||typeof identity!=='object'||Array.isArray(identity))throw Error('E_TARGET_IDENTITY_REQUIRED');
  if(Object.keys(identity).some(key=>!IDENTITY_KEYS.has(key)))throw Error('E_TARGET_IDENTITY_SCHEMA');
  if(typeof identity.sourceId!=='string'||!/^[a-z0-9][a-z0-9-]{2,79}$/.test(identity.sourceId))throw Error('E_TARGET_IDENTITY_SOURCE');
  if(sourceId&&identity.sourceId!==sourceId)throw Error('E_TARGET_IDENTITY_MISMATCH');
  if(identity.operation!=='create'||identity.reviewed!==true)throw Error('E_TARGET_IDENTITY_MISMATCH');
  if(typeof identity.topic!=='string'||!identity.topic.trim()||identity.topic.length>80)throw Error('E_TARGET_IDENTITY_TOPIC');
  if(!Array.isArray(identity.aliases)||identity.aliases.length>12||identity.aliases.some(alias=>typeof alias!=='string'||!alias.trim()||alias.length>80))throw Error('E_TARGET_IDENTITY_ALIASES');
  if(identity.proposedTitle!=null&&(typeof identity.proposedTitle!=='string'||!identity.proposedTitle.trim()||identity.proposedTitle.length>180))throw Error('E_TARGET_IDENTITY_TITLE');
  const keys=[identity.topic,...identity.aliases].map(normalizeIdentityText);
  if(new Set(keys).size!==keys.length)throw Error('E_TARGET_IDENTITY_ALIASES');
  return identity;
}
export function identityDigest(identity){
  const clean={sourceId:identity.sourceId,operation:identity.operation,topic:identity.topic,aliases:identity.aliases,reviewed:identity.reviewed,...(identity.proposedTitle?{proposedTitle:identity.proposedTitle}:{})};
  return createHash('sha256').update(JSON.stringify(clean)).digest('hex');
}
export function validateResolutionProof(identity,resolution,{sourceId=identity?.sourceId}={}){
  if(!resolution||typeof resolution!=='object'||Array.isArray(resolution))throw Error('E_TARGET_RESOLUTION_RESULT_REQUIRED');
  if(resolution.sourceId!==sourceId||resolution.requestDigest!==identityDigest(identity))throw Error('E_TARGET_RESOLUTION_RESULT_MISMATCH');
  if(resolution.decision==='existing_candidate')throw Error('E_TARGET_EXISTING_CANDIDATE');
  if(resolution.decision!=='new'||!Number.isInteger(resolution.scanned)||resolution.scanned<1)throw Error('E_TARGET_RESOLUTION_RESULT_INVALID');
  return resolution;
}
export function validateCreateIdentity(post,identity){
  const required=post?.contentStandard==='SP1'&&String(post?.id||'').startsWith('direct-');
  if(!required)return null;
  validateIdentityRequest(identity,{sourceId:post.id});
  // proposedTitle belongs to the pre-authoring duplicate review. Runtime duplicate detection uses the final post.title plus reviewed aliases.
  return identity;
}
export function existingTargetCandidates(items,post,identity){
  const expected=normalizeIdentityText(post?.title||identity?.proposedTitle);
  const aliases=identity?[identity.topic,...identity.aliases]:[];
  const matches=[];
  for(const item of items??[]){
    const title=String(item?.title??'').trim();
    if(!title)continue;
    const exact=expected&&normalizeIdentityText(title)===expected;
    // Comparison terms after the main title divider describe related foods, not the article's primary target.
    const aliasHit=aliases.some(alias=>titleMatchesAlias(primaryTitleSegment(title),alias));
    if(exact||aliasHit)matches.push({id:String(item?.id??''),title,visibility:item?.visibility??null,exact,aliasHit});
  }
  return matches;
}
export async function fetchManagedPosts(page,{maxPages=MAX_MANAGER_PAGES,searchKeyword=''}={}){
  const result=await page.evaluate(async ({maxPages,searchKeyword})=>{
    try{
      const out=[];
      for(let pageNo=1;pageNo<=maxPages;pageNo++){
        const params=new URLSearchParams({category:'-3',page:String(pageNo),searchKeyword,searchType:'title',visibility:'all'});
        const response=await fetch('/manage/posts.json?'+params.toString(),{credentials:'include',headers:{Accept:'application/json'}});
        if(response.status!==200)return {errorCode:'E_TARGET_MANAGER_HTTP',status:response.status};
        let data;try{data=await response.json();}catch{return {errorCode:'E_TARGET_MANAGER_JSON'};}
        const items=Array.isArray(data?.items)?data.items:Array.isArray(data?.data?.items)?data.data.items:null;
        if(!items)return {errorCode:'E_TARGET_MANAGER_SCHEMA'};
        if(!items.length)return {items:out};
        out.push(...items.map(item=>({id:item?.id,title:item?.title,visibility:item?.visibility??null})));
        if(pageNo===maxPages)return {errorCode:'E_TARGET_MANAGER_SCAN_LIMIT'};
      }
      return {items:out};
    }catch{return {errorCode:'E_TARGET_MANAGER_FETCH'};}
  },{maxPages,searchKeyword});
  if(result?.errorCode)throw Error(result.errorCode);
  const byId=new Map();
  for(const item of result?.items??[]){if(item?.id!=null)byId.set(String(item.id),item);}
  return [...byId.values()];
}
export async function closeManagedPage(page,{timeoutMs=3000}={}){
  if(!page)return;
  let timer=null;
  try{
    await Promise.race([
      Promise.resolve().then(()=>page.close({runBeforeUnload:false})),
      new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);})
    ]);
  }catch{}
  finally{if(timer)clearTimeout(timer);}
}
async function readJson(path,missingCode,readCode){
  try{return JSON.parse(await readFile(path,'utf8'));}
  catch(error){if(error?.code==='ENOENT')throw Error(missingCode);throw Error(readCode);}
}
async function readIdentity(root,post){
  const required=post.contentStandard==='SP1'&&post.id.startsWith('direct-');
  if(!required)return {identity:null,resolution:null};
  const identity=validateCreateIdentity(post,await readJson(resolve(root,'authoring','target-resolution',post.id+'.json'),'E_TARGET_IDENTITY_REQUIRED','E_TARGET_IDENTITY_READ'));
  const resolution=await readJson(resolve(root,'authoring','target-resolution-results',post.id+'.json'),'E_TARGET_RESOLUTION_RESULT_REQUIRED','E_TARGET_RESOLUTION_RESULT_READ');
  validateResolutionProof(identity,resolution,{sourceId:post.id});
  return {identity,resolution};
}
export async function runTargetResolutionGate({root=process.cwd(),sourceId=process.env.PUBLISH_SOURCE_ID}={}){
  if(!sourceId)throw Error('E_TARGET_SOURCE_REQUIRED');
  const [post]=await loadPosts('posts',sourceId);
  const {identity,resolution}=await readIdentity(root,post);
  let connection,page;
  try{
    connection=await openEditorConnection(await localBrowserConfig());
    page=await connection.context.newPage();
    await page.goto(`${BLOG}/manage/posts`,{waitUntil:'domcontentloaded',timeout:30000});
    await assertTistoryAuthenticated(page);
    // Legacy non-direct sources retain the exact-title fallback; scoped direct sources require local identity evidence.
    // Use Tistory's title search for the same exact-title decision instead of scanning up to 100 manager pages.
    const items=identity
      ? await fetchManagedPosts(page)
      : await fetchManagedPosts(page,{maxPages:10,searchKeyword:String(post.title||'').trim()});
    const candidates=existingTargetCandidates(items,post,identity);
    if(candidates.length){
      console.log('TARGET_RESOLUTION_CANDIDATES '+JSON.stringify({sourceId:post.id,topic:identity?.topic??null,count:candidates.length,candidates:candidates.slice(0,12)}));
      throw Error('E_TARGET_EXISTING_CANDIDATE');
    }
    console.log('TARGET_RESOLUTION_NEW_CONFIRMED '+JSON.stringify({sourceId:post.id,topic:identity?.topic??null,preAuthoringDecision:resolution?.decision??null,preAuthoringScanned:resolution?.scanned??null,runtimeScanned:items.length,exactTitleChecked:true}));
  }finally{
    await closeManagedPage(page);
    if(connection)await closeEditorConnection(connection);
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const timeout=setTimeout(()=>{
    console.error('E_TARGET_RESOLUTION_TIMEOUT');
    process.exit(1);
  },CLI_TIMEOUT_MS);
  timeout.unref?.();
  runTargetResolutionGate()
    .then(()=>{
      clearTimeout(timeout);
      process.exit(0);
    })
    .catch(error=>{
      clearTimeout(timeout);
      console.error(/^E_[A-Z0-9_]+$/.test(error?.message)?error.message:'E_TARGET_RESOLUTION_RUNTIME');
      process.exit(1);
    });
}
