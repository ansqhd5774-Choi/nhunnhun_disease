import {maintenanceHash,validateAltMaintenance,ALT_OPERATION} from './alt-maintenance-contract.mjs';
export const ALT_MACRO_OPERATION='image-alt-macro-only-v1';
const fail=code=>{throw Error(code);};
// Native Image metadata must remain byte-for-byte unchanged outside the alt token.
function jsonFields(text){
  let i=0;const fields=new Map();const ws=()=>{while(/\s/.test(text[i]||'')&&i<text.length)i++;};
  const string=()=>{const start=i;if(text[i++]!=='"')fail('E_ALT_MACRO_JSON');let escape=false;while(i<text.length){const c=text[i++];if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c==='"'){try{return {start,end:i,value:JSON.parse(text.slice(start,i))};}catch{fail('E_ALT_MACRO_JSON');}}}fail('E_ALT_MACRO_JSON');};
  ws();if(text[i++]!=='{')fail('E_ALT_MACRO_JSON');ws();
  while(text[i]!=='}'){
    const key=string().value;if(fields.has(key))fail('E_ALT_MACRO_DUPLICATE_FIELD');ws();if(text[i++]!==':')fail('E_ALT_MACRO_JSON');ws();
    const start=i;let value,end;if(text[i]==='"'){const v=string();value=v.value;end=v.end;}else{const m=text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);if(!m)fail('E_ALT_MACRO_JSON');i+=m[0].length;end=i;value=Number(m[0]);if(!Number.isFinite(value))fail('E_ALT_MACRO_JSON');}
    fields.set(key,{start,end,value});ws();if(text[i]===','){i++;ws();if(text[i]==='}')fail('E_ALT_MACRO_JSON');}else if(text[i]!=='}')fail('E_ALT_MACRO_JSON');
  }
  const close=i++;ws();if(i!==text.length)fail('E_ALT_MACRO_JSON');
  const required={originWidth:'number',originHeight:'number',style:'string',filename:'string'};
  const optional={width:'number',height:'number',alt:'string',caption:'string'};
  for(const [key,type] of Object.entries(required))if(typeof fields.get(key)?.value!==type)fail('E_ALT_MACRO_FIELDS');
  for(const [key,v] of fields)if(!(key in required)&&!(key in optional)||typeof v.value!==(required[key]||optional[key]))fail('E_ALT_MACRO_FIELDS');
  return {fields,close};
}
export function macroAssetIdentity(reference){
  const decoded=reference.replaceAll('&amp;','&');const m=decoded.match(/^kage@([A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+)(?:\?[^\r\n]*)?$/);
  if(!m||m[1].includes('..'))fail('E_ALT_MACRO_ASSET');return 'kakaocdn-asset:'+m[1];
}
export function publicAssetIdentity(value){
  let u;try{u=new URL(value);}catch{fail('E_ALT_MACRO_ASSET');}
  for(let n=0;n<4;n++){
    if(u.protocol!=='https:'||u.username||u.password)fail('E_ALT_MACRO_ASSET');
    if(u.hostname==='blog.kakaocdn.net'&&/^\/(?:dn|dna)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(u.pathname)&&!u.pathname.includes('..'))return 'kakaocdn-asset:'+u.pathname.replace(/^\/(?:dn|dna)\//,'');
    if(!(u.hostname==='daumcdn.net'||u.hostname.endsWith('.daumcdn.net'))||!u.searchParams.has('fname'))fail('E_ALT_MACRO_ASSET');
    try{u=new URL(u.searchParams.get('fname'));}catch{fail('E_ALT_MACRO_ASSET');}
  }fail('E_ALT_MACRO_ASSET');
}
export function parsePlainImageMacros(html){
  if(typeof html!=='string'||/<img\b/i.test(html)||/\[##_(?!Image\|)[A-Za-z0-9]+\|/.test(html))fail('E_ALT_MACRO_MIXED_UNSUPPORTED');
  if((html.match(/<!--[\s\S]*?-->|<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)||[]).some(x=>/\[##_Image\|/.test(x)))fail('E_ALT_MACRO_AMBIGUOUS');
  const images=[];
  for(const m of html.matchAll(/\[##_Image\|([\s\S]*?)_##\]/g)){
    const parts=m[1].split('|');if(parts.length!==4||parts[1]!=='CDM'||parts[2]!=='1.3')fail('E_ALT_MACRO_FORMAT');
    const json=parts[3],parsed=jsonFields(json);const jsonStart=m.index+"[##_Image|".length+parts[0].length+1+parts[1].length+1+parts[2].length+1;
    images.push({start:m.index,end:m.index+m[0].length,reference:parts[0],asset:macroAssetIdentity(parts[0]),json,jsonStart,...parsed});
  }
  if(!images.length||images.length!==(html.match(/\[##_Image\|/g)||[]).length)fail('E_ALT_MACRO_FORMAT');
  if(new Set(images.map(x=>x.asset)).size!==images.length)fail('E_ALT_MACRO_ASSET_AMBIGUOUS');return images;
}
export function assertMacroPublicMapping(html,publicSources){
  const images=parsePlainImageMacros(html);if(!Array.isArray(publicSources)||images.length!==publicSources.length)fail('E_ALT_MACRO_PUBLIC_MAPPING');
  const identities=publicSources.map(publicAssetIdentity);if(new Set(identities).size!==identities.length||images.some((x,i)=>x.asset!==identities[i]))fail('E_ALT_MACRO_PUBLIC_MAPPING');
  return images.map((x,i)=>({imageIndex:i,publicIndex:i,assetSha256:maintenanceHash(x.asset)}));
}
export function applyMacroAltMaintenance(html,metadata,request,publicSources){
  if(request?.operation!==ALT_MACRO_OPERATION)fail('E_ALT_MACRO_OPERATION');
  validateAltMaintenance({...request,operation:ALT_OPERATION});
  if(maintenanceHash(html)!==request.expectedBodySha256)fail('E_ALT_BODY_DRIFT');
  const keys=['title','category','tags','representativeImage','visibility'];
  if(!metadata||Object.keys(metadata).length!==keys.length||keys.some(k=>!Object.hasOwn(metadata,k))||metadata.title!==request.expectedTitle||metadata.visibility!=='20'||typeof metadata.category!=='string'||typeof metadata.representativeImage!=='string'||!Array.isArray(metadata.tags)||!metadata.tags.every(x=>typeof x==='string'))fail('E_ALT_METADATA_CAPTURE');
  if(maintenanceHash(JSON.stringify(metadata))!==request.expectedMetadataSha256)fail('E_ALT_METADATA_DRIFT');
  assertMacroPublicMapping(html,publicSources);const images=parsePlainImageMacros(html),changes=[];
  for(const p of request.patches){const image=images[p.imageIndex];if(!image)fail('E_ALT_IMAGE_MISSING');if(maintenanceHash(image.reference)!==p.expectedSrcSha256)fail('E_ALT_IMAGE_SOURCE_DRIFT');
    const alt=image.fields.get('alt');const old=alt?image.json.slice(alt.start,alt.end):null;if(old!==p.expectedAltRaw)fail('E_ALT_OLD_VALUE_DRIFT');
    const position=alt?alt.start:image.close,length=alt?alt.end-alt.start:0,replacement=alt?JSON.stringify(p.newAlt):',"alt":'+JSON.stringify(p.newAlt);
    changes.push({start:image.jsonStart+position,length,replacement});}
  let targetHtml=html;for(const c of changes.sort((a,b)=>b.start-a.start))targetHtml=targetHtml.slice(0,c.start)+c.replacement+targetHtml.slice(c.start+c.length);
  const revised=parsePlainImageMacros(targetHtml);if(revised.length!==images.length||revised.some((x,i)=>x.reference!==images[i].reference))fail('E_ALT_MACRO_DIFF');
  return {targetHtml,originalBodySha256:request.expectedBodySha256,targetBodySha256:maintenanceHash(targetHtml),metadataSha256:request.expectedMetadataSha256,changedImages:changes.length,semanticVerification:'alt-visual-review-only',publicationEnabled:false};
}
export function draftMacroAltConditions(html,metadata,patch,publicSources){
  assertMacroPublicMapping(html,publicSources);const image=parsePlainImageMacros(html)[patch.imageIndex];if(!image)fail('E_ALT_IMAGE_MISSING');const alt=image.fields.get('alt');
  const maintenance={operation:ALT_MACRO_OPERATION,articleId:patch.articleId,expectedTitle:metadata.title,expectedBodySha256:maintenanceHash(html),expectedMetadataSha256:maintenanceHash(JSON.stringify(metadata)),patches:[{imageIndex:patch.imageIndex,expectedSrcSha256:maintenanceHash(image.reference),expectedAltRaw:alt?image.json.slice(alt.start,alt.end):null,newAlt:patch.newAlt}]};
  applyMacroAltMaintenance(html,metadata,maintenance,publicSources);return {status:'draft',approved:false,operation:ALT_MACRO_OPERATION,maintenance};
}

export function validateMacroMaintenance(request){
 if(request?.operation!==ALT_MACRO_OPERATION)fail('E_ALT_MACRO_OPERATION');return validateAltMaintenance({...request,operation:ALT_OPERATION});
}
export function applyMappedMacroAlt(html,metadata,request,proof){
 const images=parsePlainImageMacros(html);
 if(proof?.version!=='macro-asset-map-v1'||!Array.isArray(proof.assetSha256s)||proof.assetSha256s.length!==images.length||new Set(proof.assetSha256s).size!==images.length||images.some((x,i)=>maintenanceHash(x.asset)!==proof.assetSha256s[i]))fail('E_ALT_MACRO_PUBLIC_MAPPING');
 return applyMacroAltMaintenance(html,metadata,request,images.map(x=>'https://blog.kakaocdn.net/dn/'+x.asset.slice('kakaocdn-asset:'.length)));
}

export function draftMacroAltSource(html,metadata,patch,publicSources,id){
 if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id||''))fail('E_ALT_MACRO_SOURCE_ID');
 const draft=draftMacroAltConditions(html,metadata,patch,publicSources);
 return {id,articleId:patch.articleId,targetUrl:'https://nhunnhun.tistory.com/'+patch.articleId,expectedCurrentTitle:metadata.title,title:metadata.title,status:'draft',approved:false,operation:ALT_MACRO_OPERATION,maintenance:draft.maintenance};
}
