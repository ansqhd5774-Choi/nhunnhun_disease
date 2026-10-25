import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const RUNNER_LABELS = ['self-hosted', 'windows', 'x64', 'tistory-publisher'];
const SOURCE_ID_RE='([a-z0-9][a-z0-9-]{2,79})';
function sourceOwnedArtifactId(path){
  const standard=path.match(new RegExp('^(?:posts|updates|content-reviews/(?:posts|updates)|publishing/(?:state|update-state)|authoring/(?:target-resolution|target-resolution-results))/'+SOURCE_ID_RE+'\\.json$'));
  if(standard)return standard[1];
  const gate0=path.match(new RegExp('^authoring/direct-drafts/gate0-'+SOURCE_ID_RE+'(?:\\.meta)?\\.json$'));
  if(gate0)return gate0[1];
  const retry=path.match(new RegExp('^automation/update-retry/'+SOURCE_ID_RE+'\\.txt$'));
  return retry?.[1]??null;
}
export function assertSourceIdentity(workflowSha, checkoutSha, remoteSha, changedPaths, sourceId) {
  if (![workflowSha, checkoutSha, remoteSha].every(s => /^[a-f0-9]{40}$/.test(s || '')) || workflowSha !== checkoutSha) throw new Error('BLOCKED_SOURCE_DRIFT');
  if(checkoutSha===remoteSha)return;
  // Another article may advance through standard source-owned artifacts while this
  // mutation waits. The selected source plus shared runtime/workflow/dependencies remain frozen.
  const unrelated=p=>{
    if(p.startsWith('docs/')||p==='AGENTS.md'||p==='README.md')return true;
    if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sourceId??''))return false;
    const artifactId=sourceOwnedArtifactId(p);
    return artifactId!==null&&artifactId!==sourceId;
  };
  if(!Array.isArray(changedPaths)||!changedPaths.length||changedPaths.some(p=>!unrelated(p)))throw new Error('BLOCKED_SOURCE_DRIFT');
}
export function classifyRunners(runners) {
  if (!Array.isArray(runners)) return 'RUNNER_UNREACHABLE';
  const matching = runners.filter(r => RUNNER_LABELS.every(l => r.labels?.some(x => x.name.toLowerCase() === l)));
  if (!matching.length) return 'RUNNER_LABEL_MISMATCH';
  if (matching.some(r => r.status === 'online' && !r.busy)) return 'RUNNER_READY';
  return matching.some(r => r.status === 'online') ? 'RUNNER_BUSY' : 'RUNNER_OFFLINE';
}
export function mutationSourceId(env=process.env) {
  return env.UPDATE_SOURCE_ID || env.PUBLISH_SOURCE_ID;
}
export function assertCurrentSource() {
  const checkout = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
  const remote = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], {encoding:'utf8'}).trim().split(/\s+/)[0];
  let changedPaths;
  if(checkout!==remote) {
    try {
      execFileSync('git',['fetch','--no-tags','origin','main'],{stdio:'pipe'});
      if(execFileSync('git',['rev-parse','origin/main'],{encoding:'utf8'}).trim()!==remote)throw Error('drift');
      execFileSync('git',['merge-base','--is-ancestor',checkout,remote],{stdio:'pipe'});
      changedPaths=execFileSync('git',['diff','--name-only',checkout,remote],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
    } catch {throw Error('BLOCKED_SOURCE_DRIFT');}
  }
  assertSourceIdentity(process.env.GITHUB_ACTIONS === 'true' ? process.env.GITHUB_SHA : checkout, checkout, remote,changedPaths,mutationSourceId());
  return checkout;
}
async function main() {
  if (process.argv.includes('--queue')) {
    let status = 'RUNNER_UNREACHABLE';
    try {
      const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runners`, {headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});
      if (r.ok) status = classifyRunners((await r.json()).runners);
    } catch {}
    console.log(status);
    console.log('QUEUED_MUTATION_JOB = MATCHING_SELF_HOSTED_RUNNER_NOT_ASSIGNED; API_UNAVAILABLE_IS_NOT_PROOF_OF_OFFLINE');
    return;
  }
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Windows' || process.env.RUNNER_ARCH !== 'X64' || !process.env.RUNNER_NAME || !process.env.ComSpec?.toLowerCase().endsWith('cmd.exe')) throw new Error('E_RUNNER_CONTRACT');
  const checkout = assertCurrentSource();
  console.log(JSON.stringify({runner:process.env.RUNNER_NAME,os:process.env.RUNNER_OS,arch:process.env.RUNNER_ARCH,runId:process.env.GITHUB_RUN_ID,workflowSha:process.env.GITHUB_SHA,checkoutSha:checkout,time:new Date().toISOString(),shell:'cmd',labels:'workflow runs-on: '+RUNNER_LABELS.join('/')}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => {console.error(['BLOCKED_SOURCE_DRIFT','E_RUNNER_CONTRACT'].includes(e.message)?e.message:'E_RUNNER_GATE');process.exitCode=1;});
