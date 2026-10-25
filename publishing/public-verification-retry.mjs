const TRANSIENT_CODES=new Set([
  'E_BODY_UNVERIFIED',
  'E_IMAGE_UNVERIFIED',
  'E_REPRESENTATIVE_UNVERIFIED',
  'E_CONTENT_MOBILE_BODY',
  'E_PUBLIC_TITLE_MISMATCH',
  'E_PUBLIC_TITLE_METADATA_MISMATCH'
]);

export function isTransientPublicVerificationError(error){
  return TRANSIENT_CODES.has(String(error?.message||''));
}
export async function verifyPublicWithRetry({navigate,verify,attempts=5,delays=[1500,3000,5000,8000],sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),log=console.log}={}){
  if(typeof navigate!=='function'||typeof verify!=='function'||!Number.isInteger(attempts)||attempts<1)throw Error('E_PUBLIC_VERIFY_RETRY_CONFIG');
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    await navigate(attempt);
    try{
      const value=await verify(attempt);
      if(attempt>1)log('PUBLIC_VERIFY_RECOVERED '+JSON.stringify({attempt}));
      return value;
    }catch(error){
      lastError=error;
      const transient=isTransientPublicVerificationError(error);
      if(!transient||attempt===attempts)throw error;
      const delay=delays[Math.min(attempt-1,delays.length-1)]??0;
      log('PUBLIC_VERIFY_RETRY '+JSON.stringify({attempt,code:String(error?.message||'E_PUBLIC_VERIFY_UNKNOWN'),nextDelayMs:delay}));
      if(delay>0)await sleep(delay);
    }
  }
  throw lastError??Error('E_PUBLIC_VERIFY_RETRY_EXHAUSTED');
}
