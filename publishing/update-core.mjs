import {isNativeTextMaintenance,checkNativeTextSource,nativeTextFingerprint} from './native-text-contract.mjs';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { BLOG, checkPublishHtml, plainText } from './core.mjs';
import {assertDirectEmphasis} from './direct-emphasis.mjs';
import {isAltMaintenance,checkAltSource,altFingerprint} from './alt-maintenance-source.mjs';
import {validateAffiliateProducts} from './affiliate-products.mjs';
import {assertVerifiedFoodStockLeadRemoval} from './food-stock-lead-removal.mjs';

const ALLOWED=['id','articleId','targetUrl','expectedCurrentTitle','title','representativeImageUrl','imageReview','bodyHtml','status','approved','category','contentStandard','affiliateProducts','changeScope','preserveStructure','structureBaseline','foodBenefitScopeReview','stockLeadBaselineId'];
const UPDATE_CHANGE_SCOPES=new Set(['emphasis-only','content-update','full-rewrite','stock-lead-removal']);
const STRUCTURE_BASELINE_KEYS=['h2','h3','p','div','section','aside','ul','ol','li','table','thead','tbody','tr','th','td','img','figure','figcaption','blockquote','details','summary'];
const STRUCTURE_BASELINE_REQUIRED_KEYS=['h2','h3','ul','ol','li','table','tr','img','blockquote'];

export function checkUpdateSource(update, filename){
  if(isNativeTextMaintenance(update))return checkNativeTextSource(update,filename);
  if(isAltMaintenance(update))return checkAltSource(update,filename);
  if(!update || typeof update!=='object' || Array.isArray(update)) throw new Error('E_UPDATE_SCHEMA');
  const unsupported=Object.keys(update).filter(k=>!ALLOWED.includes(k)).sort();
  if(unsupported.length) throw new Error(`E_UPDATE_SCHEMA_UNSUPPORTED_KEYS:${unsupported.join(',')}`);
  if(update.contentStandard!==undefined&&!['R1','SP1'].includes(update.contentStandard)) throw new Error('E_CONTENT_STANDARD_VERSION');
  if(update.contentStandard!==undefined&&(typeof update.category!=='string'||!update.category.trim())) throw new Error('E_CONTENT_CATEGORY_MISMATCH');
  if(update.changeScope!==undefined&&!UPDATE_CHANGE_SCOPES.has(update.changeScope))throw new Error('E_UPDATE_CHANGE_SCOPE');
  if((update.stockLeadBaselineId!==undefined)!==(update.changeScope==='stock-lead-removal'))throw Error('E_STOCK_LEAD_SCOPE');
  if(update.preserveStructure!==undefined&&typeof update.preserveStructure!=='boolean')throw new Error('E_UPDATE_PRESERVE_STRUCTURE');
  if(update.structureBaseline!==undefined){
    if(!update.structureBaseline||typeof update.structureBaseline!=='object'||Array.isArray(update.structureBaseline))throw new Error('E_UPDATE_STRUCTURE_BASELINE');
    const keys=Object.keys(update.structureBaseline).sort();
    const unknown=keys.filter(k=>!STRUCTURE_BASELINE_KEYS.includes(k));
    if(unknown.length)throw new Error(`E_UPDATE_STRUCTURE_BASELINE_KEYS:${unknown.join(',')}`);
    for(const key of STRUCTURE_BASELINE_REQUIRED_KEYS){
      const value=update.structureBaseline[key];
      if(!Number.isInteger(value)||value<0)throw new Error('E_UPDATE_STRUCTURE_BASELINE');
    }
    for(const key of keys){
      const value=update.structureBaseline[key];
      if(!Number.isInteger(value)||value<0)throw new Error('E_UPDATE_STRUCTURE_BASELINE');
    }
  }
  if((update.changeScope==='emphasis-only'||update.preserveStructure===true)&&update.structureBaseline===undefined)throw new Error('E_UPDATE_STRUCTURE_BASELINE');
  if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(update.id) || filename!==`${update.id}.json`) throw new Error('E_UPDATE_ID');
  if(!/^\d+$/.test(update.articleId||'')) throw new Error('E_UPDATE_ARTICLE');
  if(update.targetUrl!==`${BLOG}/${update.articleId}`) throw new Error('E_UPDATE_URL');
  for(const key of ['expectedCurrentTitle','title']){
    if(typeof update[key]!=='string' || !update[key].trim() || update[key].length>150 || /[\r\n]/.test(update[key])) throw new Error('E_UPDATE_TITLE');
  }
  if(update.status!=='ready' || update.approved!==true) throw new Error('E_UPDATE_APPROVAL');
  validateAffiliateProducts(update.affiliateProducts);
  if(typeof update.bodyHtml!=='string' || !plainText(update.bodyHtml)) throw new Error('E_UPDATE_BODY');
  if(update.contentStandard!=='SP1'||update.representativeImageUrl!==undefined){
  if(typeof update.representativeImageUrl!=='string' || !update.representativeImageUrl.trim()) throw new Error('E_UPDATE_REPRESENTATIVE');
  let rep;
  try { rep=new URL(update.representativeImageUrl); } catch { throw new Error('E_UPDATE_REPRESENTATIVE'); }
  if(rep.protocol!=='https:' || rep.username || rep.password) throw new Error('E_UPDATE_REPRESENTATIVE');
  }
  checkPublishHtml({bodyHtml:update.bodyHtml});
  assertVerifiedFoodStockLeadRemoval(update);
  return update;
}
export function updateFingerprint(update){
  if(isNativeTextMaintenance(update))return nativeTextFingerprint(update);
  if(isAltMaintenance(update))return altFingerprint(update);
  return createHash('sha256').update(JSON.stringify([
    update.id,update.articleId,update.targetUrl,update.expectedCurrentTitle,update.title,update.representativeImageUrl,update.bodyHtml,
    ...(update.contentStandard ? [update.contentStandard,update.category] : []),
    ...(update.affiliateProducts ? [update.affiliateProducts] : []),
    ...(update.changeScope!==undefined ? [update.changeScope] : []),
    ...(update.stockLeadBaselineId!==undefined ? [update.stockLeadBaselineId] : []),
    ...(update.preserveStructure!==undefined ? [update.preserveStructure] : []),
    ...(update.structureBaseline!==undefined ? [update.structureBaseline] : []),
    ...(update.foodBenefitScopeReview!==undefined ? [update.foodBenefitScopeReview] : [])
  ])).digest('hex');
}
export async function loadUpdates(directory='updates',sourceId=null){
  if(sourceId!==null&&!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sourceId))throw Error('E_UPDATE_TARGET_ID');
  const out=[];
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.json')&&(!sourceId||n===`${sourceId}.json`)).sort()){
    out.push(checkUpdateSource(JSON.parse(await readFile(`${directory}/${name}`,'utf8')),name));
  }
  if(sourceId&&out.length!==1)throw Error('E_UPDATE_TARGET_SOURCE_NOT_FOUND');
  if(sourceId&&!isAltMaintenance(out[0]))assertDirectEmphasis(out[0]);
  if(new Set(out.map(x=>x.articleId)).size!==out.length) throw new Error('E_UPDATE_DUPLICATE_ARTICLE');
  return out;
}
export function eligibleUpdate(update,state){
  if(update.status!=='ready' || !update.approved) return false;
  if(!state) return true;
  if(state.phase==='updated' && state.fingerprint===updateFingerprint(update) && state.url===update.targetUrl) return false;
  throw new Error('E_UPDATE_EXISTING_STATE_REQUIRES_REVIEW');
}
