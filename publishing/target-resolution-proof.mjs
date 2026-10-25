import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadPosts} from './core.mjs';
import {validateCreateIdentity,validateResolutionProof} from './target-resolution-gate.mjs';

async function readJson(path,missingCode,readCode){
  try{return JSON.parse(await readFile(path,'utf8'));}
  catch(error){if(error?.code==='ENOENT')throw Error(missingCode);throw Error(readCode);}
}

export async function assertTargetResolutionProof({root=process.cwd(),sourceId=process.env.PUBLISH_SOURCE_ID}={}){
  if(!sourceId)throw Error('E_TARGET_SOURCE_REQUIRED');
  const [post]=await loadPosts('posts',sourceId);
  const required=post?.contentStandard==='SP1'&&String(post?.id||'').startsWith('direct-');
  if(!required)return {required:false};
  const identity=validateCreateIdentity(post,await readJson(
    resolve(root,'authoring','target-resolution',post.id+'.json'),
    'E_TARGET_IDENTITY_REQUIRED','E_TARGET_IDENTITY_READ'));
  const resolution=await readJson(
    resolve(root,'authoring','target-resolution-results',post.id+'.json'),
    'E_TARGET_RESOLUTION_RESULT_REQUIRED','E_TARGET_RESOLUTION_RESULT_READ');
  validateResolutionProof(identity,resolution,{sourceId:post.id});
  return {required:true,decision:resolution.decision,scanned:resolution.scanned};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  assertTargetResolutionProof()
    .then(result=>console.log('TARGET_RESOLUTION_PROOF_PASS '+JSON.stringify(result)))
    .catch(error=>{
      console.error(/^E_[A-Z0-9_]+$/.test(error?.message)?error.message:'E_TARGET_RESOLUTION_PROOF');
      process.exitCode=1;
    });
}
