import {renderDirectArticle} from './direct-design.mjs';
import {renderArticleCitations} from './article-citations.mjs';
import { renderSemanticEmphasis, emphasisExpectations, assertEmphasisContract } from './content-emphasis.mjs';
import {insertAffiliateProductsBlock} from './affiliate-products.mjs';
export const EDITORIAL_TEMPLATE_VERSION='R4';
export const editorialVersionFor = post => post?.contentStandard === 'R1' ? 'R4' : post?.contentStandard === 'SP1' ? 'SP1' : 'R3';

const ACCENT='<div aria-hidden="true" style="width:34px;height:4px;background:#2563eb;border-radius:999px;margin:48px 0 10px;"></div>';
const H2='<h2 style="margin:0 0 18px;padding:0;font-size:26px;line-height:1.4;font-weight:800;letter-spacing:-0.02em;color:#111827;border:0;background:none;">';
const H3='<h3 style="margin:30px 0 10px;padding:0;font-size:20px;line-height:1.45;font-weight:800;letter-spacing:-0.01em;color:#1f2937;border:0;background:none;">';
const SOURCE='margin:8px 0 24px;padding-top:8px;border-top:1px solid #eef1f4;font-size:12px;line-height:1.6;color:#6b7280;';
const HIGHLIGHT_COLORS=['#fff1a8','#d9f99d','#bfdbfe','#fbcfe8'];

