// Preserve Tistory's editor-created attachment figure. A bare signed
// blog.kakaocdn.net URL is temporary and does not keep the attachment alive.
const IMAGE_FIGURE_RE=/<figure\b[^>]*>[\s\S]*?<\/figure>/gi;
const IMAGE_TAG_RE=/<img\b[^>]*>/i;
const PHOTO_STYLE='width:100% !important;height:auto !important;max-height:420px !important;object-fit:contain !important;display:block !important;margin:0 auto !important';

function decodedAmpersands(value){
  return String(value).replace(/&amp;|&#38;|&#x26;/gi,'&');
}

function attribute(tag,name){
  const match=tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,'i'));
  return match?.[2]??'';
}

function escapedAttribute(value){
  return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

export function restoreNativeImageFigures(html,imageMap,representativeSource,editorHtml){
  const allFigures=[...String(editorHtml).matchAll(IMAGE_FIGURE_RE)].map(match=>match[0]);
  const figures=allFigures.filter(figure=>IMAGE_TAG_RE.test(figure));
  const used=new Set();
  const resolved=new Map();
  for(const [source,uploadedUrl] of imageMap){
    let uploadedPath;
    try{ uploadedPath=new URL(uploadedUrl).pathname; }
    catch{ throw new Error('E_UPDATE_IMAGE_NATIVE_URL'); }
    if(!uploadedPath || !uploadedPath.startsWith('/')) throw new Error('E_UPDATE_IMAGE_NATIVE_URL');
    const matches=figures.map((figure,index)=>({figure,index})).filter(({figure})=>
      decodedAmpersands(figure).includes(uploadedPath)
    );
    if(matches.length!==1 || used.has(matches[0].index)) {
      throw new Error('E_UPDATE_IMAGE_NATIVE_FIGURE');
    }
    const match=matches[0];
    if(!/\bdata-ke-type\s*=\s*["']image["']|\bdata-origin-width\s*=|\bimageblock\b|\bdata-phocus\s*=/.test(match.figure)) {
      throw new Error('E_UPDATE_IMAGE_NATIVE_METADATA');
    }
    used.add(match.index);
    resolved.set(source,match.figure);
  }

  let imageCount=0;
  const result=String(html).replace(/<img\b[^>]*>/gi,original=>{
    const source=attribute(original,'src');
    const nativeFigure=resolved.get(source);
    if(!nativeFigure) throw new Error('E_UPDATE_IMAGE_MAPPING');
    const nativeImage=nativeFigure.match(IMAGE_TAG_RE)?.[0];
    if(!nativeImage) throw new Error('E_UPDATE_IMAGE_NATIVE_FIGURE');
    const alt=attribute(original,'alt');
    if(!alt.trim()) throw new Error('E_UPDATE_IMAGE_ALT');
    let tag=nativeImage.replace(/\s(?:alt|style|loading|decoding|fetchpriority)\s*=\s*(["']).*?\1/gi,'');
    const priority=source===representativeSource || imageCount===0;
    tag=tag.replace(/\s*\/?>$/,
      ` alt="${escapedAttribute(alt)}" style="${PHOTO_STYLE}" loading="${priority?'eager':'lazy'}" decoding="async"${priority?' fetchpriority="high"':''}>`);
    imageCount++;
    return nativeFigure.replace(nativeImage,tag);
  });
  if(imageCount!==imageMap.size || used.size!==imageMap.size) throw new Error('E_UPDATE_IMAGE_NATIVE_COUNT');
  return result;
}
