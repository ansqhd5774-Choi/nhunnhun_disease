import {observeUpdateStage} from './update-observation.mjs';
import {loadAltPublicImages,normalizeAltObservationError} from './alt-public-image-load.mjs';
import {waitAltPublicAssets} from './alt-public-assets.mjs';
import {ALT_MACRO_OPERATION,publicAssetIdentity} from './alt-macro-contract.mjs';
import {parseImageGridMacros as parsePlainImageMacros} from './alt-image-grid-contract.mjs';
import {maintenanceHash} from './alt-maintenance-contract.mjs';
import {verificationContext} from './verification-context.mjs';
import {altFingerprint} from './alt-maintenance-source.mjs';
import {ogAsset} from './verify-updated-public.mjs';
import {nativeTextStructureHash} from './native-text-structure.mjs';

export function assertAltBaselineMetadata(publicMetadata,editorMetadata){
  const match=editorMetadata.representativeImage.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
  const tags=publicMetadata.tags.map(x=>x[0].replace(/^#/,''));
  if(publicMetadata.title!==editorMetadata.title||publicMetadata.category?.[0]!==editorMetadata.category||
    tags.length!==editorMetadata.tags.length||new Set(tags).size!==tags.length||
    JSON.stringify([...tags].sort())!==JSON.stringify([...editorMetadata.tags].sort())||
    editorMetadata.visibility!=='20'||!match)throw Error('E_ALT_PUBLIC_METADATA_BASELINE');
  try{if(ogAsset(match[1])!==ogAsset(publicMetadata.representative))throw Error('mismatch');}
  catch{throw Error('E_ALT_PUBLIC_REPRESENTATIVE_BASELINE');}
}

export function assertAltPublicSnapshot(actual,baseline,patches){
  if(!baseline||actual.bodySha256!==baseline.bodySha256||actual.metadataSha256!==baseline.metadataSha256||
    actual.images.length!==baseline.images.length||actual.overflowPx!==0)throw Error('E_ALT_PUBLIC_BODY_DRIFT');
  const changed=new Map(patches.map(p=>[p.publicIndex,p.newAlt]));
  if(changed.size!==patches.length)throw Error('E_ALT_PUBLIC_MAPPING');
  actual.images.forEach((image,i)=>{
    if(!image.loaded||image.srcSha256!==baseline.images[i].srcSha256||image.assetSha256!==baseline.images[i].assetSha256)throw Error('E_ALT_PUBLIC_IMAGE_DRIFT');
    const expected=changed.has(i)?maintenanceHash(JSON.stringify(changed.get(i))):baseline.images[i].altSha256;
    if(image.altSha256!==expected)throw Error('E_ALT_PUBLIC_ALT_MISMATCH');
  });
  return {images:actual.images.length,changedAlt:patches.length,overflowPx:0,semanticVerification:'alt-visual-review-only'};
}
// Legacy skin fills only an absent/empty alt with provider data-filename.
// Preserve exact src and every explicit provider alt; this is not asset equivalence.
export function assertAltDeliveredRender(delivered,rendered){
 if(delivered.length!==rendered.length)throw Error('E_ALT_PUBLIC_SOURCE_RENDER_MISMATCH');
 rendered.forEach((image,index)=>{const provider=delivered[index];
   const filenameFallback=(provider.alt===null||provider.alt==='')&&typeof provider.filename==='string'&&provider.filename.length>0&&image.alt===provider.filename;
   if(image.src!==provider.src||image.alt!==provider.alt&&!filenameFallback)throw Error('E_ALT_PUBLIC_SOURCE_RENDER_MISMATCH');
 });
}
export async function captureAltSnapshot(browser,source,width,originalHtml,{log=console.log,includeTextSnapshot=false}={}){
  const step=(name,action,options={})=>observeUpdateStage('public-'+width+'-'+name,action,{...options,log});
  const context=await step('context-create',()=>verificationContext(browser,{viewport:{width,height:1000}}));
  try{
    const page=await step('page-create',()=>context.newPage());
    const response=await step('navigation',()=>page.goto(source.targetUrl,{waitUntil:'domcontentloaded',timeout:30000}));
    if(!response?.ok()||new URL(page.url()).pathname!==`/${source.articleId}`)throw Error('E_ALT_PUBLIC_ACCESS');
    const responseHtml=await step('response-text',()=>response.text(),{safeReadOnly:true,timeoutMs:15000});
    await step('body-visible',()=>page.locator('.contents_style').waitFor({state:'visible',timeout:15000}),{safeReadOnly:true,timeoutMs:20000});
    await step('font-wait',()=>page.evaluate(waitAltPublicAssets,{phase:'font'}),{safeReadOnly:true,timeoutMs:20000});
    await step('images-wait',()=>loadAltPublicImages(page,{log}));
    const observed=await step('dom-observe',()=>page.evaluate(({original,responseHtml,includeTextSnapshot})=>{
      const bodies=[...document.querySelectorAll('.contents_style')].filter(x=>x.getClientRects().length);
      if(bodies.length!==1)return null;
      const body=bodies[0];
      const images=[...body.querySelectorAll('img')];
      // Compare provider-delivered article markup, not skin/advertising DOM inserted later.
      // Rendered image loading and alt/src are independently checked below.
      const delivered=new DOMParser().parseFromString(responseHtml,'text/html');
      const deliveredBodies=[...delivered.querySelectorAll('.contents_style')];
      if(deliveredBodies.length!==1)return null;
      const clone=deliveredBodies[0].cloneNode(true);
      const deliveredImages=[...clone.querySelectorAll('img')].map(x=>({src:x.getAttribute('src'),alt:x.getAttribute('alt'),filename:x.getAttribute('data-filename')}));
      clone.querySelectorAll('img').forEach(x=>x.removeAttribute('alt'));
      const title=document.querySelector('meta[property="og:title"]')?.content;
      const representative=document.querySelector('meta[property="og:image"]')?.content;
      const categoryLinks=[...document.querySelectorAll('.hd .meta-cate a')];
      const category=categoryLinks.length===1?[categoryLinks[0].textContent.trim(),categoryLinks[0].getAttribute('href')]:null;
      const tags=[...document.querySelectorAll('.entry-tag a')].map(a=>[a.textContent.trim(),a.getAttribute('href')]);
      let text,textStructure;
      if(includeTextSnapshot){
        const textClone=clone.cloneNode(true);textClone.querySelectorAll('style,script').forEach(x=>x.remove());
        const structureClone=clone.cloneNode(true);
        const removeText=node=>{for(const child of [...node.childNodes]){if(child.nodeType===3){if(!['STYLE','SCRIPT'].includes(node.nodeName))child.remove();}else removeText(child);}};
        removeText(structureClone);text=textClone.textContent.replace(/\s+/g,'').normalize('NFC');textStructure=structureClone.innerHTML;
      }
      return {body:clone.innerHTML,text,textStructure,metadata:{title,representative,category,tags},
        deliveredImages,
        images:images.map(x=>({src:x.getAttribute('src'),alt:x.getAttribute('alt'),loaded:x.complete&&x.naturalWidth>0})),
        editorImages:original?[...new DOMParser().parseFromString(original,'text/html').querySelectorAll('img')].map(x=>({src:x.getAttribute('src')})):null,
        overflowPx:Math.max(0,document.documentElement.scrollWidth-innerWidth)};
    },{original:originalHtml||null,responseHtml,includeTextSnapshot}),{safeReadOnly:true,timeoutMs:15000});
    // Missing metadata is unknown, not evidence of preservation.
    if(!observed?.metadata.title||!observed.metadata.representative||!observed.metadata.category||!observed.metadata.tags.length||!observed.images.length)throw Error('E_ALT_PUBLIC_OBSERVATION_UNCONFIRMED');
    if(observed.metadata.title!==source.title)throw Error('E_ALT_PUBLIC_TITLE');
    assertAltDeliveredRender(observed.deliveredImages,observed.images);
    return {bodySha256:maintenanceHash(observed.body),metadataSha256:maintenanceHash(JSON.stringify(observed.metadata)),
      observedMetadata:observed.metadata,
      images:observed.images.map(x=>({srcSha256:maintenanceHash(x.src||''),altSha256:maintenanceHash(JSON.stringify(x.alt)),loaded:x.loaded,...(source.operation===ALT_MACRO_OPERATION?{assetSha256:maintenanceHash(publicAssetIdentity(x.src))}:{})})),
      editorImages:observed.editorImages?.map(x=>maintenanceHash(x.src||'')),overflowPx:observed.overflowPx,...(includeTextSnapshot?{providerBody:observed.body,publicTextSha256:maintenanceHash(observed.text),publicTextStructureSha256:nativeTextStructureHash(observed.textStructure)}:{})};
  }catch(error){throw normalizeAltObservationError(error);}finally{await step('context-close',()=>context.close());}
}
export async function captureAltBaseline(browser,originalHtml,source,editorMetadata){
  const desktop=await captureAltSnapshot(browser,source,1440,originalHtml);
  const mobile=await captureAltSnapshot(browser,source,390,originalHtml);
  assertAltBaselineMetadata(desktop.observedMetadata,editorMetadata);
  assertAltBaselineMetadata(mobile.observedMetadata,editorMetadata);
  // Fail closed on unstable provider markup or metadata before staging.
  assertAltPublicSnapshot(await captureAltSnapshot(browser,source,1440),desktop,[]);
  assertAltPublicSnapshot(await captureAltSnapshot(browser,source,390),mobile,[]);
  const macroImages=source.operation===ALT_MACRO_OPERATION?parsePlainImageMacros(originalHtml):null;
  if(macroImages)for(const snapshot of [desktop,mobile]){
    if(macroImages.length!==snapshot.images.length||new Set(snapshot.images.map(x=>x.assetSha256)).size!==macroImages.length||macroImages.some((x,i)=>maintenanceHash(x.asset)!==snapshot.images[i].assetSha256))throw Error('E_ALT_MACRO_PUBLIC_MAPPING');
  }
  const patches=source.maintenance.patches.map(p=>{
    if(macroImages){if(!macroImages[p.imageIndex])throw Error('E_ALT_PUBLIC_MAPPING');return {publicIndex:p.imageIndex,newAlt:p.newAlt};}
    const src=desktop.editorImages?.[p.imageIndex];
    const matches=desktop.images.flatMap((x,i)=>x.srcSha256===src?[i]:[]);
    if(!src||matches.length!==1||mobile.images[matches[0]]?.srcSha256!==src)throw Error('E_ALT_PUBLIC_MAPPING');
    return {publicIndex:matches[0],newAlt:p.newAlt};
  });
  for(const snap of [desktop,mobile]){
    if(snap.overflowPx!==0||snap.images.some(x=>!x.loaded))throw Error('E_ALT_PUBLIC_BASELINE_FAILED');
    delete snap.editorImages;
    delete snap.observedMetadata;
  }
  return {version:'alt-public-baseline-v1',desktop,mobile,patches,...(macroImages?{macroMapping:{version:'macro-asset-map-v1',assetSha256s:desktop.images.map(x=>x.assetSha256)}}:{})};
}
export async function finalizeAltMaintenance(source,{ledger,browser,now=()=>new Date().toISOString(),captureSnapshot=captureAltSnapshot}){
  const state=await ledger.read(source.id);
  if(!state||!['submitting','updated'].includes(state.phase)||state.operation!==source.operation||state.fingerprint!==altFingerprint(source)||state.url!==source.targetUrl||state.baseline?.version!=='alt-public-baseline-v1')throw Error('E_ALT_LEDGER');
  if(state.originalBodySha256!==source.maintenance.expectedBodySha256||state.metadataSha256!==source.maintenance.expectedMetadataSha256||
    !/^[a-f0-9]{64}$/.test(state.targetBodySha256||'')||
    state.baseline.patches?.length!==source.maintenance.patches.length||
    state.baseline.patches.some((p,i)=>p.newAlt!==source.maintenance.patches[i].newAlt))throw Error('E_ALT_LEDGER_CONDITIONS');
  if(source.operation===ALT_MACRO_OPERATION){const map=state.baseline.macroMapping;if(map?.version!=='macro-asset-map-v1'||!Array.isArray(map.assetSha256s)||map.assetSha256s.length!==state.baseline.desktop.images.length||state.baseline.patches.some((p,i)=>p.publicIndex!==source.maintenance.patches[i].imageIndex)||[state.baseline.desktop,state.baseline.mobile].some(s=>s.images.some((x,i)=>x.assetSha256!==map.assetSha256s[i])))throw Error('E_ALT_LEDGER_CONDITIONS');}
  const {sha,...record}=state;
  let verification;
  try{
    verification={desktop:assertAltPublicSnapshot(await captureSnapshot(browser,source,1440),state.baseline.desktop,state.baseline.patches),
      mobile:assertAltPublicSnapshot(await captureSnapshot(browser,source,390),state.baseline.mobile,state.baseline.patches)};
  }catch(error){
    const code=/^E_ALT_[A-Z_]+$/.test(error.message)?error.message:'E_ALT_PUBLIC_ACCESS';
    const status=/ACCESS|OBSERVATION/.test(code)?'PUBLIC_VERIFICATION_UNAVAILABLE':'PUBLIC_VERIFICATION_MISMATCH';
    await ledger.write(source.id,{...record,publicResult:{status,code,checkedAt:now()}},sha);
    return {status,code};
  }
  await ledger.write(source.id,{...record,phase:'updated',verification,publicResult:{status:'PUBLIC_VERIFIED',checkedAt:now(),semanticVerification:'alt-visual-review-only'}},sha);
  return {status:'PUBLIC_VERIFIED',verification};
}
