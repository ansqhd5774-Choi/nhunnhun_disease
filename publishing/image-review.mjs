import {DIRECT_AUTHORING_CONTRACT,hasAuthoritativePreflight} from './direct-authoring-contract.mjs';
import {isRejectedHeroSource} from './rejected-hero-sources.mjs';
const REVIEW_KEYS=DIRECT_AUTHORING_CONTRACT.imageReviewKeys;
const ROLES=new Set(['hero','detail','context','process','diagram']);
const COMPOSITIONS=new Set(['closeup','cross-section','context','serving','field','process','diagram']);
const LICENSE=/^(?:CC0|CC BY(?:-SA)?(?: [1-9](?:\.\d)?)?|Public Domain|GFDL)(?:\b|$)/i;
// An explicit license is one route, not the only route, for using an informative image.
// Other bases are editorial declarations, not automated legal determinations.
const USAGE_BASES=new Set(['original','authorized','product-identification','quotation']);
const NUTRIENT_ABSTRACT_HERO=/(?:structure|skeletal|formula|molecule|molecular|crystal|kristall|microscop|polarized|polarised|polariseeritud|chemical[_ -]?structure)/i;
function imageTags(html=''){return [...String(html).matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);}
function attr(tag,name){return (tag.match(new RegExp('\\b'+name+'=(["\\\'])(.*?)\\1','i'))||[])[2]||'';}
function sourceBlock(html=''){return (String(html).match(/<h2>자료 출처<\/h2>\s*<ul>([\s\S]*?)<\/ul>/)||[])[1]||'';}
// Match the closing delimiter to its opening quote; file names may contain apostrophes.
function hrefs(html=''){return new Set([...String(html).matchAll(/<a\b[^>]*\bhref=(["'])(https:\/\/.*?)\1/gi)].map(m=>m[2].replace(/&amp;/g,'&')));}
function assertHttps(value,code){let u;try{u=new URL(value);}catch{throw new Error(code);}if(u.protocol!=='https:'||u.username||u.password)throw new Error(code);return u;}
function canonicalUrl(value){
  try{
    const u=new URL(String(value));
    if(u.hostname==='commons.wikimedia.org'){
      // MediaWiki treats spaces and underscores as the same title separator.
      const decoded=decodeURIComponent(u.pathname).replace(/_/g,' ');
      u.pathname=decoded;
    }
    return u.href;
  }catch{return String(value??'');}
}
function isAbstractNutrientHero(item,review){
  if(String(item?.category??'').trim()!=='영양소')return false;
  let pathname='';
  try{pathname=decodeURIComponent(new URL(review?.sourcePage??'').pathname);}catch{return false;}
  return NUTRIENT_ABSTRACT_HERO.test(pathname);
}
function metadataIssues(review=[]){
  const issues=[];
  for(let i=0;i<review.length;i++){
    const r=review[i];
    if(!r||typeof r!=='object'||Array.isArray(r))continue;
    if(!ROLES.has(r.role))issues.push({index:i,field:'role',value:r.role??null});
    if(!COMPOSITIONS.has(r.composition))issues.push({index:i,field:'composition',value:r.composition??null});
    if(i>0&&r.role==='hero')issues.push({index:i,field:'role',value:'hero',reason:'secondary-hero'});
  }
  return issues;
}
function mismatchIssues(tags=[],review=[]){
  const issues=[];
  for(let i=0;i<Math.min(tags.length,review.length);i++){
    const r=review[i]??{},src=attr(tags[i],'src'),alt=attr(tags[i],'alt');
    if(canonicalUrl(r.src)!==canonicalUrl(src))issues.push({index:i,field:'src',review:r.src??null,body:src});
    if(r.alt!==alt)issues.push({index:i,field:'alt',review:r.alt??null,body:alt});
    if(!alt.trim()||alt.length<6)issues.push({index:i,field:'alt',reason:'missing-or-short',body:alt});
  }
  return issues;
}
export function imageReviewObservation(item){
  const review=Array.isArray(item?.imageReview)?item.imageReview:[];
  const direct=new Set(['closeup','cross-section','serving','process']);
  const contextual=new Set(['context','field','diagram']);
  return {
    visualCheckedCount:review.filter(r=>r?.visualChecked===true).length,
    total:review.length,
    directFoodImageCount:String(item?.category??'').trim()==='음식'?review.filter(r=>direct.has(r?.composition)).length:null,
    contextualImageCount:String(item?.category??'').trim()==='음식'?review.filter(r=>contextual.has(r?.composition)).length:null,
    automatedSemanticVerdict:false
  };
}
export function assertImageReview(item){
  if(hasAuthoritativePreflight())return item;
  const tags=imageTags(item?.bodyHtml),review=item?.imageReview;
  if(!Array.isArray(review)||review.length!==tags.length||tags.length<DIRECT_AUTHORING_CONTRACT.imageMinimum)throw new Error('E_IMAGE_REVIEW_REQUIRED');
  if(review[0]?.role!=='hero'||canonicalUrl(review[0]?.src)!==canonicalUrl(item.representativeImageUrl))throw new Error('E_IMAGE_HERO_REVIEW');
  if(isRejectedHeroSource(review[0]?.sourcePage)||isAbstractNutrientHero(item,review[0]))throw new Error('E_IMAGE_HERO_REJECTED');
  const issues=metadataIssues(review);
  if(issues.length){console.error('IMAGE_REVIEW_METADATA_DIAG '+JSON.stringify(issues));throw new Error('E_IMAGE_REVIEW_REQUIRED');}
  const mismatches=mismatchIssues(tags,review);
  if(mismatches.length){console.error('IMAGE_REVIEW_MISMATCH_DIAG '+JSON.stringify(mismatches));throw new Error('E_IMAGE_REVIEW_MISMATCH');}
  const sourceLinks=hrefs(sourceBlock(item.bodyHtml)),seenSrc=new Set();
  for(let i=0;i<review.length;i++){
    const r=review[i];
    if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!REVIEW_KEYS.includes(k)))throw new Error('E_IMAGE_REVIEW_SCHEMA');
    if(r.visualChecked!==undefined&&typeof r.visualChecked!=='boolean')throw new Error('E_IMAGE_REVIEW_SCHEMA');
    if(r.usageBasis!==undefined&&!USAGE_BASES.has(r.usageBasis))throw new Error('E_IMAGE_REVIEW_SCHEMA');
    assertHttps(r.src,'E_IMAGE_REVIEW_URL');
    assertHttps(r.sourcePage,'E_IMAGE_REVIEW_SOURCE');
    if(!String(r.author||'').trim()||(!LICENSE.test(String(r.license||'').trim())&&!USAGE_BASES.has(r.usageBasis)))throw new Error('E_IMAGE_REVIEW_LICENSE');
    if(!sourceLinks.has(r.sourcePage))throw new Error('E_IMAGE_REVIEW_ATTRIBUTION');
    // Several distinct photos may legitimately be documented on one original page.
    const srcKey=canonicalUrl(r.src);
    if(seenSrc.has(srcKey))throw new Error('E_IMAGE_REVIEW_DUPLICATE');
    seenSrc.add(srcKey);
  }
  return item;
}
