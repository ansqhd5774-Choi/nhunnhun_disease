import test from 'node:test';
import assert from 'node:assert/strict';
import {articleUrl,ogAsset,checkMeasurements,assertImagePayload,verifyInternalLink,headingStyleProfile} from '../publishing/verify-updated-public.mjs';
import {renderDirectArticle} from '../publishing/direct-design.mjs';
const e={images:3,h2:10,h3:3,tables:2,highlights:7,faq:5};
const m={overflowPx:0,wideImages:0,images:3,missingAlt:0,brokenImages:0,nonNativeImages:0,h2:10,h3:3,badHeadingStyles:0,tables:2,badTableWraps:0,highlights:7,highlightColors:4,hiddenHighlights:0,faqQ:5,faqA:5,heroPriority:true,badLazyImages:0};
test('approved reading skin uses exact responsive headings while legacy keeps its own profile',()=>{
 assert.deepEqual(headingStyleProfile(true,1440),{h2:'24px',h3:'19px',weight:'800'});
 assert.deepEqual(headingStyleProfile(true,390),{h2:'22px',h3:'19px',weight:'800'});
 assert.deepEqual(headingStyleProfile(true,600),{h2:'22px',h3:'19px',weight:'800'});
 assert.deepEqual(headingStyleProfile(true,601),{h2:'24px',h3:'19px',weight:'800'});
 assert.deepEqual(headingStyleProfile(false,390),{h2:'26px',h3:'20px',weight:'800'});
});

test('only authorized numeric public article URLs',()=>{
  assert.equal(articleUrl('https://nhunnhun.tistory.com/112'),'https://nhunnhun.tistory.com/112');
  for(const s of ['https://nutriments.tistory.com/112','https://nhunnhun.tistory.com/manage','http://nhunnhun.tistory.com/112','https://nhunnhun.tistory.com/112?x=1']) assert.throws(()=>articleUrl(s));
});
test('unwrap trusted Open Graph proxy',()=>assert.equal(ogAsset('https://img1.daumcdn.net/thumb/R800x0/?fname=https%3A%2F%2Fblog.kakaocdn.net%2Fdna%2Fimage.jpg'),'https://blog.kakaocdn.net/dna/image.jpg'));
test('reject deceptive Open Graph hosts',()=>{for(const s of ['https://evil.test/?fname=https://blog.kakaocdn.net/a.jpg','https://blog.kakaocdn.net.evil.test/a.jpg','https://img1.daumcdn.net/?fname=https://evil.test/a.jpg'])assert.throws(()=>ogAsset(s));});
test('complete measurements pass',()=>assert.equal(checkMeasurements(m,e),true));
test('even one pixel document overflow fails',()=>assert.throws(()=>checkMeasurements({...m,overflowPx:1},e),/E_QA_OVERFLOW/));
test('broken or unlabelled image fails',()=>{for(const key of ['brokenImages','missingAlt','nonNativeImages','badLazyImages'])assert.throws(()=>checkMeasurements({...m,[key]:1},e));});
test('computed heading and table styles fail closed',()=>{for(const key of ['badHeadingStyles','badTableWraps'])assert.throws(()=>checkMeasurements({...m,[key]:1},e));});
test('single color and hidden emphasis fail',()=>{assert.throws(()=>checkMeasurements({...m,highlightColors:1},e));assert.throws(()=>checkMeasurements({...m,hiddenHighlights:1},e));});
test('octet-stream is accepted only for actual supported image signatures',()=>{
  const jpg=Buffer.from([255,216,255,224,0,16]);
  assert.equal(assertImagePayload('application/octet-stream',jpg),jpg);
  assert.equal(assertImagePayload('image/jpeg',jpg),jpg);
});
test('invalid bytes fail even with an image MIME type',()=>{
  for(const mime of ['image/jpeg','application/octet-stream']) assert.throws(()=>assertImagePayload(mime,Buffer.from('<html>not an image</html>')),/E_QA_IMAGE_SIGNATURE/);
});
test('HTML response is not allowed even with a copied signature',()=>assert.throws(()=>assertImagePayload('text/html',Buffer.from([255,216,255,224,0,16])),/E_QA_IMAGE_TYPE/));

test('internal-link verifier retries transient 503 and then passes',async()=>{
  let calls=0;
  const request={get:async()=>{calls++;return calls===1
    ? {ok:()=>false,status:()=>503,url:()=> 'https://nhunnhun.tistory.com/374'}
    : {ok:()=>true,status:()=>200,url:()=> 'https://nhunnhun.tistory.com/374'};}};
  assert.equal(await verifyInternalLink(request,'https://nhunnhun.tistory.com/374',async()=>{}),true);
  assert.equal(calls,2);
});
test('internal-link verifier still fails permanent 404',async()=>{
  const request={get:async()=>({ok:()=>false,status:()=>404,url:()=> 'https://nhunnhun.tistory.com/374'})};
  await assert.rejects(()=>verifyInternalLink(request,'https://nhunnhun.tistory.com/374',async()=>{}),/E_QA_INTERNAL_LINK/);
});
import { publishedUrls } from '../publishing/published-url.mjs';
import {directPublicExpectations,assertDirectPublicSnapshot} from '../publishing/direct-public-contract.mjs';

