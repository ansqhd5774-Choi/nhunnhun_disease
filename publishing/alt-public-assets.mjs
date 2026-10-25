// Read-only waits in the isolated public verification page. No page/body mutation.
export async function waitAltPublicAssets({fontTimeoutMs=15000,imageTimeoutMs=20000,phase="all"}={}){
  const bounded=async(promise,ms)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('E_ALT_PUBLIC_ASSET_OBSERVATION_TIMEOUT')),ms);})]);}finally{if(timer)clearTimeout(timer);}};
  if(!["all","font","images"].includes(phase))throw Error("E_ALT_PUBLIC_ASSET_OBSERVATION_CONTRACT");
  if(phase!=="images")await bounded(document.fonts?.ready??Promise.resolve(),fontTimeoutMs);
  if(phase==="font")return {fontsSettled:true,imageCount:null};
  const bodies=[...document.querySelectorAll('.contents_style')].filter(x=>x.getClientRects().length);
  if(bodies.length!==1)throw Error('E_ALT_PUBLIC_OBSERVATION_UNCONFIRMED');
  const images=[...bodies[0].querySelectorAll('img')];
  await bounded(Promise.all(images.map(image=>image.decode().catch(()=>null))),imageTimeoutMs);
  return {fontsSettled:true,imageCount:images.length};
}
