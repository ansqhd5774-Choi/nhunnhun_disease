import { assertPublicTitle } from './public-title.mjs';
import { assertEmphasisContract } from './content-emphasis.mjs';
import { assertDirectPublicSnapshot } from './direct-public-contract.mjs';
import { verificationContext } from './verification-context.mjs';
import { publicBodiesMatch } from './public-body.mjs';
import {COUPANG_DISCLOSURE,assertAffiliatePublicEvidence} from './affiliate-products.mjs';
export async function verifyPublishedPublic({publicPage,publicBrowser,post,bodyHtml,sources,representativeSource,editorialExpected,url}) {
  assertPublicTitle(await publicPage.evaluate(() => ({title:document.title,og:document.querySelector('meta[property="og:title"]')?.content,heading:document.querySelector('h1')?.innerText})),post.title);
  const content = publicPage.locator('.contents_style');
  if (await content.count() !== 1) throw new Error('E_BODY_UNVERIFIED');
  if(post.contentStandard==='R1') assertEmphasisContract(await content.innerHTML(),post.bodyHtml);
  const actualBody=await content.evaluate(el=>({
    text:el.innerText||el.textContent||'',
    headings:[...el.querySelectorAll('h2')].map(h=>h.innerText||h.textContent||'')
  }));
  // Compare through the same public-body contract used by existing-post QA.
  // The reading skin may remove only an H2 numbering decoration; prose and quantities stay exact.
  const expectedBody = await publicPage.evaluate(html => {
    const host=document.createElement('div');
    host.setAttribute('aria-hidden','true');
    host.style.cssText='position:fixed;left:-100000px;top:0;width:800px;opacity:0;pointer-events:none;';
    host.innerHTML=html;
    document.body.appendChild(host);
    const result={
      text:host.innerText||host.textContent||'',
      headings:[...host.querySelectorAll('h2')].map(h=>h.innerText||h.textContent||'')
    };
    host.remove();
    return result;
  }, bodyHtml);
  if (!expectedBody.text || !publicBodiesMatch(actualBody,expectedBody)) throw new Error('E_BODY_UNVERIFIED');
  if(post.affiliateProducts){
    const evidence=await content.evaluate((root,arg)=>({
      disclosureCount:root.innerText.split(arg.disclosure).length-1,
      linkCounts:arg.urls.map(url=>[...root.querySelectorAll('a')].filter(link=>link.href===url).length),
      sponsored:arg.urls.map(url=>{const link=[...root.querySelectorAll('a')].find(item=>item.href===url);const rel=(link?.getAttribute('rel')||'').toLowerCase().split(/\s+/);return rel.includes('sponsored')&&rel.includes('nofollow');})
    }),{disclosure:COUPANG_DISCLOSURE,urls:post.affiliateProducts.products.map(product=>product.landingUrl)});
    assertAffiliatePublicEvidence(evidence,post.affiliateProducts);
  }
  if (sources.length) {
    for (const image of await content.locator('img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(img => img.decode());
      if (!(await image.evaluate(img => img.complete && img.naturalWidth > 0))) throw new Error('E_IMAGE_UNVERIFIED');
    }
    const publicImages = await content.locator('img').evaluateAll(imgs => imgs.map(img => img.src));
    if (publicImages.length < sources.length || publicImages.slice(0, sources.length).some(src => !src.includes('kakaocdn.net'))) throw new Error('E_IMAGE_UNVERIFIED');
  }
  if (representativeSource) {
    const og = await publicPage.locator('meta[property="og:image"]').getAttribute('content').catch(()=>null);
    if (!og || og.includes('opengraph.png') || !og.includes('kakaocdn.net')) throw new Error('E_REPRESENTATIVE_UNVERIFIED');
  }
  if (post.contentStandard === 'SP1' && post.id.startsWith('direct-')) {
    const directSnapshot=await content.evaluate(root=>{
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
          const s=getComputedStyle(m),b=m.querySelector('strong');
          const u=m.querySelector('u');
          return s.display!=='none'&&s.visibility!=='hidden'&&s.backgroundColor!=='rgba(0, 0, 0, 0)'&&
            b&&Number(getComputedStyle(b).fontWeight)>=600&&(!u||getComputedStyle(u).textDecorationLine.includes('underline'));
        })&&numbers.every(n=>parseFloat(getComputedStyle(n).fontSize)>=20)};
    });
    assertDirectPublicSnapshot(directSnapshot,post.bodyHtml);
  } else {
  const editorialSnapshot = await content.evaluate(root => {
    const h2=[...root.querySelectorAll('h2')];
    const h3=[...root.querySelectorAll('h3')];
    const accents=[...root.querySelectorAll('div[aria-hidden="true"]')].filter(x => {
      const s=x.getAttribute('style')||'';
      return /width:\s*34px/.test(s) && /height:\s*4px/.test(s);
    });
    const tables=[...root.querySelectorAll('table')];
    const tableWraps=tables.filter(t => {
      const p=t.parentElement;
      return p && /overflow-x:\s*auto/.test(p.getAttribute('style')||'');
    });
    const images=[...root.querySelectorAll('img')];
    const responsiveImages=images.filter(img => {
      const s=img.getAttribute('style')||'';
      return /width:\s*100%/.test(s) && /max-width:\s*720px/.test(s);
    });
    const priorityImages=images.filter(img => img.getAttribute('loading')==='eager' && img.getAttribute('fetchpriority')==='high');
    const highlights=[...root.querySelectorAll('span')].filter(x => /background:\s*linear-gradient\(transparent 45%,#[0-9a-f]{6} 45%\)/i.test(x.getAttribute('style')||''));
    const highlightColors=new Set(highlights.map(x => ((x.getAttribute('style')||'').match(/linear-gradient\(transparent 45%,(#[0-9a-f]{6}) 45%\)/i)||[])[1]).filter(Boolean).map(x=>x.toLowerCase()));
    const quickCards=[...root.querySelectorAll('p')].filter(p => /이것만 먼저 보세요$/.test(p.textContent.trim()) && /background:\s*#f7f9fc/.test(p.parentElement?.getAttribute('style')||''));
    const qs=[...root.querySelectorAll('span')].filter(x => x.textContent.trim()==='Q.');
    const as=[...root.querySelectorAll('span')].filter(x => x.textContent.trim()==='A.');
    const latest=[...root.querySelectorAll('div')].filter(x => /최신 근거\s*·?\s*\d{4}/.test(x.textContent) && /background:\s*#fbfcfe/.test(x.getAttribute('style')||''));
    const summary=[...h2].find(x=>x.textContent.trim()==='핵심 정리');
    const related=[...h2].find(x=>x.textContent.trim()==='함께 보면 좋은 글');
    const sources=[...h2].find(x=>x.textContent.trim()==='자료 출처');
    return {
      h2:h2.length,
      h2Styled:h2.filter(x=>/font-size:\s*26px/.test(x.getAttribute('style')||'')&&/font-weight:\s*800/.test(x.getAttribute('style')||'')).length,
      h3:h3.length,
      h3Styled:h3.filter(x=>/font-size:\s*20px/.test(x.getAttribute('style')||'')&&/font-weight:\s*800/.test(x.getAttribute('style')||'')).length,
      accents:accents.length,
      tables:tables.length,
      tableWraps:tableWraps.length,
      images:images.length,
      responsiveImages:responsiveImages.length,
      priorityImages:priorityImages.length,
      highlights:highlights.length,
      highlightColors:highlightColors.size,
      quickCards:quickCards.length,
      faqQ:qs.length,
      faqA:as.length,
      latest:latest.length,
      summaryBox:!!(summary?.nextElementSibling && /background:\s*#f8fafc/.test(summary.nextElementSibling.getAttribute('style')||'')),
      relatedCards:related ? (()=>{ let n=0,e=related.nextElementSibling; while(e&&e.tagName!=='H2'){ if(e.querySelector?.('a[style*="text-decoration:none"]')) n++; e=e.nextElementSibling; } return n; })() : 0,
      sourcesStyled:!!(sources?.nextElementSibling && sources.nextElementSibling.tagName==='UL' && /font-size:\s*14px/.test(sources.nextElementSibling.getAttribute('style')||''))
    };
  });
  if (
    editorialSnapshot.h2 !== editorialExpected.h2 ||
    editorialSnapshot.h2Styled !== editorialExpected.h2 ||
    editorialSnapshot.accents !== editorialExpected.h2 ||
    editorialSnapshot.h3 !== editorialExpected.h3 ||
    editorialSnapshot.h3Styled !== editorialExpected.h3 ||
    editorialSnapshot.tables !== editorialExpected.tables ||
    editorialSnapshot.tableWraps !== editorialExpected.tables ||
    editorialSnapshot.images !== editorialExpected.images ||
    editorialSnapshot.responsiveImages !== editorialExpected.images ||
    (editorialExpected.images > 0 && editorialSnapshot.priorityImages < 1) ||
    editorialSnapshot.highlights !== editorialExpected.highlights ||
    (editorialSnapshot.highlightColors < editorialExpected.minimumHighlightColors) ||
    editorialSnapshot.quickCards !== editorialExpected.quick ||
    editorialSnapshot.faqQ !== editorialExpected.faq ||
    editorialSnapshot.faqA !== editorialExpected.faq ||
    editorialSnapshot.latest !== editorialExpected.latest ||
    (editorialExpected.summary && !editorialSnapshot.summaryBox) ||
    (editorialExpected.related && editorialSnapshot.relatedCards !== editorialExpected.relatedLinks) ||
    (editorialExpected.sources && !editorialSnapshot.sourcesStyled)
  ) throw new Error('E_EDITORIAL_PUBLIC_CONTRACT');
  }
  if (['R1','SP1'].includes(post.contentStandard)) {
    const mobileContext = await verificationContext(publicBrowser, {viewport:{width:390,height:844}});
    try {
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto(url, {waitUntil:'domcontentloaded'});
      const mobileContent = mobilePage.locator('.contents_style');
      if (await mobileContent.count() !== 1) throw new Error('E_CONTENT_MOBILE_BODY');
      const mobileBody=await mobileContent.evaluate(el=>({
        text:el.innerText||el.textContent||'',
        headings:[...el.querySelectorAll('h2')].map(h=>h.innerText||h.textContent||'')
      }));
      if(!publicBodiesMatch(mobileBody,expectedBody)) throw new Error('E_CONTENT_MOBILE_BODY');
      if(post.contentStandard==='R1') assertEmphasisContract(await mobileContent.innerHTML(), post.bodyHtml);
      const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (overflow) throw new Error('E_CONTENT_MOBILE_OVERFLOW');
    } finally { await mobileContext.close(); }
  }

}
