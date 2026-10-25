import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {assertSourceIdentity} from '../publishing/runner-gate.mjs';
const REPO='ansqhd5774-Choi/nhunnhun_disease';
export async function dispatchQueuedUpdate({token,commitSha,sourceId,fetcher=fetch}={}) {
  if(!token || !/^[a-f0-9]{40}$/.test(commitSha??'') || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(sourceId??'')) throw Error('E_QUEUE_DISPATCH_INPUT');
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json'};
  const ref=await fetcher(`https://api.github.com/repos/${REPO}/git/ref/heads/main`,{headers,signal:AbortSignal.timeout(20000)});
  if(!ref.ok) throw Error('E_QUEUE_DISPATCH_GITHUB_READ');
  const currentSha=(await ref.json()).object?.sha;
  if(currentSha!==commitSha) {
    const comparison=await fetcher(`https://api.github.com/repos/${REPO}/compare/${commitSha}...${currentSha}`,{headers,signal:AbortSignal.timeout(20000)});
    if(!comparison.ok)throw Error('E_QUEUE_SOURCE_DRIFT');
    const diff=await comparison.json();
    if(diff.status!=='ahead'||!Array.isArray(diff.files)||diff.files.length>=300)throw Error('E_QUEUE_SOURCE_DRIFT');
    try {assertSourceIdentity(commitSha,commitSha,currentSha,diff.files.flatMap(f=>[f.filename,...(f.previous_filename?[f.previous_filename]:[])]),sourceId);}
    catch {throw Error('E_QUEUE_SOURCE_DRIFT');}
  }
  const response=await fetcher(`https://api.github.com/repos/${REPO}/actions/workflows/update-posts.yml/dispatches`,{method:'POST',headers,body:JSON.stringify({ref:'main',inputs:{update:'true',source_id:sourceId}}),signal:AbortSignal.timeout(20000)});
  if(response.status!==204) throw Error('E_QUEUE_DISPATCH_NOT_CONFIRMED');
  return {submitted:true,commitSha};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) dispatchQueuedUpdate({token:process.env.GITHUB_TOKEN,commitSha:process.env.SOURCE_COMMIT,sourceId:process.env.SOURCE_ID}).then(()=>console.log('QUEUE_UPDATE_DISPATCHED')).catch(error=>{console.error(/^E_[A-Z0-9_]+$/.test(error.message)?error.message:'E_QUEUE_DISPATCH_STATE_UNKNOWN');process.exitCode=1;});