test('approved direct quick summary renders six cards with responsive two-column to one-column layout',()=>{
  const html='<blockquote><strong>핵심만 먼저:</strong> <strong>효능</strong> 항산화·염증 신호 조절<br><strong>누가</strong> 관련 관리가 필요한 사람<br><strong>복용</strong> 하루 1캡슐 예시<br><strong>기간</strong> 4주 첫 점검<br><strong>조합</strong> PEA 등 근거 있는 조합<br><strong>주의</strong> 하루 총량 확인</blockquote><h2>소개</h2><p>본문</p>';
  const rendered=renderDirectArticle(html);
  assert.match(rendered,/class="quick-summary"/);
  assert.equal((rendered.match(/class="quick-summary-item"/g)||[]).length,6);
  for(const label of ['효능','누가','복용','기간','조합','주의']) assert.match(rendered,new RegExp('quick-summary-label">'+label));
  assert.match(rendered,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(rendered,/@media\(max-width:600px\)[\s\S]*?quick-summary-grid\{grid-template-columns:1fr\}/);
  assert.match(rendered,/quick-summary-item p\{margin:0;font-size:15px;line-height:1\.68;font-weight:600;color:#2d3b33\}/);
  assert.match(rendered,/QUICK GUIDE/);
  assert.match(rendered,/30초 안에 보는 핵심 기준/);
});

test('food guide headings render as summary cards instead of raw blockquotes',()=>{
 for(const title of ['망고 한눈에 보기','이 글의 핵심','먼저 기억할 네 가지','핵심만 먼저:']){
  const html='<p>시작</p><blockquote><strong>'+title+'</strong><br><strong>영양</strong> 100g 기준<br><strong>궁합</strong> 요거트<br><strong>보관</strong> 냉장</blockquote>';
  const rendered=renderDirectArticle(html);
  assert.equal((rendered.match(/class="quick-summary-item"/g)||[]).length,3,title);
  assert.doesNotMatch(rendered,/<blockquote>/,title);
  assert.match(rendered,/QUICK GUIDE/,title);
 }
});
test('malformed summary is rejected and narrative quotation is preserved',()=>{
 const broken='<blockquote><strong>망고 한눈에 보기</strong><br>영양 수치<br><strong>보관</strong> 냉장<br><strong>궁합</strong> 요거트</blockquote>';
 assert.throws(()=>renderDirectArticle(broken),/E_DIRECT_QUICK_SUMMARY_STRUCTURE/);
 const narrative='<blockquote><strong>핵심 먼저</strong> 향신료에 대한 서술형 요약입니다.</blockquote>';
 assert.match(renderDirectArticle(narrative),/<blockquote>/);
 const labelledNarrative='<blockquote><strong>이 글의 핵심</strong> 서술형 요약은 카드가 아닙니다.</blockquote>';
 assert.match(renderDirectArticle(labelledNarrative),/<blockquote>/);
});

test('direct public verification follows the varied renderer and rejects lost emphasis or styling',()=>{
  const html='<h2>소개</h2><p><mark><u><strong>핵심</strong></u></mark></p><table><tr><td>자료</td></tr></table>';
  const snapshot={...directPublicExpectations(html),stylesVisible:true};
  assert.doesNotThrow(()=>assertDirectPublicSnapshot(snapshot,html));
  for(const key of ['h2','numbers','tables','tableWraps','marks','boldMarks','underlinedMarks']){
    assert.throws(()=>assertDirectPublicSnapshot({...snapshot,[key]:0},html),/E_DIRECT_PUBLIC_/);
  }
  assert.throws(()=>assertDirectPublicSnapshot({...snapshot,stylesVisible:false},html),/E_DIRECT_PUBLIC_STYLE/);
});

test('publication discovery normalizes title whitespace and deduplicates numeric URLs', () => {
  assert.deepEqual(publishedUrls([
    {text:'은행\n 하루 몇 알',href:'https://nhunnhun.tistory.com/399?category=1'},
    {text:'은행 하루 몇 알',href:'https://nhunnhun.tistory.com/399#comments'},
    {text:'은행 하루 몇 알',href:'https://other.tistory.com/399'},
    {text:'다른 글',href:'https://nhunnhun.tistory.com/400'},
    {text:'은행 하루 몇 알',href:'https://nhunnhun.tistory.com/manage/post/399'}
  ], '은행 하루 몇 알'), ['https://nhunnhun.tistory.com/399']);
});
test('publication discovery keeps ambiguous and missing results unresolved', () => {
  const links=[399,400].map(id=>({text:'은행 하루 몇 알',href:`https://nhunnhun.tistory.com/${id}`}));
  assert.equal(publishedUrls(links,'은행 하루 몇 알').length,2);
  assert.deepEqual(publishedUrls(links,'없는 글'),[]);
  assert.deepEqual(publishedUrls(links,''),[]);
});