import {captureSp1LegacySnapshot,assertSp1LegacySnapshot} from './sp1-legacy-public-contract.mjs';
import { assertEmphasisContract } from './content-emphasis.mjs';
import { verificationContext } from './verification-context.mjs';
import {assertDirectPublicSnapshot} from './direct-public-contract.mjs';
import {assertPublicTitle} from './public-title.mjs';
import {publicBodiesMatch} from './public-body.mjs';
import {COUPANG_DISCLOSURE,assertAffiliatePublicEvidence} from './affiliate-products.mjs';
// Read-only, anonymous quality audit. No editor, credential export or ledger writes.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const BLOG='https://nhunnhun.tistory.com';
const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
const hash=b=>createHash('sha256').update(b).digest('hex');

export function headingStyleProfile(readingSkin,width) {
  return readingSkin ? {h2:width<=600?'22px':'24px',h3:'19px',weight:'800'} : {h2:'26px',h3:'20px',weight:'800'};
}

export function articleUrl(value) {
  const u=new URL(value);
  if(u.origin!==BLOG || !/^\/\d+$/.test(u.pathname) || u.search || u.hash || u.username || u.password) throw new Error('E_QA_TARGET');
  return u.href;
}
export function ogAsset(value) {
  let u=new URL(value);
  for(let n=0;n<3;n++) {
    if(u.protocol!=='https:' || u.username || u.password) throw new Error('E_QA_OG_HOST');
    if(u.hostname==='kakaocdn.net' || u.hostname.endsWith('.kakaocdn.net')) return u.href;
    if(!(u.hostname==='daumcdn.net' || u.hostname.endsWith('.daumcdn.net')) || !u.searchParams.has('fname')) throw new Error('E_QA_OG_HOST');
    u=new URL(u.searchParams.get('fname'));
  }
  throw new Error('E_QA_OG_HOST');
}
export function checkMeasurements(m,e,{sp1Legacy=false}={}) {
  if(sp1Legacy&&e.version!=='SP1')throw Error('E_QA_SP1_LEGACY_CONTRACT');
  if(m.overflowPx!==0 || m.wideImages!==0) throw new Error('E_QA_OVERFLOW');
  if(m.images!==e.images || m.images<3 || m.missingAlt || m.brokenImages || m.nonNativeImages) throw new Error('E_QA_IMAGES');
  if(m.h2!==e.h2 || m.h3!==e.h3 || m.badHeadingStyles) throw new Error('E_QA_HEADINGS');
  if(m.tables!==e.tables || m.badTableWraps) throw new Error('E_QA_TABLES');
  if(!sp1Legacy&&(m.highlights!==e.highlights || (m.highlightColors < (e.minimumHighlightColors ?? (e.highlights>=2?2:e.highlights))) || m.hiddenHighlights)) throw new Error('E_QA_HIGHLIGHTS');
  if((!sp1Legacy&&(m.faqQ!==e.faq || m.faqA!==e.faq)) || !m.heroPriority || m.badLazyImages) throw new Error('E_QA_STRUCTURE');
  return true;
}
export function assertImagePayload(contentType,b) {
  const mime=String(contentType||'').split(';')[0].trim().toLowerCase();
  if(!/^image\//.test(mime)&&mime!=='application/octet-stream') throw new Error('E_QA_IMAGE_TYPE');
  if(!Buffer.isBuffer(b)||!b.length||b.length>12*1024*1024) throw new Error('E_QA_IMAGE_SIZE');
  const jpeg=b.length>3&&b[0]===255&&b[1]===216&&b[2]===255;
  const png=b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const gif=['GIF87a','GIF89a'].includes(b.subarray(0,6).toString('ascii'));
  const webp=b.length>=12&&b.subarray(0,4).toString('ascii')==='RIFF'&&b.subarray(8,12).toString('ascii')==='WEBP';
  if(!jpeg&&!png&&!gif&&!webp) throw new Error('E_QA_IMAGE_SIGNATURE');
  return b;
}
function qaRetryDelayMs(response,attempt) {
  const retryAfter=String(response.headers()['retry-after']||'').trim();
  if(retryAfter) {
    const seconds=Number(retryAfter);
    const ms=Number.isFinite(seconds)
      ? Math.max(0,seconds*1000)
      : Math.max(0,Date.parse(retryAfter)-Date.now());
    if(ms>120000) throw new Error('E_QA_RATE_LIMIT_LONG');
    if(ms>0) return ms;
  }
  return Math.min(30000,5000*(2**attempt));
}
async function bytes(request,url,role) {
  let response;
  for(let attempt=0;attempt<4;attempt++) {
    response=await request.get(url,{
      timeout:30000,
      headers:{
        'User-Agent':'NHUNNHUN-Tistory-Publisher/1.0 (https://nhunnhun.tistory.com/)',
        'Accept':'image/*'
      }
    });
    console.log('PUBLIC_QA_ASSET '+JSON.stringify({role,host:new URL(url).hostname,status:response.status(),mime:String(response.headers()['content-type']||'').replace(/[^a-z0-9/;= ._-]/gi,'').slice(0,100)}));
    if(response.ok()) break;
    if(![429,503].includes(response.status())) throw new Error('E_QA_IMAGE_FETCH');
    await new Promise(r=>setTimeout(r,qaRetryDelayMs(response,attempt)));
  }
  if(!response?.ok()) throw new Error('E_QA_IMAGE_FETCH');
  // Tistory .bin assets are served as octet-stream. Validate signatures, then
  // require exact SHA256 equality to the independently fetched image source.
  return assertImagePayload(response.headers()['content-type'],await response.body());
}
export async function verifyInternalLink(request,url,sleep=(ms)=>new Promise(r=>setTimeout(r,ms))) {
  const expected=articleUrl(url);
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const response=await request.get(expected,{timeout:30000});
      const finalUrl=response.url();
      const same=(()=>{try{return articleUrl(finalUrl)===expected;}catch{return false;}})();
      if(response.ok()&&same) return true;
      console.log('PUBLIC_QA_INTERNAL_LINK '+JSON.stringify({url:expected,status:response.status(),finalUrl,attempt:attempt+1}));
      if(![429,503].includes(response.status())) break;
    } catch {
      console.log('PUBLIC_QA_INTERNAL_LINK '+JSON.stringify({url:expected,status:0,finalUrl:'',attempt:attempt+1}));
    }
    if(attempt<2) await sleep(1000*(2**attempt));
  }
  throw new Error('E_QA_INTERNAL_LINK');
}
export async function verifyUpdatedPage(browser,update,width,expected,rendered,assetChecks) {
  const context=await verificationContext(browser, {viewport:{width,height:width===390?844:1000}});
  try {
    const page=await context.newPage();
    const response=await page.goto(articleUrl(update.targetUrl),{waitUntil:'domcontentloaded',timeout:45000});
    if(!response?.ok() || articleUrl(page.url())!==update.targetUrl) throw new Error('E_QA_PUBLIC_RESPONSE');
    const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');
    if(articleUrl(canonical)!==update.targetUrl) throw new Error('E_QA_CANONICAL');
    assertPublicTitle(await page.evaluate(() => ({heading:document.querySelector('h1')?.innerText,
      og:document.querySelector('meta[property="og:title"]')?.content})),update.title);
    const root=page.locator(update.id.startsWith('direct-')?'.contents_style:has(.nh-direct-v2)':'.contents_style');
    if(await root.count()!==1) throw new Error('E_QA_ROOT');
    const expectedBody=await page.evaluate(html=>{
      const host=document.createElement('div');
      host.style.cssText='position:fixed;left:-100000px;top:0;width:800px;opacity:0;pointer-events:none';
      host.innerHTML=html;document.body.appendChild(host);
      const text=host.innerText||host.textContent||'';
      const headings=[...host.querySelectorAll('h2')].map(h=>h.innerText||h.textContent||'');
      host.remove();return {text,headings};
    },rendered);
    const actualBody=await root.evaluate(el=>({text:el.innerText,
      headings:[...el.querySelectorAll('h2')].map(h=>h.innerText||h.textContent||'')}));
    if(!publicBodiesMatch(actualBody,expectedBody)) throw new Error('E_QA_BODY');
    if(update.affiliateProducts){
      const evidence=await root.evaluate((el,arg)=>({
        disclosureCount:el.innerText.split(arg.disclosure).length-1,
        linkCounts:arg.urls.map(url=>[...el.querySelectorAll('a')].filter(link=>link.href===url).length),
        sponsored:arg.urls.map(url=>{const link=[...el.querySelectorAll('a')].find(item=>item.href===url);const rel=(link?.getAttribute('rel')||'').toLowerCase().split(/\s+/);return rel.includes('sponsored')&&rel.includes('nofollow');})
      }),{disclosure:COUPANG_DISCLOSURE,urls:update.affiliateProducts.products.map(product=>product.landingUrl)});
      assertAffiliatePublicEvidence(evidence,update.affiliateProducts);
    }
    const images=root.locator('img');
    for(let n=0;n<await images.count();n++) {
      const img=images.nth(n);
      await img.scrollIntoViewIfNeeded();
      await img.evaluate(async el=>{ if(!el.complete) await Promise.race([new Promise(r=>{el.addEventListener('load',r,{once:true});el.addEventListener('error',r,{once:true});}),new Promise(r=>setTimeout(r,15000))]); });
    }
    await page.evaluate(async()=>{await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,5000))]);scrollTo(0,0);});
    const headingProfile=headingStyleProfile(await page.locator('#nh-reading-layout-20261009').count()===1,width);
    const metrics=await root.evaluate((el,headingProfile)=>{
      const imgs=[...el.querySelectorAll('img')],h2=[...el.querySelectorAll('h2')],h3=[...el.querySelectorAll('h3')],tables=[...el.querySelectorAll('table')];
      const hi=[...el.querySelectorAll('span')].filter(n=>/linear-gradient\(transparent 45%,#[0-9a-f]{6} 45%\)/i.test(n.getAttribute('style')||''));
      const colors=new Set(hi.map(n=>(n.getAttribute('style').match(/#[0-9a-f]{6}/i)||[])[0]).filter(Boolean));
      const view=document.documentElement.clientWidth;
      return {
        viewport:view,overflowPx:Math.max(0,document.documentElement.scrollWidth-view),
        images:imgs.length,brokenImages:imgs.filter(n=>!n.complete||n.naturalWidth<=0).length,
        missingAlt:imgs.filter(n=>!n.getAttribute('alt')?.trim()).length,
        nonNativeImages:imgs.filter(n=>{try{const h=new URL(n.currentSrc||n.src).hostname;return !(h==='kakaocdn.net'||h.endsWith('.kakaocdn.net'));}catch{return true;}}).length,
        wideImages:imgs.filter(n=>{const r=n.getBoundingClientRect();return r.width>view||r.right>view+0.5||r.left< -0.5;}).length,
        heroPriority:imgs[0]?.getAttribute('loading')==='eager'&&imgs[0]?.getAttribute('fetchpriority')==='high',
        badLazyImages:imgs.slice(1).filter(n=>n.getAttribute('loading')!=='lazy').length,
        h2:h2.length,h3:h3.length,
        badHeadingStyles:h2.filter(n=>{const c=getComputedStyle(n);return c.fontSize!==headingProfile.h2||c.fontWeight!==headingProfile.weight;}).length+h3.filter(n=>{const c=getComputedStyle(n);return c.fontSize!==headingProfile.h3||c.fontWeight!==headingProfile.weight;}).length,
        tables:tables.length,badTableWraps:tables.filter(n=>!['auto','scroll'].includes(getComputedStyle(n.parentElement).overflowX)).length,
        highlights:hi.length,highlightColors:colors.size,hiddenHighlights:hi.filter(n=>getComputedStyle(n).backgroundImage==='none').length,
        faqQ:[...el.querySelectorAll('span')].filter(n=>n.textContent.trim()==='Q.').length,
        faqA:[...el.querySelectorAll('span')].filter(n=>n.textContent.trim()==='A.').length
      };
    },headingProfile);
    console.log('PUBLIC_QA_METRICS '+JSON.stringify({articleId:update.articleId,width,...metrics}));
    if(update.contentStandard==='SP1'&&update.id.startsWith('direct-')) {
      const snapshot=await root.evaluate(root=>{
        const article=root.querySelector('.nh-direct-v2 .article-body');
        const all=selector=>[...(article?.querySelectorAll(selector)||[])];
        const marks=all('mark'),numbers=all('h2 > small');
        return {roots:root.querySelectorAll('.nh-direct-v2 .article-body').length,
          h2:all('h2').length,numbers:numbers.length,h3:all('h3').length,
          tables:all('table').length,tableWraps:all('.table-scroll > table').length,
          images:all('img').length,marks:marks.length,boldMarks:all('mark strong').length,
          underlinedMarks:all('mark u strong').length,badges:all('.badge').length,
          pairsArticles:all('.pairs > article').length,
          pairsMarkedArticles:all('.pairs > article').filter(card=>card.querySelector('mark strong')).length,
          stylesVisible:marks.every(m=>{
            const s=getComputedStyle(m),b=m.querySelector('strong'),u=m.querySelector('u');
            return s.display!=='none'&&s.visibility!=='hidden'&&s.backgroundColor!=='rgba(0, 0, 0, 0)'&&
              b&&Number(getComputedStyle(b).fontWeight)>=600&&(!u||getComputedStyle(u).textDecorationLine.includes('underline'));
          })&&numbers.every(n=>parseFloat(getComputedStyle(n).fontSize)>=20)};
      });
      assertDirectPublicSnapshot(snapshot,update.bodyHtml);
      if(metrics.overflowPx||metrics.wideImages||metrics.brokenImages||metrics.missingAlt||metrics.nonNativeImages||metrics.badTableWraps)throw Error('E_QA_DIRECT_LAYOUT');
      metrics.direct=snapshot;
    } else if(update.contentStandard==='SP1'){
      const legacy=await root.evaluate(captureSp1LegacySnapshot);
      assertSp1LegacySnapshot(legacy,rendered);checkMeasurements(metrics,expected,{sp1Legacy:true});metrics.sp1Legacy=legacy;
    } else checkMeasurements(metrics,expected);
    if(update.contentStandard==='R1') assertEmphasisContract(await root.innerHTML(),update.bodyHtml);
    if(assetChecks) {
      const og=ogAsset(await page.locator('meta[property="og:image"]').getAttribute('content'));
      const hero=await images.first().getAttribute('src');
      const assets=await Promise.allSettled([bytes(context.request,hero,'hero'),bytes(context.request,og,'og'),bytes(context.request,update.representativeImageUrl,'source')]);
      if(assets.some(a=>a.status!=='fulfilled')) throw new Error('E_QA_IMAGE_FETCH');
      const [a,b,c]=assets.map(x=>x.value);
      if(hash(a)!==hash(b)||hash(a)!==hash(c)) throw new Error('E_QA_REPRESENTATIVE_CONTENT');
      metrics.representativeSourceMatch=true;
      metrics.ogNative=true;
      const links=await root.locator('a').evaluateAll(nodes=>[...new Set(nodes.map(a=>a.href).filter(u=>/^https:\/\/nhunnhun\.tistory\.com\/\d+$/.test(u)))]);
      for(const url of links) await verifyInternalLink(context.request,url);
      metrics.internalLinks=links.length;
    }
    return metrics;
  } finally {await context.close();}
}
async function main() {
  const [{loadUpdates,updateFingerprint},{UpdateLedger},{localBrowserConfig,openPublicBrowser},{renderEditorialPost,editorialExpectations,editorialVersionFor}]=await Promise.all([
    import('./update-core.mjs'),import('./update-ledger.mjs'),import('./local-browser.mjs'),import('./editorial.mjs')
  ]);
  const ledger=new UpdateLedger(),updates=await loadUpdates();
  const selected=(process.env.PUBLIC_VERIFY_ARTICLE_IDS||'').split(',').filter(Boolean);
  if(selected.some(s=>!/^\d+$/.test(s))) throw new Error('E_QA_FILTER');
  const targets=updates.filter(u=>!selected.length||selected.includes(u.articleId));
  if(!targets.length || (selected.length && targets.length!==new Set(selected).size)) throw new Error('E_QA_TARGET_COUNT');
  let browser;
  try {
    browser=await openPublicBrowser(await localBrowserConfig());
    let failures=0;
    for(const update of targets) {
      try {
        const state=await ledger.read(update.id);
        if(state?.phase!=='updated'||state.url!==update.targetUrl||state.fingerprint!==updateFingerprint(update)) throw new Error('E_QA_LEDGER');
        const rendered=renderEditorialPost(update),expected=editorialExpectations(update.bodyHtml,{version:editorialVersionFor(update)});
        const desktop=await verifyUpdatedPage(browser,update,1440,expected,rendered,true);
        const mobile=await verifyUpdatedPage(browser,update,390,expected,rendered,false);
        console.log('PUBLIC_QA_PASS '+JSON.stringify({articleId:update.articleId,url:update.targetUrl,title:update.title,desktop,mobile}));
      } catch(error) {
        failures++;
        console.log('PUBLIC_QA_FAIL '+JSON.stringify({articleId:update.articleId,code:/^E_QA_[A-Z_]+$/.test(error?.message||'')?error.message:'E_QA_RUNTIME'}));
      }
    }
    if(failures) throw new Error('E_QA_INCOMPLETE');
    console.log('PUBLIC_QA_COMPLETE '+targets.length);
  } finally {await browser?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{
  console.error(/^E_QA_[A-Z_]+$/.test(error?.message||'')?error.message:'E_QA_RUNTIME');process.exitCode=1;
});
