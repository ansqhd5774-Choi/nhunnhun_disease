import fs from 'node:fs';

const dispatchSource=String(process.env.DISPATCH_SOURCE_ID||'').trim();
const dispatchUrl=String(process.env.DISPATCH_PUBLIC_URL||'').trim();
const requestFile=process.env.RECOVERY_REQUEST_FILE||'automation/recover-publication-request.json';
let sourceId=dispatchSource, publicUrl=dispatchUrl;
if(!sourceId&&!publicUrl){
  const request=JSON.parse(fs.readFileSync(requestFile,'utf8'));
  sourceId=String(request.sourceId||'').trim();
  publicUrl=String(request.publicUrl||'').trim();
}
if(!/^direct-[a-z0-9-]+$/i.test(sourceId)) throw Error('E_RECOVERY_SOURCE_REQUIRED');
if(!/^https:\/\/nhunnhun\.tistory\.com\/\d+$/.test(publicUrl)) throw Error('E_RECOVERY_URL_REQUIRED');
const output=process.env.GITHUB_OUTPUT;
if(!output) throw Error('E_RECOVERY_OUTPUT_REQUIRED');
fs.appendFileSync(output,`source_id=${sourceId}\npublic_url=${publicUrl}\n`);
console.log(`RECOVERY_INPUTS_READY ${JSON.stringify({sourceId,publicUrl})}`);
