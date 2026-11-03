import {restoreNativeImageFigures} from './native-image-attachments.mjs';

// Repair a previously submitted Tistory post without uploading the same files
// again. The editor must contain the original standalone photos AND a known
// set of native attachment figures, otherwise fail before submission.
const FIGURE=/<figure\b[^>]*>[\s\S]*?<\/figure>/gi;
const IMAGE=/<img\b[^>]*>/gi;

function imageSource(tag){
  return tag.match(/\bsrc\s*=\s*(["'])([\s\S]*?)\1/i)?.[2]?.replace(/&amp;/g,'&')||'';
}

function decodeAlt(value){
  return String(value||'')
    .replace(/&middot;/gi,'·').replace(/&nbsp;/gi,' ').replace(/&bull;/gi,'•')
    .replace(/&quot;/gi,'"').replace(/&apos;|&#39;/gi,"'").replace(/&amp;/gi,'&')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([a-f0-9]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}

export function validateNativeReflow(spec){
  if(!spec||typeof spec!=='object'||Array.isArray(spec))throw Error('E_NATIVE_REFLOW_SCHEMA');
  if(Object.keys(spec).sort().join(',')!=='keepIndices,originalCount')throw Error('E_NATIVE_REFLOW_SCHEMA');
  if(!Number.isInteger(spec.originalCount)||spec.originalCount<3||spec.originalCount>20)throw Error('E_NATIVE_REFLOW_SCHEMA');
  if(!Array.isArray(spec.keepIndices)||spec.keepIndices.length<3||spec.keepIndices.length>spec.originalCount)throw Error('E_NATIVE_REFLOW_SCHEMA');
  if(!spec.keepIndices.every((n,i)=>Number.isInteger(n)&&n>=0&&n<spec.originalCount&&(i===0||n>spec.keepIndices[i-1])))throw Error('E_NATIVE_REFLOW_SCHEMA');
  return true;
}

// Some posts render uploaded figures publicly even though the edit session
// reopens with only the original standalone img tags. Guard that exact state,
// then upload the selected replacement photos afresh in the locked editor.
export function assertLegacyRepairBaseline(originalEditorHtml,spec,imageReview){
  validateNativeReflow(spec);
  const figures=[...String(originalEditorHtml).matchAll(FIGURE)].filter(match=>/<img\b/i.test(match[0]));
  const bare=[...String(originalEditorHtml).replace(FIGURE,'').matchAll(IMAGE)].map(m=>m[0]);
  if(figures.length!==0||bare.length!==spec.originalCount){
    throw Object.assign(Error('E_NATIVE_REFLOW_ORIGINAL_COUNTS'),{details:{nativeFigures:figures.length,bareImages:bare.length,expected:spec.originalCount}});
  }
  if(imageReview.length!==spec.keepIndices.length)throw Error('E_NATIVE_REFLOW_EXPECTED_PHOTOS');
  for(let i=0;i<imageReview.length;i++){
    const oldAlt=bare[spec.keepIndices[i]].match(/\balt\s*=\s*(["'])(.*?)\1/i)?.[2];
    if(!oldAlt||decodeAlt(oldAlt)!==imageReview[i].alt){
      throw Object.assign(Error('E_NATIVE_REFLOW_ALT_MISMATCH'),{
        details:{index:i,originalIndex:spec.keepIndices[i],originalAlt:oldAlt?.slice(0,110)||null,expectedAlt:imageReview[i].alt.slice(0,110)}
      });
    }
  }
  return true;
}

export function reflowExistingNative(html,originalEditorHtml,spec,representativeImageUrl){
  validateNativeReflow(spec);
  const figures=[...String(originalEditorHtml).matchAll(FIGURE)].map(match=>match[0]).filter(x=>/<img\b/i.test(x));
  const withoutFigures=String(originalEditorHtml).replace(FIGURE,'');
  const originalPhotos=[...withoutFigures.matchAll(IMAGE)].map(match=>match[0]);
  if(figures.length!==spec.originalCount||originalPhotos.length!==spec.originalCount){
    throw Object.assign(Error('E_NATIVE_REFLOW_ORIGINAL_COUNTS'),{
      details:{nativeFigures:figures.length,bareImages:originalPhotos.length,expected:spec.originalCount}
    });
  }
  const sources=[...String(html).matchAll(IMAGE)].map(m=>imageSource(m[0]));
  if(sources.length!==spec.keepIndices.length||sources.some(x=>!x)||new Set(sources).size!==sources.length)throw Error('E_NATIVE_REFLOW_SOURCE_IMAGES');
  const map=new Map();
  for(let i=0;i<spec.keepIndices.length;i++){
    const figure=figures[spec.keepIndices[i]];
    const path=imageSource(figure.match(/<img\b[^>]*>/i)?.[0]||'');
    let url;
    try{url=new URL(path);}catch{throw Error('E_NATIVE_REFLOW_ATTACHMENT_URL');}
    if(!url.hostname.endsWith('.kakaocdn.net')||/pc-image-censor|censoring/i.test(figure)||!url.pathname.startsWith('/dna/'))throw Error('E_NATIVE_REFLOW_ATTACHMENT_URL');
    map.set(sources[i],url.href);
  }
  const result=restoreNativeImageFigures(html,map,representativeImageUrl,originalEditorHtml);
  const resultFigures=[...result.matchAll(FIGURE)].length;
  const bareImages=[...result.replace(FIGURE,'').matchAll(IMAGE)].length;
  if(resultFigures!==spec.keepIndices.length||bareImages!==0)throw Error('E_NATIVE_REFLOW_OUTPUT');
  return result;
}
