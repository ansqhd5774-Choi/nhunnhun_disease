export const COUPANG_DISCLOSURE='이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
const MAX_PRODUCTS=3;
const ALLOWED_CATEGORIES=new Set(['food','kitchen','storage']);
const CLAIM_TERMS=/(치료|예방|완치|개선|낫게|효과|효능|혈당|혈압|콜레스테롤|다이어트|체중.?감량|면역력|염증|질병|증상|의약품|영양제|건강기능식품)/i;
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function validateAffiliateProducts(value){
  if(value===undefined)return undefined;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['reviewed','products'].includes(key)))throw new Error('E_AFFILIATE_SCHEMA');
  if(value.reviewed!==true)throw new Error('E_AFFILIATE_REVIEW_REQUIRED');
  if(!Array.isArray(value.products)||value.products.length<1||value.products.length>MAX_PRODUCTS)throw new Error('E_AFFILIATE_LINK_COUNT');
  const seen=new Set();
  for(const product of value.products){
    if(!product||typeof product!=='object'||Array.isArray(product)||Object.keys(product).some(key=>!['name','landingUrl','category','rationale'].includes(key)))throw new Error('E_AFFILIATE_PRODUCT_SCHEMA');
    if(typeof product.name!=='string'||product.name.trim().length<2||product.name.length>120||/[<>\r\n]/.test(product.name))throw new Error('E_AFFILIATE_PRODUCT_NAME');
    if(CLAIM_TERMS.test(product.name))throw new Error('E_AFFILIATE_HEALTH_CLAIM');
    if(!ALLOWED_CATEGORIES.has(product.category))throw new Error('E_AFFILIATE_CATEGORY');
    if(typeof product.rationale!=='string'||product.rationale.trim().length<10||product.rationale.length>240||/[<>\r\n]/.test(product.rationale)||CLAIM_TERMS.test(product.rationale))throw new Error('E_AFFILIATE_RATIONALE');
    let url;try{url=new URL(product.landingUrl);}catch{throw new Error('E_AFFILIATE_URL');}
    const hasSensitiveParam=[...url.searchParams.keys()].some(key=>/^(?:access[_-]?key|secret[_-]?key|token|authorization)$/i.test(key));
    if(url.protocol!=='https:'||url.hostname!=='link.coupang.com'||url.username||url.password||hasSensitiveParam)throw new Error('E_AFFILIATE_URL');
    if(seen.has(url.href))throw new Error('E_AFFILIATE_DUPLICATE_URL');
    seen.add(url.href);
  }
  return value;
}

export function renderAffiliateProductsBlock(value){
  const affiliate=validateAffiliateProducts(value);
  if(!affiliate)return '';
  const items=affiliate.products.map(product=>`<li style="margin:0 0 10px;"><a href="${escapeHtml(product.landingUrl)}" rel="sponsored nofollow" style="color:#176b82;text-decoration:underline;">${escapeHtml(product.name)}</a><span style="display:block;font-size:12px;color:#64748b;">관련 항목: ${escapeHtml(product.rationale)}</span></li>`).join('');
  return `<div style="margin:28px 0;padding:16px 18px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;"><p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#475569;">[광고] ${COUPANG_DISCLOSURE}</p><p style="margin:0 0 8px;font-weight:700;color:#243142;">관련 상품 정보</p><ul style="margin:0;padding-left:20px;line-height:1.7;">${items}</ul></div>`;
}

export function insertAffiliateProductsBlock(html,value){
  const block=renderAffiliateProductsBlock(value);
  if(!block)return html;
  const sources=html.search(/<h2\b[^>]*>(?:\s*<small\b[^>]*>[\s\S]*?<\/small>\s*)*자료 출처\s*<\/h2>/i);
  return sources<0?html+block:html.slice(0,sources)+block+html.slice(sources);
}

export function assertAffiliatePublicEvidence(evidence,affiliate){
  validateAffiliateProducts(affiliate);
  if(!evidence||evidence.disclosureCount!==1||!Array.isArray(evidence.linkCounts)||evidence.linkCounts.length!==affiliate.products.length||evidence.linkCounts.some(count=>count!==1)||!Array.isArray(evidence.sponsored)||evidence.sponsored.length!==affiliate.products.length||evidence.sponsored.some(ok=>!ok))throw new Error('E_AFFILIATE_PUBLIC_UNVERIFIED');
}
