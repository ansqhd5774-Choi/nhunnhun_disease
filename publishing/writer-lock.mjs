import {mkdir,readFile,writeFile,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';

// One physical Windows publisher host for all four independent repositories.
// No time-based takeover: a crashed writer requires operator inspection.
export const writerLockPath = env => join(env.ProgramData || 'C:\\ProgramData','NHUNNHUN','nhunnhun-tistory-writer.lock');
export function assertWriterHost(env=process.env,host=hostname()) {
  if (!env.TISTORY_WRITER_HOST || env.TISTORY_WRITER_HOST.toLowerCase() !== host.toLowerCase()) throw Error('E_WRITER_HOST_NOT_CONFIGURED');
}
export async function acquireWriterLock(path,owner,{timeoutMs=60000,pollMs=1000}={}) {
  const {dirname}=await import('node:path');
  await mkdir(dirname(path),{recursive:true});
  const deadline=Date.now()+timeoutMs;
  for (;;) {
    try { await mkdir(path); break; }
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      if(Date.now()>=deadline)throw Error('E_WRITER_BUSY');
      await new Promise(resolve=>setTimeout(resolve,pollMs));
    }
  }
  const token=randomUUID();
  // If writing fails, leave the lock closed rather than allowing another writer.
  await writeFile(join(path,'owner.json'),JSON.stringify({...owner,token,pid:process.pid,host:hostname(),startedAt:new Date().toISOString()}),{flag:'wx'});
  return {path,token};
}
export async function releaseWriterLock(lease) {
  const owner=JSON.parse(await readFile(join(lease.path,'owner.json'),'utf8'));
  if(owner.token!==lease.token)throw Error('E_WRITER_LEASE_MISMATCH');
  await unlink(join(lease.path,'owner.json'));
  await rmdir(lease.path);
}
export async function assertWriterLease(env=process.env) {
  assertWriterHost(env);
  if(!env.NHUNNHUN_WRITER_TOKEN)throw Error('E_WRITER_LEASE_REQUIRED');
  const owner=JSON.parse(await readFile(join(writerLockPath(env),'owner.json'),'utf8'));
  if(owner.token!==env.NHUNNHUN_WRITER_TOKEN || owner.repository!==env.GITHUB_REPOSITORY ||
     owner.sourceId!==(env.PUBLISH_SOURCE_ID || env.UPDATE_SOURCE_ID)) throw Error('E_WRITER_LEASE_MISMATCH');
}