function count(html,re){ return [...html.matchAll(re)].length; }
function topicFromTitle(title=''){
  const first=String(title).trim().split(/[\s·:—-]+/)[0];
  if(!first) return '';
  return first.length>1 && first.endsWith('의') ? first.slice(0,-1) : first;
}
function imageTags(html){ return [...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]); }
function imageSources(html){
  return [...html.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/gi)].map(m=>m[2]);
}
function externalLinks(html){
  return [...html.matchAll(/<a\b[^>]*\bhref=(["'])(https:\/\/[^"']+)\1[^>]*>/gi)]
    .map(m=>m[2]).filter(url=>!url.startsWith('https://nhunnhun.tistory.com/'));
}
function applyHighlights(html){
  let index=0;
  return html.replace(/<u>([\s\S]*?)<\/u>/g,(_m,inner)=>{
    const color=HIGHLIGHT_COLORS[index++ % HIGHLIGHT_COLORS.length];
    return `<span style="background:linear-gradient(transparent 45%,${color} 45%);padding:0 .06em;">${inner}</span>`;
  });
}
function styleTable(inner,{fluid=false}={}){
  let t=inner;
  t=t.replace(/<thead><tr>/g,'<thead><tr style="background:#f5f6f8;">');
  t=t.replace(/<th>/g,'<th style="padding:11px 12px;border-bottom:1px solid #dfe4ea;text-align:left;font-weight:700;">');
  t=t.replace(/<td>/g,'<td style="padding:10px 12px;border-top:1px solid #eef1f4;vertical-align:top;">');
  return '<div style="overflow-x:auto;margin:14px 0 10px;border:1px solid #e5e7eb;border-radius:8px;"><table style="width:100%;'+(fluid?'min-width:0;table-layout:auto;overflow-wrap:anywhere;':'min-width:520px;')+'border-collapse:collapse;margin:0;background:#fff;font-size:14px;line-height:1.55;">'+t+'</table></div>';
}

export function assertEditorialSource(post){
  if(post?.contentStandard==='SP1')return post;
  const html=post.bodyHtml;
  const h2=count(html,/<h2>/g);
  const images=imageSources(html);
  const tags=imageTags(html);
  if(h2<4) throw new Error('E_EDITORIAL_SOURCE_TOO_THIN');
  if(!/<h2>핵심 정리<\/h2>/.test(html)) throw new Error('E_EDITORIAL_SUMMARY_REQUIRED');
  if(!/<h2>자료 출처<\/h2>/.test(html)) throw new Error('E_EDITORIAL_SOURCES_REQUIRED');
  if(images.length<3 || new Set(images).size<3) throw new Error('E_EDITORIAL_IMAGE_MINIMUM');
  if(tags.some(tag=>{ const alt=tag.match(/\balt=(["'])(.*?)\1/i); return !alt || !alt[2].trim(); })) throw new Error('E_EDITORIAL_IMAGE_ALT_REQUIRED');
  const firstImage=html.search(/<img\b/i);
  const firstH2=html.indexOf('<h2>');
  if(firstImage<0 || firstH2<0 || firstImage>firstH2) throw new Error('E_EDITORIAL_HERO_REQUIRED');
  if(!/^\s*<p>\s*<img\b[^>]*>\s*<\/p>\s*<p>/i.test(html)) throw new Error('E_EDITORIAL_LEAD_REQUIRED');
  if(!/<blockquote><strong>핵심만 먼저:<\/strong>[\s\S]*?<\/blockquote>/.test(html.slice(0,firstH2))) throw new Error('E_EDITORIAL_QUICK_REQUIRED');
  if(!post.representativeImageUrl) throw new Error('E_REPRESENTATIVE_IMAGE_REQUIRED');
  if(!images.includes(post.representativeImageUrl)) throw new Error('E_REPRESENTATIVE_IMAGE_NOT_IN_BODY');
  const sourceBlock=html.match(/<h2>자료 출처<\/h2>\s*<ul>([\s\S]*?)<\/ul>/);
  if(!sourceBlock) throw new Error('E_EDITORIAL_SOURCES_REQUIRED');
  if(new Set(externalLinks(sourceBlock[1])).size<2) throw new Error('E_EDITORIAL_EVIDENCE_REQUIRED');
  return post;
}

export function editorialExpectations(sourceHtml,{version='R3'}={}){
  const latest=count(sourceHtml,/<h2>최신 근거\s*·?\s*\d{4}<\/h2>\s*<blockquote>/g);
  return {
    h2:count(sourceHtml,/<h2>/g)-latest,
    h3:count(sourceHtml,/<h3>/g),
    tables:count(sourceHtml,/<table>/g),
    images:count(sourceHtml,/<img\b/g),
    version,
    highlights:version==='R4'?emphasisExpectations(sourceHtml).highlights:count(sourceHtml,/<u>/g),
    minimumHighlightColors:version==='R4'?emphasisExpectations(sourceHtml).minimumHighlightColors:(count(sourceHtml,/<u>/g)>=2?2:count(sourceHtml,/<u>/g)),
    faq:count(sourceHtml,/<p><strong>Q\.\s*[^<]+<\/strong><br\/?/g),
    latest,
    quick:/<blockquote><strong>핵심만 먼저:<\/strong>/g.test(sourceHtml) ? 1 : 0,
    summary:/<h2>핵심 정리<\/h2>/.test(sourceHtml) ? 1 : 0,
    related:/<h2>함께 보면 좋은 글<\/h2>/.test(sourceHtml) ? 1 : 0,
    relatedLinks:(sourceHtml.match(/<p><a href="https:\/\/nhunnhun\.tistory\.com\/[^"]+"><strong>[^<]+<\/strong><\/a><\/p>/g)||[]).length,
    sources:/<h2>자료 출처<\/h2>/.test(sourceHtml) ? 1 : 0,
  };
}

export function applyEditorialTemplate(html,{title='',version='R3'}={}){
  let out=html;
  const topic=topicFromTitle(version==='R4'?title.replace(/\([^)]*\)/gu,''):title);

  // Restrained multi-color highlighter: source <u> marks only short key phrases.
  out=version==='R4'?renderSemanticEmphasis(out):version==='SP1'?out.replace(/<mark>/g,'<mark style="background:#fff1a8;color:inherit;padding:0 .06em;">').replace(/<u>/g,'<u style="text-decoration:underline;text-underline-offset:3px;">'):applyHighlights(out);

  // Hero and lead.
  out=out.replace(
    /<p>\s*(<img\b[^>]*>)\s*<\/p>\s*<p>/i,
    (_m,img)=>'<p>'+img.replace(/>$/, ' loading="eager" fetchpriority="high" decoding="async" style="width:100%;max-width:720px;height:auto;display:block;margin:18px auto 24px;">')+'</p><p style="margin:0 0 20px;font-size:16px;line-height:1.8;color:#374151;">'
  );

  // Remaining plain image paragraphs.
  out=out.replace(/<p>\s*(<img\b[^>]*>)\s*<\/p>/gi,(_m,img)=>{
    if(/style=/.test(img)) return '<p>'+img+'</p>';
    return '<p>'+img.replace(/>$/, ' loading="lazy" decoding="async" style="width:100%;max-width:720px;height:auto;display:block;margin:18px auto 24px;">')+'</p>';
  });

  // SP1 image limits also apply when the live skin has not yet received the CSS patch.
  if(version==='SP1')out=out.replace(/<img\b[^>]*>/gi,tag=>{
    const limit='max-width:min(100%,640px) !important;max-height:420px !important;width:auto !important;height:auto !important;object-fit:contain;display:block;margin:20px auto;';
    return /\sstyle="/.test(tag)?tag.replace(/\sstyle="([^"]*)"/,(_m,style)=>' style="'+style+';'+limit+'"'):tag.replace(/>$/,' style="'+limit+'">');
  });

  // Opening quick summary becomes the standard top information card.
  out=out.replace(
    /<blockquote><strong>핵심만 먼저:<\/strong>\s*([\s\S]*?)<\/blockquote>/,
    '<div style="margin:20px 0 28px;padding:18px 20px;background:#f7f9fc;border:1px solid #e5eaf0;border-radius:10px;"><p style="margin:0 0 10px;font-size:19px;font-weight:800;color:#111827;">'+(topic?topic+', ':'')+'이것만 먼저 보세요</p><p style="margin:0;line-height:1.8;color:#374151;">$1</p></div>'
  );

  // Latest evidence is subordinate to the numbered content flow.
  out=out.replace(
    /<h2>(최신 근거\s*·?\s*\d{4})<\/h2>\s*<blockquote>([\s\S]*?)<\/blockquote>/g,
    '<div style="margin:28px 0 32px;padding:16px 18px;border:1px solid #dfe5ec;border-radius:8px;background:#fbfcfe;"><p style="margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:.04em;color:#2563eb;">$1</p>$2</div>'
  );

  let sectionNumber=0;
  if(version==='SP1')out=out.replace(/<h2>(\s*\d+\.\s+)?/g,(_match,existingNumber)=>'<h2 style="margin:36px 0 16px;padding:16px 0 0;border:0;border-top:1px solid #e2e5e9;background:none;font-size:24px;line-height:1.45;font-weight:800;color:#243142;">'+(existingNumber?(++sectionNumber,existingNumber):(++sectionNumber)+'. '));
  else out=out.replace(/<h2>/g,()=>ACCENT+H2);
  out=out.replace(/<h3>/g,version==='SP1'?'<h3 style="margin:24px 0 12px;font-size:19px;line-height:1.5;color:#243142;font-weight:700;">':H3);

  out=out.replace(/<table>\s*([\s\S]*?)\s*<\/table>/g,(_m,inner)=>styleTable(inner,{fluid:version==='SP1'}));
  if(version==='SP1'){
    out=out.replace(/<p>/g,'<p style="margin:0 0 16px;font-size:16px;line-height:1.85;color:#334155;overflow-wrap:anywhere;">');
    out=out.replace(/<ol>/g,'<ol style="margin:18px 0 24px;padding-left:26px;color:#334155;">');
    out=out.replace(/<ul>/g,'<ul style="margin:18px 0 24px;padding-left:24px;color:#334155;">');
    out=out.replace(/<li>/g,'<li style="margin:0 0 10px;padding:0;background:none;border:0;font-size:16px;line-height:1.8;color:#243142;overflow-wrap:anywhere;">');
    out=out.replace(/<strong>/g,'<strong style="font-weight:750;color:#182332;">');
    out=out.replace(/background:#f5f6f8;/g,'background:#f4f3ef;');
    out=out.replace(/table-layout:auto;/g,'table-layout:fixed;');
    out=out.replace(/(<t[dh] style=")/g,'$1white-space:normal !important;min-width:0 !important;overflow-wrap:anywhere;');
  }

  out=out.replace(/<blockquote>/g,'<blockquote style="margin:18px 0 28px;padding:16px 18px;background:#f8fafc;border-left:4px solid #334155;color:#1f2937;">');

  // Inline evidence is separated from prose.
  out=out.replace(
    /<p>([\s\S]*?)\s+(<a href="https:\/\/(?!nhunnhun\.tistory\.com)[^"]+"[^>]*>[^<]+<\/a>)<\/p>/g,
    '<p>$1</p><p style="'+SOURCE+'">근거: $2</p>'
  );

  out=out.replace(
    /<p><strong>Q\.\s*([^<]+)<\/strong><br\/?>([\s\S]*?)<\/p>/g,
    (_match,question,answer)=>{
      // R4 source may already carry the answer label. Preserve legacy R3 output.
      const body=version==='R4'?answer.replace(/^\s*A\.\s*/u,''):answer;
      return '<div style="margin:0 0 24px;padding:16px 18px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;"><p style="margin:0 0 8px;font-size:16px;font-weight:800;color:#111827;"><span style="display:inline-block;margin-right:6px;color:#2563eb;">Q.</span>'+question+'</p><p style="margin:0;color:#374151;line-height:1.75;"><span style="font-weight:700;color:#6b7280;margin-right:6px;">A.</span>'+body+'</p></div>';
    }
  );

  out=out.replace(
    /(<h2[^>]*>핵심 정리<\/h2>)\s*<ul>([\s\S]*?)<\/ul>/,
    '$1<div style="margin:0 0 12px;padding:16px 18px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;"><ul style="margin:0;padding-left:20px;line-height:1.85;">$2</ul></div>'
  );

  out=out.replace(
    /(<h2[^>]*>함께 보면 좋은 글<\/h2>)((?:\s*<p><a href="https:\/\/nhunnhun\.tistory\.com\/[^"]+"><strong>[^<]+<\/strong><\/a><\/p>)+)/,
    (_m,head,block)=>{
      const cards=[...block.matchAll(/<p><a href="([^"]+)"><strong>([^<]+)<\/strong><\/a><\/p>/g)]
        .map(x=>'<div style="margin:0 0 10px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;"><a href="'+x[1]+'" style="font-weight:800;text-decoration:none;">'+x[2]+' →</a></div>')
        .join('');
      return head+cards;
    }
  );

  out=out.replace(
    /(<h2[^>]*>자료 출처<\/h2>)\s*<ul>/,
    '$1<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.75;color:#4b5563;">'
  );

  return out;
}

export function assertEditorialContract(renderedHtml,sourceHtml,{version='R3'}={}){
  if(version==='SP1')return renderedHtml;
  const e=editorialExpectations(sourceHtml,{version});
  if(version==='R4') assertEmphasisContract(renderedHtml,sourceHtml);
  const h2=count(renderedHtml,/<h2\b/g);
  const h2Styled=count(renderedHtml,/<h2\b[^>]*font-size:26px[^>]*font-weight:800[^>]*>/g);
  const accents=count(renderedHtml,/<div aria-hidden="true" style="width:34px;height:4px;background:#2563eb;/g);
  const h3=count(renderedHtml,/<h3\b/g);
  const h3Styled=count(renderedHtml,/<h3\b[^>]*font-size:20px[^>]*font-weight:800[^>]*>/g);
  const tables=count(renderedHtml,/<table\b/g);
  const tableWraps=count(renderedHtml,/<div style="overflow-x:auto;[^"]*"><table\b/g);
  const images=count(renderedHtml,/<img\b/g);
  const responsiveImages=count(renderedHtml,/<img\b[^>]*style="[^"]*width:100%;[^"]*max-width:720px;[^"]*"/g);
  const highlights=count(renderedHtml,/<span\b[^>]*style="background:linear-gradient\(transparent 45%,#[0-9a-f]{6} 45%\);padding:0 \.06em;">/gi);
  const highlightColors=new Set([...renderedHtml.matchAll(/background:linear-gradient\(transparent 45%,(#[0-9a-f]{6}) 45%\)/gi)].map(m=>m[1].toLowerCase()));
  const q=count(renderedHtml,/>Q\.<\/span>/g);
  const a=count(renderedHtml,/>A\.<\/span>/g);
  if(h2!==e.h2 || h2Styled!==e.h2 || accents!==e.h2) throw new Error('E_EDITORIAL_H2_CONTRACT');
  if(h3!==e.h3 || h3Styled!==e.h3) throw new Error('E_EDITORIAL_H3_CONTRACT');
  if(tables!==e.tables || tableWraps!==e.tables) throw new Error('E_EDITORIAL_TABLE_CONTRACT');
  if(images!==e.images || responsiveImages!==e.images) throw new Error('E_EDITORIAL_IMAGE_CONTRACT');
  if(highlights!==e.highlights) throw new Error('E_EDITORIAL_HIGHLIGHT_CONTRACT');
  if(highlightColors.size<e.minimumHighlightColors) throw new Error('E_EDITORIAL_HIGHLIGHT_COLOR_CONTRACT');
  if(q!==e.faq || a!==e.faq) throw new Error('E_EDITORIAL_FAQ_CONTRACT');
  if(e.latest && count(renderedHtml,/<div\b[^>]*background:#fbfcfe;[^>]*>[\s\S]*?최신 근거\s*·?\s*\d{4}[\s\S]*?<\/div>/g)!==e.latest) throw new Error('E_EDITORIAL_LATEST_CONTRACT');
  if(e.quick && !/이것만 먼저 보세요<\/p>/.test(renderedHtml)) throw new Error('E_EDITORIAL_QUICK_CONTRACT');
  if(e.summary && !/핵심 정리<\/h2><div style="margin:0 0 12px;padding:16px 18px;background:#f8fafc;/.test(renderedHtml)) throw new Error('E_EDITORIAL_SUMMARY_CONTRACT');
  if(e.related && !/함께 보면 좋은 글<\/h2>[\s\S]*text-decoration:none;/.test(renderedHtml)) throw new Error('E_EDITORIAL_RELATED_CONTRACT');
  if(e.sources && !/자료 출처<\/h2><ul style="margin:0;padding-left:20px;font-size:14px;/.test(renderedHtml)) throw new Error('E_EDITORIAL_SOURCES_CONTRACT');
  return renderedHtml;
}

export function renderEditorialPost(post){
  if(post.contentStandard==='SP1'&&post.id?.startsWith('direct-'))return insertAffiliateProductsBlock(renderDirectArticle(post.bodyHtml),post.affiliateProducts);
  assertEditorialSource(post);
  const version=editorialVersionFor(post);
  const rendered=renderArticleCitations(applyEditorialTemplate(post.bodyHtml,{title:post.title,version}),post);
  return insertAffiliateProductsBlock(assertEditorialContract(rendered,post.bodyHtml,{version}),post.affiliateProducts);
}
