import {ALT_MACRO_OPERATION,parsePlainImageMacros,macroAssetIdentity,publicAssetIdentity,validateMacroMaintenance} from './alt-macro-contract.mjs';
import {maintenanceHash} from './alt-maintenance-contract.mjs';
const fail=code=>{throw Error(code);};
const escapeAlt=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function attributeParts(text){
  let quoted=false,start=0;const parts=[];
  for(let i=0;i<text.length;i++){if(text[i]==='"')quoted=!quoted;else if(text[i]===','&&!quoted){parts.push({text:text.slice(start,i),start});start=i+1;}}
  if(quoted)fail('E_ALT_GRID_ATTRIBUTE_QUOTING');parts.push({text:text.slice(start),start});return parts;
}
function gridFields(text){
  const fields=new Map();let end=0;
  for(const m of text.matchAll(/([a-z][a-z0-9-]*)\s*=\s*("[^"]*")/g)){
    if(text.slice(end,m.index).trim()||fields.has(m[1]))fail('E_ALT_GRID_ATTRIBUTES');
    const token=m[2],start=m.index+m[0].lastIndexOf(token);fields.set(m[1],{value:token.slice(1,-1),start,end:start+token.length});end=m.index+m[0].length;
  }
  if(text.slice(end).trim())fail('E_ALT_GRID_ATTRIBUTES');
  const required=['data-is-animation','data-origin-width','data-origin-height','data-filename','data-widthpercent','style'];
  if(required.some(k=>!fields.has(k))||[...fields.keys()].some(k=>!required.includes(k)&&k!=='alt'))fail('E_ALT_GRID_FIELDS');
  if(!/^(true|false)$/.test(fields.get('data-is-animation').value)||['data-origin-width','data-origin-height'].some(k=>!/^\d+$/.test(fields.get(k).value)||Number(fields.get(k).value)<=0)||!/^\d+(?:\.\d+)?$/.test(fields.get('data-widthpercent').value)||Number(fields.get('data-widthpercent').value)<=0||Number(fields.get('data-widthpercent').value)>100)fail('E_ALT_GRID_FIELDS');
  return fields;
}
// Separate support: the existing plain-Image parser and its refusal rules remain unchanged.
export function parseImageGridMacros(html){
  if(typeof html!=='string'||/<img\b/i.test(html)||/\[##_(?!Image(?:Grid)?\|)[A-Za-z0-9]+\|/.test(html))fail('E_ALT_MACRO_MIXED_UNSUPPORTED');
  if((html.match(/<!--[\s\S]*?-->|<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)||[]).some(x=>/\[##_Image(?:Grid)?\|/.test(x)))fail('E_ALT_MACRO_AMBIGUOUS');
  const images=[];let matched=0;
  for(const m of html.matchAll(/\[##_(ImageGrid|Image)\|([\s\S]*?)_##\]/g)){
    matched++;if(m[1]==='Image'){
      const [plain]=parsePlainImageMacros(m[0]);images.push({...plain,start:plain.start+m.index,end:plain.end+m.index,jsonStart:plain.jsonStart+m.index,kind:'Image'});continue;
    }
    const p=m[2].split('|');if(p.length!==3)fail('E_ALT_GRID_FORMAT');
    const sources=p[0].split(','),attrs=attributeParts(p[1]);if(sources.length<2||sources.length!==attrs.length)fail('E_ALT_GRID_COUNT');
    const attrStart=m.index+'[##_ImageGrid|'.length+p[0].length+1;
    for(let i=0;i<sources.length;i++)images.push({kind:'ImageGrid',start:m.index,end:m.index+m[0].length,reference:sources[i],asset:macroAssetIdentity(sources[i]),attributeText:attrs[i].text,attributeStart:attrStart+attrs[i].start,fields:gridFields(attrs[i].text)});
  }
  if(!images.length||matched!==(html.match(/\[##_Image(?:Grid)?\|/g)||[]).length)fail('E_ALT_MACRO_FORMAT');
  if(new Set(images.map(x=>x.asset)).size!==images.length)fail('E_ALT_MACRO_ASSET_AMBIGUOUS');return images;
}
export function assertImageGridPublicMapping(html,publicSources){
  const images=parseImageGridMacros(html);if(!Array.isArray(publicSources)||images.length!==publicSources.length)fail('E_ALT_MACRO_PUBLIC_MAPPING');
  const ids=publicSources.map(publicAssetIdentity);if(new Set(ids).size!==ids.length||images.some((x,i)=>x.asset!==ids[i]))fail('E_ALT_MACRO_PUBLIC_MAPPING');
  return images.map((x,i)=>({imageIndex:i,publicIndex:i,assetSha256:maintenanceHash(x.asset)}));
}
function assertMetadata(metadata,request){
  const keys=['title','category','tags','representativeImage','visibility'];
  if(!metadata||Object.keys(metadata).length!==keys.length||keys.some(k=>!Object.hasOwn(metadata,k))||metadata.title!==request.expectedTitle||metadata.visibility!=='20'||typeof metadata.category!=='string'||typeof metadata.representativeImage!=='string'||!Array.isArray(metadata.tags)||!metadata.tags.every(x=>typeof x==='string'))fail('E_ALT_METADATA_CAPTURE');
  if(maintenanceHash(JSON.stringify(metadata))!==request.expectedMetadataSha256)fail('E_ALT_METADATA_DRIFT');
}
function oldAltRaw(image){const a=image.fields.get('alt');return a?(image.kind==='Image'?image.json:image.attributeText).slice(a.start,a.end):null;}
function nonAltFields(image){return [...image.fields].filter(([k])=>k!=='alt').map(([k,v])=>[k,v.value]);}
export function applyImageGridAltMaintenance(html,metadata,request,publicSources){
  validateMacroMaintenance(request);if(maintenanceHash(html)!==request.expectedBodySha256)fail('E_ALT_BODY_DRIFT');assertMetadata(metadata,request);assertImageGridPublicMapping(html,publicSources);
  const images=parseImageGridMacros(html),changes=[];
  for(const p of request.patches){
    if(/[|]|_##\]/.test(p.newAlt))fail('E_ALT_MACRO_DELIMITER');const image=images[p.imageIndex];if(!image)fail('E_ALT_IMAGE_MISSING');
    if(maintenanceHash(image.reference)!==p.expectedSrcSha256)fail('E_ALT_IMAGE_SOURCE_DRIFT');if(oldAltRaw(image)!==p.expectedAltRaw)fail('E_ALT_OLD_VALUE_DRIFT');const alt=image.fields.get('alt');
    if(image.kind==='Image')changes.push({start:image.jsonStart+(alt?alt.start:image.close),length:alt?alt.end-alt.start:0,replacement:alt?JSON.stringify(p.newAlt):',"alt":'+JSON.stringify(p.newAlt)});
    else changes.push({start:image.attributeStart+(alt?alt.start:image.attributeText.length),length:alt?alt.end-alt.start:0,replacement:alt?'"'+escapeAlt(p.newAlt)+'"':' alt="'+escapeAlt(p.newAlt)+'"'});
  }
  let targetHtml=html;for(const c of changes.sort((a,b)=>b.start-a.start))targetHtml=targetHtml.slice(0,c.start)+c.replacement+targetHtml.slice(c.start+c.length);
  const revised=parseImageGridMacros(targetHtml);
  if(revised.length!==images.length||revised.some((x,i)=>x.kind!==images[i].kind||x.reference!==images[i].reference||JSON.stringify(nonAltFields(x))!==JSON.stringify(nonAltFields(images[i]))))fail('E_ALT_MACRO_DIFF');
  // Reverse precisely the inserted/replaced tokens: no other byte may change.
  let restored=targetHtml;let shift=0;const shifted=[...changes].sort((a,b)=>a.start-b.start).map(c=>{const result={...c,revisedStart:c.start+shift};shift+=c.replacement.length-c.length;return result;});
  for(const c of shifted.reverse())restored=restored.slice(0,c.revisedStart)+html.slice(c.start,c.start+c.length)+restored.slice(c.revisedStart+c.replacement.length);
  if(restored!==html||maintenanceHash(restored)!==request.expectedBodySha256)fail('E_ALT_MACRO_DIFF');
  return {targetHtml,originalBodySha256:request.expectedBodySha256,targetBodySha256:maintenanceHash(targetHtml),metadataSha256:request.expectedMetadataSha256,changedImages:changes.length,semanticVerification:'alt-visual-review-only',publicationEnabled:false};
}
export function applyMappedImageGridAlt(html,metadata,request,proof){
  const images=parseImageGridMacros(html);
  if(proof?.version!=='macro-asset-map-v1'||!Array.isArray(proof.assetSha256s)||proof.assetSha256s.length!==images.length||new Set(proof.assetSha256s).size!==images.length||images.some((x,i)=>maintenanceHash(x.asset)!==proof.assetSha256s[i]))fail('E_ALT_MACRO_PUBLIC_MAPPING');
  return applyImageGridAltMaintenance(html,metadata,request,images.map(x=>'https://blog.kakaocdn.net/dn/'+x.asset.slice('kakaocdn-asset:'.length)));
}
export function draftImageGridAltSource(html,metadata,patch,publicSources,id){
  if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id||''))fail('E_ALT_MACRO_SOURCE_ID');assertImageGridPublicMapping(html,publicSources);const image=parseImageGridMacros(html)[patch.imageIndex];if(!image)fail('E_ALT_IMAGE_MISSING');
  const maintenance={operation:ALT_MACRO_OPERATION,articleId:patch.articleId,expectedTitle:metadata.title,expectedBodySha256:maintenanceHash(html),expectedMetadataSha256:maintenanceHash(JSON.stringify(metadata)),patches:[{imageIndex:patch.imageIndex,expectedSrcSha256:maintenanceHash(image.reference),expectedAltRaw:oldAltRaw(image),newAlt:patch.newAlt}]};
  applyImageGridAltMaintenance(html,metadata,maintenance,publicSources);
  return {id,articleId:patch.articleId,targetUrl:'https://nhunnhun.tistory.com/'+patch.articleId,expectedCurrentTitle:metadata.title,title:metadata.title,status:'draft',approved:false,operation:ALT_MACRO_OPERATION,maintenance};
}
