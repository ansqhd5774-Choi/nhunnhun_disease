import {hostname} from 'node:os';
import {existsSync} from 'node:fs';
import {REPOSITORY_SCOPE,assertRepositorySource} from '../publishing/repository-scope.mjs';
import {assertWriterHost,acquireWriterLock,releaseWriterLock,writerLockPath} from '../publishing/writer-lock.mjs';
let lease;
try{
 assertRepositorySource({id:'direct-runtime-smoke',category:REPOSITORY_SCOPE.category,contentStandard:'SP1'});
 assertWriterHost();
 if(!existsSync(process.env.TISTORY_CHROME_PATH??'') || !existsSync(process.env.TISTORY_PROFILE_DIR??''))throw Error('E_RUNTIME_BROWSER_CONFIGURATION');
 const cdp=process.env.TISTORY_CDP_URL||'http://127.0.0.1:9223';
 const url=new URL(cdp);
 if(!['127.0.0.1','localhost'].includes(url.hostname)||url.protocol!=='http:')throw Error('E_RUNTIME_LOCAL_CDP');
 const response=await fetch(cdp+'/json/version',{signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('E_RUNTIME_CHROME_UNAVAILABLE');
 lease=await acquireWriterLock(writerLockPath(process.env),{repository:REPOSITORY_SCOPE.repository,sourceId:'direct-runtime-smoke'});
 console.log('INDEPENDENT_RUNTIME_PASS '+JSON.stringify({repository:REPOSITORY_SCOPE.repository,category:REPOSITORY_SCOPE.category,host:hostname(),lockAcquired:true,chromeReady:true,publicationAttempted:false}));
}catch(error){console.error(/^E_[A-Z_]+$/.test(error.message)?error.message:'E_INDEPENDENT_RUNTIME');process.exitCode=1;}
finally{if(lease)await releaseWriterLock(lease);}
