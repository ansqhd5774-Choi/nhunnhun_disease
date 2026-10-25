import {applyMappedImageGridAlt,parseImageGridMacros} from './alt-image-grid-contract.mjs';
import {maintenanceHash} from './alt-maintenance-contract.mjs';
const fail=()=>{throw Error('E_ALT_NATIVE_RECOVERY_DRIFT');};
const dimensions=['originWidth','originHeight','width','height'];
const signedKeys=['credential','expires','allow_ip','allow_referer','signature'];
function signedReference(reference){const decoded=reference.replaceAll('&amp;','&');if(/[\r\n#]/.test(decoded))fail();const u=new URL('https://native-reference.invalid/'+decoded.slice(5));if(!decoded.startsWith('kage@'))fail();const keys=[...u.searchParams.keys()];if(new Set(keys).size!==keys.length||keys.some(k=>!signedKeys.includes(k)))fail();return keys.sort();}
// Read-only, dedicated post-save proof. Never alters source gates or publication ledgers.
export function proveNativeAltRecovery({originalHtml,metadata,request,mapping,actualNativeHtml}){
 const expected=applyMappedImageGridAlt(originalHtml,metadata,request,mapping).targetHtml;
 if(typeof actualNativeHtml!=='string')fail();
 let converted=0;
 let restored=actualNativeHtml.replace(/\[##_Image\|([\s\S]*?)_##\]/g,(block,payload)=>{
   const parts=payload.split('|');if(parts.length!==4||parts[1]!=='CDM'||parts[2]!=='1.3')fail();
   const json=parts[3];let cursor=1;const seen=new Set(),changes=[];
   if(json.trimStart()[0]!=='{')fail();cursor=json.indexOf('{')+1;
   const stringToken='"(?:\\\\.|[^"\\\\])*"';
   const field=new RegExp('\\s*('+stringToken+')\\s*:\\s*('+stringToken+'|-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)','y');
   while(true){if(/^\s*}/.test(json.slice(cursor)))break;field.lastIndex=cursor;const match=field.exec(json);if(!match)fail();
     const key=JSON.parse(match[1]);if(seen.has(key))fail();seen.add(key);const token=match[2],value=JSON.parse(token);
     if(dimensions.includes(key)&&typeof value==='string'){if(!/^(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(Number(value)))fail();changes.push({start:field.lastIndex-token.length,end:field.lastIndex,value});}
     cursor=field.lastIndex;const separator=/^\s*([,}])/.exec(json.slice(cursor));if(!separator)fail();cursor+=separator[0].length;if(separator[1]==='}') {if(json.slice(cursor).trim())fail();break;}if(/^\s*}/.test(json.slice(cursor)))fail();
   }
   JSON.parse(json);let normalized=json;for(const change of changes.reverse())normalized=normalized.slice(0,change.start)+change.value+normalized.slice(change.end);
   converted+=changes.length;return block.slice(0,block.length-json.length-4)+normalized+'_##]';
 });
 const before=parseImageGridMacros(expected),after=parseImageGridMacros(restored);
 if(before.length!==after.length||before.some((x,i)=>x.kind!==after[i].kind||x.asset!==after[i].asset))fail();
 let referenceChanges=0;
 for(let i=0;i<before.length;i++){
   const old=before[i].reference,current=after[i].reference;
   if(JSON.stringify(signedReference(old))!==JSON.stringify(signedReference(current)))fail();
   if(old!==current){if(restored.split(current).length!==2)fail();restored=restored.replace(current,old);referenceChanges++;}
 }
 // Reconstruction must exactly equal the contract's intended bytes, not a semantic approximation.
 if(restored!==expected)fail();
 return {status:'NATIVE_ALT_RECOVERY_PROVEN',changedAlt:request.patches.length,images:before.length,numericStringConversions:converted,signedReferenceSerializations:referenceChanges,expectedBodySha256:maintenanceHash(expected),actualNativeBodySha256:maintenanceHash(actualNativeHtml),providerBodyPreservation:'UNKNOWN_NO_PRE_SUBMIT_PROVIDER_BODY',publicationEnabled:false,ledgerMutation:false};
}
