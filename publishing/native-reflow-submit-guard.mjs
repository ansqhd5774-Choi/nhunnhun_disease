// Fail closed on existing-post photo repairs. Never log a request body, an image
// URL, an authentication header, or the complete editor HTML.

export function extractSubmittedHtml(postData,contentType='') {
  if (typeof postData!=='string'||!postData.trim()) return null;
  if (/json/i.test(contentType)||postData.trimStart().startsWith('{')) {
    try {
      const payload=JSON.parse(postData);
      const source=payload?.content??payload?.post?.content??payload?.postContent??payload?.bodyHtml;
      return typeof source==='string'?source:null;
    } catch {return null;}
  }
  if (/urlencoded/i.test(contentType)||/(?:^|&)content=/.test(postData)) {
    try {
      const params=new URLSearchParams(postData);
      return params.get('content')??params.get('postContent')??params.get('bodyHtml');
    } catch {return null;}
  }
  return null;
}

export function assertNativeReflowOutbound(postData,contentType,expectedHtml) {
  const actual=extractSubmittedHtml(postData,contentType);
  if (actual===null) throw new Error('E_NATIVE_REFLOW_OUTBOUND_CONTENT_UNREADABLE');
  if (actual!==expectedHtml) throw new Error('E_NATIVE_REFLOW_OUTBOUND_CONTENT_MISMATCH');
  return true;
}

export function isTistoryWriterPost(requestUrl,method) {
  if (method!=='POST')return false;
  let url;
  try {url=new URL(requestUrl);} catch {return false;}
  return (url.hostname==='tistory.com'||url.hostname.endsWith('.tistory.com'))
    && !url.pathname.endsWith('/manage/post/attach.json');
}

// Install immediately before final submit, after photo and thumbnail uploads.
// All editor-origin POSTs to Tistory then require the exact intended document.
// An unexpected backend request is blocked, not guessed to be safe.
export async function installNativeReflowSubmitGuard(page,expectedHtml) {
  let observed=false;
  let approved=false;
  let failure=null;
  let resolveObserved;
  const observedPromise=new Promise(resolve=>{resolveObserved=resolve;});
  await page.route('**/*',async route=>{
    const request=route.request();
    if(!isTistoryWriterPost(request.url(),request.method())){
      await route.continue();
      return;
    }
    observed=true;
    try {
      assertNativeReflowOutbound(request.postData(),request.headers()['content-type']??'',expectedHtml);
      approved=true;
      resolveObserved();
      await route.continue();
    } catch(error) {
      failure=error.message;
      resolveObserved();
      await route.abort('blockedbyclient');
    }
  });
  return {
    async assertObserved(timeoutMs=15000){
      let timeout;
      try {
        await Promise.race([
          observedPromise,
          new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('E_NATIVE_REFLOW_OUTBOUND_NOT_SEEN')),timeoutMs);})
        ]);
      } finally {clearTimeout(timeout);}
      if(!observed||!approved||failure)throw new Error(failure||'E_NATIVE_REFLOW_OUTBOUND_BLOCKED');
      return true;
    }
  };
}
