import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {BLOG} from './core.mjs';
import {assertTistoryAuthenticated} from './auth-preflight.mjs';
import {localBrowserConfig,openEditorConnection,closeEditorConnection} from './local-browser.mjs';
import {validateIdentityRequest,identityDigest,existingTargetCandidates,fetchManagedPosts,closeManagedPage} from './target-resolution-gate.mjs';

const REPO='ansqhd5774-Choi/nhunnhun_disease';
function encode(value){return Buffer.from(JSON.stringify(value,null,2)+'\n').toString('base64');}
function exitCli(code){process.stdout.write('',()=>process.stderr.write('',()=>process.exit(code)));}
async function githubJson(url,options={}){
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(20000)});
  if(response.status===404)return null;
  if(!response.ok)throw Error('E_TARGET_RESULT_GITHUB');
  return response.json();
}
async function assertCurrentRequest(sourceId,digest){
  const data=await githubJson(`https://api.github.com/repos/${REPO}/contents/authoring/target-resolution/${sourceId}.json?ref=main`);
  if(!data?.content)throw Error('E_TARGET_REQUEST_NOT_ON_MAIN');
  let current;try{current=validateIdentityRequest(JSON.parse(Buffer.from(data.content,'base64').toString('utf8')),{sourceId});}catch{throw Error('E_TARGET_REQUEST_DRIFT');}
  if(identityDigest(current)!==digest)throw Error('E_TARGET_REQUEST_DRIFT');
}
async function writeResult(sourceId,result){
  const path=`authoring/target-resolution-results/${sourceId}.json`;
  const current=await githubJson(`https://api.github.com/repos/${REPO}/contents/${path}?ref=main`);
  const body={message:`target resolution: ${sourceId}`,branch:'main',content:encode(result),...(current?.sha?{sha:current.sha}:{})};
  await githubJson(`https://api.github.com/repos/${REPO}/contents/${path}`,{method:'PUT',body:JSON.stringify(body)});
}
export async function resolveTargetReadonly({root=process.cwd(),sourceId=process.env.TARGET_SOURCE_ID}={}){
  if(!process.env.GITHUB_TOKEN)throw Error('E_TARGET_RESULT_GITHUB_CONFIG');
  if(!sourceId||!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sourceId))throw Error('E_TARGET_SOURCE_REQUIRED');
  let request;try{request=validateIdentityRequest(JSON.parse(await readFile(resolve(root,'authoring','target-resolution',sourceId+'.json'),'utf8')),{sourceId});}
  catch(error){if(/^E_/.test(error?.message||''))throw error;throw Error('E_TARGET_IDENTITY_READ');}
  const digest=identityDigest(request);
  let connection,page;
  try{
    connection=await openEditorConnection(await localBrowserConfig());
    page=await connection.context.newPage();
    await page.goto(`${BLOG}/manage/posts`,{waitUntil:'domcontentloaded',timeout:30000});
    await assertTistoryAuthenticated(page);
    const items=await fetchManagedPosts(page);
    if(items.length<1)throw Error('E_TARGET_MANAGER_EMPTY');
    const candidates=existingTargetCandidates(items,{title:request.proposedTitle||''},request);
    const result={
      sourceId,
      requestDigest:digest,
      decision:candidates.length?'existing_candidate':'new',
      scanned:items.length,
      candidates:candidates.slice(0,12).map(({id,title,visibility,exact,aliasHit})=>({id,title,visibility,exact,aliasHit})),
      resolvedAt:new Date().toISOString(),
      requestCommit:process.env.GITHUB_SHA||null,
      runUrl:process.env.GITHUB_RUN_ID?`https://github.com/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`:null
    };
    await assertCurrentRequest(sourceId,digest);
    await writeResult(sourceId,result);
    console.log('TARGET_RESOLUTION_RESULT '+JSON.stringify({sourceId,decision:result.decision,scanned:result.scanned,candidates:result.candidates}));
    return result;
  }finally{
    await closeManagedPage(page);
    if(connection)await closeEditorConnection(connection);
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  resolveTargetReadonly().then(()=>exitCli(0)).catch(error=>{console.error(/^E_/.test(error?.message||'')?error.message:'E_TARGET_RESOLUTION_RUNTIME');exitCli(1);});
}
