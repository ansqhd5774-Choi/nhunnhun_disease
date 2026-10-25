import {assertRepositorySource} from '../publishing/repository-scope.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkUpdateSource,updateFingerprint} from '../publishing/update-core.mjs';
import {assertDirectEmphasis} from '../publishing/direct-emphasis.mjs';
import {dispatchQueuedUpdate} from './update-queue-dispatch.mjs';
import {assertDirectPreflight} from '../publishing/direct-preflight.mjs';
import {confirmGithubSource} from './source-confirmation.mjs';

const sourceIdFromMutationPath=path=>{
  let match=path.match(/^updates\/(direct-[a-z0-9-]{2,70})\.json$/);
  if(match)return match[1];
  match=path.match(/^automation\/update-retry\/(direct-[a-z0-9-]{2,70})\.txt$/);
  return match?.[1]??null;
};

// A push may include several commits. Resolve one source ID whether the push
// changed the prepared source itself or its source-preserving retry marker.
export function sourceIdForEvent({eventName,sourceId,eventPayload}={}) {
  if(eventName!=='push') {
    if(!/^direct-[a-z0-9-]{2,70}$/.test(sourceId??''))throw Error('E_DIRECT_SOURCE_ID');
    return sourceId;
  }
  if(eventPayload?.ref!=='refs/heads/main'||eventPayload?.deleted===true)
    throw Error('E_DIRECT_PUSH_REF');
  const ids=new Set((eventPayload.commits??[]).flatMap(commit=>[
    ...(commit.added??[]),...(commit.modified??[])
  ]).map(sourceIdFromMutationPath).filter(Boolean));
  if(ids.size!==1)throw Error('E_DIRECT_PUSH_SOURCE_COUNT');
  return [...ids][0];
}

// GitHub Actions can omit commit file arrays in its normalized push event.
// Read the authoritative before..after diff when the event itself has no file list.
export async function resolveDirectSourceId({eventName,sourceId,eventPayload,token,fetcher=fetch}={}) {
  try { return sourceIdForEvent({eventName,sourceId,eventPayload}); }
  catch(error) {
    if(eventName!=='push'||error.message!=='E_DIRECT_PUSH_SOURCE_COUNT')throw error;
    const before=String(eventPayload?.before??''),after=String(eventPayload?.after??'');
    if(!/^[0-9a-f]{40}$/.test(before)||!/^([0-9a-f]{40})$/.test(after)||/^0+$/.test(before))
      throw Error('E_DIRECT_PUSH_RANGE');
    const response=await fetcher('https://api.github.com/repos/ansqhd5774-Choi/nhunnhun_disease/compare/'+before+'...'+after,{
      headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},
      signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)throw Error('E_DIRECT_PUSH_COMPARE_HTTP');
    const diff=await response.json();
    if(!Array.isArray(diff.files)||diff.files.length>=300)throw Error('E_DIRECT_PUSH_COMPARE_INCOMPLETE');
    const paths=diff.files.filter(file=>['added','modified','renamed'].includes(file.status)).map(file=>file.filename);
    return sourceIdForEvent({eventName:'push',eventPayload:{ref:eventPayload.ref,deleted:eventPayload.deleted,commits:[{added:paths,modified:[]}]}});
  }
}

export async function dispatchDirectSource({sourceId,commitSha,token,root=process.cwd(),dispatch=dispatchQueuedUpdate,confirmSource=confirmGithubSource}={}){
  if(!/^direct-[a-z0-9-]{2,70}$/.test(sourceId??''))throw Error('E_DIRECT_SOURCE_ID');
  const source=JSON.parse(await readFile(resolve(root,'updates',sourceId+'.json'),'utf8'));
  assertRepositorySource(source);
  checkUpdateSource(source,sourceId+'.json');
  assertDirectEmphasis(source);
  if(!source.representativeImageUrl)throw Error('E_UPDATE_REPRESENTATIVE');
  let ledger=null;
  try { ledger=JSON.parse(await readFile(resolve(root,'publishing/update-state',sourceId+'.json'),'utf8')); }
  catch(e) { if(e?.code!=='ENOENT')throw e; }
  if(ledger?.phase==='updated' && ledger.fingerprint===updateFingerprint(source) && ledger.url===source.targetUrl)
    return {alreadyUpdated:true,sourceId};
  // A PUBLIC_VERIFIED/updated source is immutable. A later editorial correction must use a new revision ID
  // for the same article rather than mutating the finalized source and obscuring its ledger fingerprint.
  if(ledger?.phase==='updated')throw Error('E_DIRECT_FINALIZED_SOURCE_MUTATION');
  // A submitting record may already have a successful final click. Inspect its run,
  // rather than spending another runner job on a duplicate/uncertain submission.
  if(ledger)throw Error('E_DIRECT_ALREADY_ATTEMPTED');
  assertDirectPreflight(source);
  const confirmation=await confirmSource({kind:'updates',source,commitSha,token});
  if(confirmation?.status!=='GITHUB_SOURCE_CONFIRMED')throw Error('E_SOURCE_NOT_CONFIRMED');
  return dispatch({token,commitSha,sourceId});
}

// Preserve the exact actionable contract error without leaking arbitrary exception text.
// This lets one failed run identify unsupported fields such as `tags` immediately.
export function directDispatchErrorMessage(error){
  const message=typeof error?.message==='string'?error.message:'';
  return /^E_[A-Z0-9_]+(?::[A-Za-z0-9_.-]+(?:,[A-Za-z0-9_.-]+)*)?$/.test(message)
    ? message
    : 'E_DIRECT_DISPATCH_FAILED';
}

async function main(){
  const eventName=process.env.GITHUB_EVENT_NAME??'workflow_dispatch';
  let eventPayload=null;
  if(eventName==='push'){
    if(!process.env.GITHUB_EVENT_PATH)throw Error('E_DIRECT_PUSH_EVENT_PATH');
    eventPayload=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
  }
  const sourceId=await resolveDirectSourceId({eventName,sourceId:process.env.SOURCE_ID,eventPayload,token:process.env.GITHUB_TOKEN});
  const result=await dispatchDirectSource({sourceId,commitSha:process.env.SOURCE_COMMIT,token:process.env.GITHUB_TOKEN});
  console.log(result.alreadyUpdated?'DIRECT_SOURCE_ALREADY_UPDATED':'DIRECT_SOURCE_DISPATCHED',sourceId);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e=>{console.error(directDispatchErrorMessage(e));process.exitCode=1;});
