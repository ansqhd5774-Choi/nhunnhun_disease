import {createHash} from 'node:crypto';
const REPO='ansqhd5774-Choi/nhunnhun_disease';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const sourceDigest=source=>createHash('sha256').update(JSON.stringify(canonical(source))).digest('hex');

// Read a pinned commit, not a mutable branch or a successful write response alone.
export async function confirmGithubSource({kind='updates',source,commitSha,token,fetcher=fetch}={}){
  if(!['posts','updates'].includes(kind)||!/^[a-z0-9][a-z0-9-]{2,79}$/.test(source?.id??'')||!/^[a-f0-9]{40}$/.test(commitSha??'')||!token)throw Error('E_SOURCE_CONFIRM_INPUT');
  let response;
  try{response=await fetcher(`https://api.github.com/repos/${REPO}/contents/${kind}/${source.id}.json?ref=${commitSha}`,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});}
  catch{throw Error('E_SOURCE_CONFIRM_UNAVAILABLE');}
  if(!response.ok)throw Error(response.status===404?'E_SOURCE_NOT_CONFIRMED':'E_SOURCE_CONFIRM_UNAVAILABLE');
  let remote;
  try{const item=await response.json();if(item.type!=='file'||item.encoding!=='base64'||!item.content)throw Error();remote=JSON.parse(Buffer.from(item.content,'base64').toString('utf8'));}
  catch{throw Error('E_SOURCE_CONFIRM_INVALID');}
  if(sourceDigest(remote)!==sourceDigest(source))throw Error('E_SOURCE_CONFIRM_MISMATCH');
  return {status:'GITHUB_SOURCE_CONFIRMED',sourceId:source.id,commitSha,sourceDigest:sourceDigest(source)};
}
