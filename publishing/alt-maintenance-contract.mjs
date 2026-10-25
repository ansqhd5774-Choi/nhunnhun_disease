import {createHash} from 'node:crypto';

// Pure preflight only. No editor, submission, ledger or network side effects.
export const ALT_OPERATION = 'image-alt-only-v1';
export const maintenanceHash = value => createHash('sha256').update(value).digest('hex');
const hash = /^[a-f0-9]{64}$/;
const fail = code => {throw new Error(code);};
const exactKeys = (o,keys) => !!o && typeof o==='object' && !Array.isArray(o) &&
  Object.keys(o).length===keys.length && keys.every(k=>Object.hasOwn(o,k));
function imageTags(html) {
  const result=[];
  // Reject ambiguous image text in comments/raw-text elements rather than select the wrong node.
  const inert=html.match(/<!--[\s\S]*?-->|<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)||[];
  if(inert.some(part=>/<img\b/i.test(part))) fail('E_ALT_IMAGE_MARKUP_AMBIGUOUS');
  // Quoted attribute values may contain >; do not terminate the tag there.
  for(const m of html.matchAll(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) result.push({start:m.index,tag:m[0]});
  return result;
}
function attributes(tag,name) {
  const matches=[];
  const pattern=/\s+([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
  for(const m of tag.matchAll(pattern)) if(m[1].toLowerCase()===name) {
    const token=m[2];
    if(!token || !/^["']/.test(token)) fail('E_ALT_ATTRIBUTE_QUOTING');
    matches.push({value:token.slice(1,-1),start:m.index,length:m[0].length});
  }
  if(matches.length>1) fail('E_ALT_ATTRIBUTE_AMBIGUOUS');
  return matches[0];
}
const escapeAlt = value => value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function validateAltMaintenance(request) {
  const keys=['operation','articleId','expectedTitle','expectedBodySha256','expectedMetadataSha256','patches'];
  if(!exactKeys(request,keys)||request.operation!==ALT_OPERATION) fail('E_ALT_OPERATION_SCHEMA');
  if(!/^\d+$/.test(request.articleId)||typeof request.expectedTitle!=='string'||!request.expectedTitle.trim()||request.expectedTitle.length>150||/[\r\n\x00-\x1f]/.test(request.expectedTitle)) fail('E_ALT_TARGET');
  if(!hash.test(request.expectedBodySha256)||!hash.test(request.expectedMetadataSha256)) fail('E_ALT_BASELINE_HASH');
  if(!Array.isArray(request.patches)||request.patches.length<1||request.patches.length>10) fail('E_ALT_PATCH_COUNT');
  const indices=new Set();
  for(const p of request.patches) {
    if(!exactKeys(p,['imageIndex','expectedSrcSha256','expectedAltRaw','newAlt'])) fail('E_ALT_PATCH_SCHEMA');
    if(!Number.isInteger(p.imageIndex)||p.imageIndex<0||indices.has(p.imageIndex)) fail('E_ALT_IMAGE_INDEX');
    indices.add(p.imageIndex);
    if(!hash.test(p.expectedSrcSha256)||!(p.expectedAltRaw===null||typeof p.expectedAltRaw==='string')) fail('E_ALT_IMAGE_CONDITION');
    if(typeof p.newAlt!=='string'||p.newAlt.trim()!==p.newAlt||p.newAlt.length<6||p.newAlt.length>300||/[\r\n\x00-\x1f]/.test(p.newAlt)) fail('E_ALT_TEXT');
  }
  return request;
}
export function applyAltMaintenance(originalHtml,metadata,request) {
  validateAltMaintenance(request);
  if(typeof originalHtml!=='string'||maintenanceHash(originalHtml)!==request.expectedBodySha256) fail('E_ALT_BODY_DRIFT');
  // Canonical metadata capture must include all five fields, not just fields readily visible.
  if(!exactKeys(metadata,['title','category','tags','representativeImage','visibility'])||
    metadata.title!==request.expectedTitle||!Array.isArray(metadata.tags)||
    !metadata.tags.every(t=>typeof t==='string')||typeof metadata.category!=='string'||
    typeof metadata.representativeImage!=='string'||typeof metadata.visibility!=='string') fail('E_ALT_METADATA_CAPTURE');
  if(maintenanceHash(JSON.stringify(metadata))!==request.expectedMetadataSha256) fail('E_ALT_METADATA_DRIFT');
  const images=imageTags(originalHtml), changes=[];
  for(const p of request.patches) {
    const image=images[p.imageIndex]; if(!image) fail('E_ALT_IMAGE_MISSING');
    const src=attributes(image.tag,'src'),alt=attributes(image.tag,'alt');
    if(!src||maintenanceHash(src.value)!==p.expectedSrcSha256) fail('E_ALT_IMAGE_SOURCE_DRIFT');
    if((alt?.value??null)!==p.expectedAltRaw) fail('E_ALT_OLD_VALUE_DRIFT');
    const replacement=' alt="'+escapeAlt(p.newAlt)+'"';
    const position=alt?alt.start:image.tag.search(/\/?\s*>$/);
    const length=alt?.length??0;
    const revised=image.tag.slice(0,position)+replacement+image.tag.slice(position+length);
    changes.push({start:image.start,end:image.start+image.tag.length,before:image.tag,after:revised});
  }
  let targetHtml=originalHtml;
  for(const c of changes.sort((a,b)=>b.start-a.start)) targetHtml=targetHtml.slice(0,c.start)+c.after+targetHtml.slice(c.end);
  return {targetHtml,originalBodySha256:request.expectedBodySha256,targetBodySha256:maintenanceHash(targetHtml),
    metadataSha256:request.expectedMetadataSha256,changedImages:changes.length,semanticVerification:'alt-visual-review-only',publicationEnabled:false};
}
