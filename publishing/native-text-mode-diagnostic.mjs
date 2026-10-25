import {nativeImages,nativePlainText,nativeTextSlots} from './native-text-contract.mjs';
import {maintenanceHash as hash} from './alt-maintenance-contract.mjs';
const dimensions=['originWidth','originHeight','width','height'];
const signedKeys=['credential','expires','allow_ip','allow_referer','signature'];
const jsonString='"(?:\\\\.|[^"\\\\])*"';
function flatFields(text){
 let i=text.indexOf('{')+1;if(!/^\s*\{/.test(text))throw Error('E_NATIVE_MODE_JSON');const out={};
 const field=new RegExp('\\s*('+jsonString+')\\s*:\\s*('+jsonString+'|-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)','y');
 while(true){if(/^\s*}/.test(text.slice(i)))break;field.lastIndex=i;const m=field.exec(text);if(!m)throw Error('E_NATIVE_MODE_JSON');const key=JSON.parse(m[1]);if(Object.hasOwn(out,key))throw Error('E_NATIVE_MODE_JSON');out[key]=JSON.parse(m[2]);i=field.lastIndex;const end=/^\s*([,}])/.exec(text.slice(i));if(!end)throw Error('E_NATIVE_MODE_JSON');i+=end[0].length;if(end[1]==='}'){if(text.slice(i).trim())throw Error('E_NATIVE_MODE_JSON');break;}if(/^\s*}/.test(text.slice(i)))throw Error('E_NATIVE_MODE_JSON');}
 const parsed=JSON.parse(text);if(JSON.stringify(Object.keys(parsed).sort())!==JSON.stringify(Object.keys(out).sort()))throw Error('E_NATIVE_MODE_JSON');return out;
}
function canonicalMacro(image){
 const parts=image.raw.slice('[##_Image|'.length,-'_##]'.length).split('|');if(parts.length!==4||parts[1]!=='CDM'||parts[2]!=='1.3')throw Error('E_NATIVE_MODE_MACRO');
 const decoded=parts[0].replaceAll('&amp;','&');const u=new URL('https://native-reference.invalid/'+decoded.slice(5));const queries=[...u.searchParams.keys()];if(!decoded.startsWith('kage@')||/[\r\n#]/.test(decoded)||new Set(queries).size!==queries.length||queries.some(k=>!signedKeys.includes(k)))throw Error('E_NATIVE_MODE_REFERENCE');
 const fields=flatFields(parts[3]),normalized={};for(const k of Object.keys(fields).sort()){let value=fields[k];if(dimensions.includes(k)&&typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&Number.isSafeInteger(Number(value)))value=Number(value);normalized[k]=value;}
 return {fields,hash:hash(JSON.stringify([image.asset,parts[1],parts[2],queries.sort(),normalized]))};
}
export function diagnoseNativeModeDifference(originalHtml,actualHtml,source){
 // Diagnostic evidence never approves a new source, rewrites a body, or changes
 // the existing exact hash gate. The historical reference must itself match it.
 if(hash(originalHtml)!==source.maintenance.expectedBodySha256)throw Error('E_NATIVE_MODE_REFERENCE_BODY_DRIFT');
 const oldImages=nativeImages(originalHtml),actualImages=nativeImages(actualHtml),oldSlots=nativeTextSlots(originalHtml),actualSlots=nativeTextSlots(actualHtml);
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const nonmacro=html=>html.replace(/\[##_Image\|[\s\S]*?_##\]/g,'[NATIVE_IMAGE]');
 const oldCanonical=oldImages.map(canonicalMacro),actualCanonical=actualImages.map(canonicalMacro);
 let numericStringTypeChanges=0;for(let i=0;i<Math.min(oldCanonical.length,actualCanonical.length);i++)for(const key of dimensions){const a=oldCanonical[i].fields[key],b=actualCanonical[i].fields[key];if(typeof a!==typeof b&&((typeof a==='number'&&typeof b==='string')||(typeof b==='number'&&typeof a==='string'))&&String(a)===String(b))numericStringTypeChanges++;}
 const report={referenceBodyHash:'PASS',bodyByteEqual:originalHtml===actualHtml,referenceBytes:Buffer.byteLength(originalHtml,'utf8'),actualBytes:Buffer.byteLength(actualHtml,'utf8'),fullTextHashEqual:hash(nativePlainText(originalHtml))===hash(nativePlainText(actualHtml)),slots:{referenceCount:oldSlots.length,actualCount:actualSlots.length,rawSequenceHashEqual:hash(JSON.stringify(oldSlots.map(s=>s.raw)))===hash(JSON.stringify(actualSlots.map(s=>s.raw))),offsetAndRawHashEqual:same(oldSlots.map(s=>[s.start,s.length,hash(s.raw)]),actualSlots.map(s=>[s.start,s.length,hash(s.raw)])),declaredPatches:source.maintenance.patches.length,exactCurrentPatchSlots:source.maintenance.patches.filter(p=>actualSlots.some(s=>s.start===p.start&&s.length===p.length&&hash(s.raw)===p.expectedTextSha256)).length},images:{referenceCount:oldImages.length,actualCount:actualImages.length,assetSequenceEqual:same(oldImages.map(x=>hash(x.asset)),actualImages.map(x=>hash(x.asset))),captionSequenceEqual:same(oldImages.map(x=>hash(x.caption)),actualImages.map(x=>hash(x.caption))),macroBytesEqual:same(oldImages.map(x=>hash(x.raw)),actualImages.map(x=>hash(x.raw))),macroCanonicalEqual:same(oldCanonical.map(x=>x.hash),actualCanonical.map(x=>x.hash)),numericStringTypeChanges},nonMacroBodyByteEqual:nonmacro(originalHtml)===nonmacro(actualHtml),publicationEnabled:false,sourceRewritten:false};
 report.classification=report.bodyByteEqual?'EXACT_SAME':report.fullTextHashEqual&&report.images.macroCanonicalEqual&&report.nonMacroBodyByteEqual?'IMAGE_SERIALIZATION_ONLY':'OTHER_BYTE_DRIFT';return report;
}
