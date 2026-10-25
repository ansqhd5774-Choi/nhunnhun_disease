import {spawn} from 'node:child_process';
import {assertSelectedSource} from './repository-scope.mjs';
import {assertWriterHost,writerLockPath,acquireWriterLock,releaseWriterLock} from './writer-lock.mjs';

let lease;
try {
  const kind=process.argv[2];
  if(!['publish','update'].includes(kind))throw Error('E_WRITER_KIND');
  const id=kind==='publish'?process.env.PUBLISH_SOURCE_ID:process.env.UPDATE_SOURCE_ID;
  assertSelectedSource(kind==='publish'?'posts':'updates',id);
  assertWriterHost();
  lease=await acquireWriterLock(writerLockPath(process.env),{repository:process.env.GITHUB_REPOSITORY,sourceId:id});
  const env={...process.env,NHUNNHUN_WRITER_TOKEN:lease.token};
  const entries=['auth-preflight.mjs',...(kind==='publish'?['target-resolution-gate.mjs']:[]),kind+'.mjs'];
  for(const entry of entries) {
    const code=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['publishing/'+entry],{env,stdio:'inherit',windowsHide:true});
      child.once('error',reject);
      child.once('exit',(code,signal)=>resolve(signal?1:code??1));
    });
    if(code!==0)throw Error('E_WRITER_CHILD_FAILED');
  }
} catch(error) {
  console.error(/^E_[A-Z0-9_]+$/.test(error.message)?error.message:'E_WRITER_RUNTIME');
  process.exitCode=1;
} finally {
  if(lease)await releaseWriterLock(lease).catch(()=>{console.error('E_WRITER_RELEASE_REQUIRES_REVIEW');process.exitCode=1;});
}
