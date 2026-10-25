import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';

const SOURCE_ID_PATTERN=/^direct-[a-z0-9-]{2,70}$/u;
const STOCK_LEAD_PATTERN=/핵심(?:만)?\s*먼저\s*:?/u;
const BLOCK_PATTERN=/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/giu;
const BLOCK_OPEN_PATTERN=/^<blockquote\b[^>]*>\s*(?:<p\b[^>]*>\s*)?(?:<strong\b[^>]*>\s*)?핵심(?:만)?\s*먼저\s*:?/u;

// This transform deliberately removes only the stock lead block. All other
// source text, markup, photos, references and headings remain byte-for-byte.
export function removeFoodStockLead(html){
  const blocks=[...html.matchAll(BLOCK_PATTERN)].filter(match=>BLOCK_OPEN_PATTERN.test(match[0]));
  if(blocks.length!==1)throw Error('E_STOCK_LEAD_BLOCK_COUNT');
  const [block]=blocks;
  if(block.index>3500)throw Error('E_STOCK_LEAD_NOT_INTRO');
  if(/<(?:img|table)\b/iu.test(block[0]))throw Error('E_STOCK_LEAD_RICH_CONTENT');
  const result=html.slice(0,block.index)+html.slice(block.index+block[0].length);
  for(const match of block[0].matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/giu)){
    if(!result.includes(match[1]))throw Error('E_STOCK_LEAD_UNIQUE_LINK');
  }
  if(STOCK_LEAD_PATTERN.test(result))throw Error('E_STOCK_LEAD_REMAINS');
  return result.replace(/\n{3,}/gu,'\n\n');
}

export function assertVerifiedFoodStockLeadRemoval(source,root=process.cwd()){
  if(source?.changeScope!=='stock-lead-removal')return;
  if(source?.category!=='음식'||!SOURCE_ID_PATTERN.test(source.id??'')||
    !SOURCE_ID_PATTERN.test(source.stockLeadBaselineId??'')||
    source.stockLeadBaselineId===source.id)throw Error('E_STOCK_LEAD_SCOPE');
  let baseline,ledger;
  try{
    baseline=JSON.parse(readFileSync(resolve(root,'updates',source.stockLeadBaselineId+'.json'),'utf8'));
    ledger=JSON.parse(readFileSync(resolve(root,'publishing/update-state',source.stockLeadBaselineId+'.json'),'utf8'));
  }catch{throw Error('E_STOCK_LEAD_BASELINE_MISSING');}
  if(ledger.phase!=='updated'||ledger.publicResult?.status!=='PUBLIC_VERIFIED'||
    String(ledger.articleId)!==String(baseline.articleId)||ledger.url!==baseline.targetUrl||
    baseline.category!=='음식'||source.articleId!==baseline.articleId)
    throw Error('E_STOCK_LEAD_BASELINE_UNVERIFIED');
  const expected={
    ...baseline,
    id:source.id,
    expectedCurrentTitle:baseline.title,
    bodyHtml:removeFoodStockLead(baseline.bodyHtml),
    changeScope:'stock-lead-removal',
    stockLeadBaselineId:baseline.id
  };
  delete expected.preserveStructure;
  delete expected.structureBaseline;
  if(!isDeepStrictEqual(source,expected))throw Error('E_STOCK_LEAD_SCOPE_DRIFT');
}
