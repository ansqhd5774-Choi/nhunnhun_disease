import {observeUpdateStage} from './update-observation.mjs';
// Only scroll the owned anonymous verification page. Never alter image attributes.
export function normalizeAltObservationError(error){
 const code=String(error?.message??'').match(/\b(E_ALT_PUBLIC_(?:ASSET_OBSERVATION_TIMEOUT|IMAGE_LOAD_FAILED|OBSERVATION_UNCONFIRMED))\b/)?.[1];
 return code?Object.assign(Error(code),{cause:error}):error;
}
export async function observeAltImageLoad(image,{timeoutMs}){
 const bounded=async(p)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('E_ALT_PUBLIC_ASSET_OBSERVATION_TIMEOUT')),timeoutMs);})]);}finally{clearTimeout(timer);}};
 if(!image.complete){let cleanup;try{await bounded(new Promise(resolve=>{const done=()=>resolve();cleanup=()=>{image.removeEventListener('load',done);image.removeEventListener('error',done);};image.addEventListener('load',done);image.addEventListener('error',done);if(image.complete)done();}));}finally{cleanup?.();}}
 if(!image.complete||image.naturalWidth<=0)throw Error('E_ALT_PUBLIC_IMAGE_LOAD_FAILED');
 try{await bounded(image.decode());}catch(error){if(error.message==='E_ALT_PUBLIC_ASSET_OBSERVATION_TIMEOUT')throw error;throw Error('E_ALT_PUBLIC_IMAGE_LOAD_FAILED');}
 if(!image.complete||image.naturalWidth<=0)throw Error('E_ALT_PUBLIC_IMAGE_LOAD_FAILED');
 return {lazy:image.loading==='lazy',loaded:true};
}
export async function loadAltPublicImages(page,{log=console.log,budgetMs=90000,imageTimeoutMs=15000,now=Date.now}={}){
 const start=now();const remaining=()=>{const value=budgetMs-(now()-start);if(value<=0)throw Error('E_ALT_PUBLIC_ASSET_OBSERVATION_TIMEOUT');return Math.min(imageTimeoutMs,value);};
 const read=(stage,action)=>observeUpdateStage(stage,action,{log,safeReadOnly:true,timeoutMs:remaining()});
 const body=page.locator('.contents_style:visible');if(await read('image-body-count',()=>body.count())!==1)throw Error('E_ALT_PUBLIC_OBSERVATION_UNCONFIRMED');
 const images=body.locator('img');const count=await read('image-count',()=>images.count());
 const original=await read('image-scroll-position',()=>page.evaluate(()=>({x:scrollX,y:scrollY})));
 try{for(let index=0;index<count;index++){
   const image=images.nth(index);log('ALT_IMAGE_OBSERVATION '+JSON.stringify({index,count,state:'start'}));
   await observeUpdateStage('image-scroll',()=>image.scrollIntoViewIfNeeded({timeout:remaining()}),{log});
   let state;try{state=await read('image-load-read',()=>image.evaluate(observeAltImageLoad,{timeoutMs:remaining()}));}catch(error){throw normalizeAltObservationError(error);}
   log('ALT_IMAGE_OBSERVATION '+JSON.stringify({index,count,...state,state:'done'}));
 }if(await read('image-count-final',()=>images.count())!==count)throw Error('E_ALT_PUBLIC_OBSERVATION_UNCONFIRMED');}
 finally{await observeUpdateStage('image-scroll-restore',()=>page.evaluate(({x,y})=>scrollTo({left:x,top:y,behavior:'instant'}),original),{log});}
 return {imageCount:count};
}
