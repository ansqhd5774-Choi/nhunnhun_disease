import {parseDocument,DomUtils} from 'htmlparser2';
import {maintenanceHash as hash} from './alt-maintenance-contract.mjs';
const mask=h=>h.replace(/\[##_Image\|[\s\S]*?_##\]/g,x=>'X'.repeat(x.length));
const blocks=h=>DomUtils.findAll(n=>['p','li','ol','ul'].includes(n.name),parseDocument(mask(h),{withStartIndices:true,withEndIndices:true}).children);
export function validateNativeTextExtras(r){
 if(r.articleId==='200'&&(r.cleanupPatches.length||r.captionPatches.length))throw Error('E_TEXT_EXTRA_SCOPE');
 let last=-1;for(const p of r.cleanupPatches){if(Object.keys(p).sort().join(',')!=='expectedHtmlSha256,length,newHtml,start'||!Number.isSafeInteger(p.start)||p.start<0||!Number.isSafeInteger(p.length)||p.length<1||p.start<last||!/^[a-f0-9]{64}$/.test(p.expectedHtmlSha256)||typeof p.newHtml!=='string'||!/^<\/?span(?:\s[^<>]*)?>$/.test(p.newHtml)||p.newHtml.length>1000)throw Error('E_TEXT_CLEANUP_CONDITIONS');last=p.start+p.length;}
 for(const p of r.captionPatches)if(r.articleId!=='236'||Object.keys(p).sort().join(',')!=='expectedCaptionSha256,imageIndex,newCaption'||p.imageIndex!==0||p.newCaption!=='티몰(Thymol)'||!/^[a-f0-9]{64}$/.test(p.expectedCaptionSha256))throw Error('E_TEXT_CAPTION_SCOPE');
}
// Change only newly empty block tag names to inline span. Child nodes and every
// attribute byte are retained, including inline styles and existing spacer p.
export function draftNativeEmptyCleanup(original,target){
 const before=blocks(original),after=blocks(target);if(before.length!==after.length)throw Error('E_TEXT_CLEANUP_STRUCTURE');const patches=[];
 for(let i=0;i<after.length;i++){const a=before[i],b=after[i];if(a.name!==b.name)throw Error('E_TEXT_CLEANUP_STRUCTURE');if(!DomUtils.textContent(a).trim()||DomUtils.textContent(b).trim())continue;
  if(DomUtils.findAll(n=>['img','a','style','script','iframe','br'].includes(n.name),[b]).length)throw Error('E_TEXT_CLEANUP_PROTECTED');
  const opening=target.slice(b.startIndex).match(new RegExp('^<'+b.name+'\\b[^>]*>','i'))?.[0];const ending='</'+b.name+'>';if(!opening||target.slice(b.endIndex-ending.length+1,b.endIndex+1).toLowerCase()!==ending)throw Error('E_TEXT_CLEANUP_RANGE');
  for(const [start,raw,newHtml]of [[b.startIndex,opening,opening.replace(new RegExp('^<'+b.name,'i'),'<span')],[b.endIndex-ending.length+1,target.slice(b.endIndex-ending.length+1,b.endIndex+1),'</span>']])patches.push({start,length:raw.length,expectedHtmlSha256:hash(raw),newHtml});
 }
 return patches.sort((a,b)=>a.start-b.start);
}
function applyExact(html,patches){let out=html;for(const p of [...patches].reverse()){if(hash(out.slice(p.start,p.start+p.length))!==p.expectedHtmlSha256)throw Error('E_TEXT_CLEANUP_RANGE');out=out.slice(0,p.start)+p.newHtml+out.slice(p.start+p.length);}let offset=0;const revised=patches.map(p=>{const v={...p,offset:p.start+offset};offset+=p.newHtml.length-p.length;return v;});let restored=out;for(const p of revised.reverse())restored=restored.slice(0,p.offset)+html.slice(p.start,p.start+p.length)+restored.slice(p.offset+p.newHtml.length);if(restored!==html)throw Error('E_TEXT_CLEANUP_RESTORE');return out;}
export function applyNativeEmptyCleanup(original,target,declared){const expected=draftNativeEmptyCleanup(original,target);if(JSON.stringify(expected)!==JSON.stringify(declared))throw Error('E_TEXT_CLEANUP_CONDITIONS');return applyExact(target,expected);}
export function applyNativeCaptionFix(html,articleId,declared,images){
 if(!declared.length)return html;if(articleId!=='236'||declared.length!==1)throw Error('E_TEXT_CAPTION_SCOPE');const p=declared[0];if(Object.keys(p).sort().join(',')!=='expectedCaptionSha256,imageIndex,newCaption'||p.imageIndex!==0||p.newCaption!=='티몰(Thymol)')throw Error('E_TEXT_CAPTION_SCOPE');const image=images[0];if(image.caption!=='티민(Thymol)'||hash(image.caption)!==p.expectedCaptionSha256)throw Error('E_TEXT_CAPTION_DRIFT');
 const matches=[...image.raw.matchAll(/"caption"\s*:\s*("(?:[^"\\]|\\.)*")/g)];if(matches.length!==1||JSON.parse(matches[0][1])!==image.caption)throw Error('E_TEXT_CAPTION_TOKEN');const m=matches[0],start=image.start+m.index+m[0].lastIndexOf(m[1]);const out=applyExact(html,[{start,length:m[1].length,expectedHtmlSha256:hash(m[1]),newHtml:JSON.stringify(p.newCaption)}]);return out;
}
