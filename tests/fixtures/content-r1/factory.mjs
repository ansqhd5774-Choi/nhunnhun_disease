// Synthetic contract fixtures only. Not publishable medical content or real evidence reviews.
import { DOMAIN_RULES, contentDigest } from '../../../publishing/content-standards.mjs';
import { DOMAINS, EXTENSIONS, MODULES, REVIEW_CHECKS, TOPIC_EXTENSIONS } from '../../../publishing/standards/common.mjs';
export function fixture(domain='food', {entityId=`${domain}:test-item`, topic=`검증용 ${domain}`, enabled=[]}={}) {
  const extensions = Object.fromEntries(Object.keys(EXTENSIONS).map(k => [k,{applies:[...enabled,...(TOPIC_EXTENSIONS[entityId]??[])].includes(k),reason:'주제와 독자 질문의 관련성을 확인한 합성 테스트 전용 판단입니다.'}]));
  const modules = [...new Set([...DOMAIN_RULES[domain].core, ...Object.entries(extensions).filter(([,e])=>e.applies).flatMap(([k])=>EXTENSIONS[k])])];
  const urls = ['https://ods.od.nih.gov/factsheets/WYNTK-Consumer/','https://www.ahrq.gov/health-literacy/improve/precautions/tool4.html'];
  if(domain==='medicine') urls[0]='https://nedrug.mfds.go.kr/';
  const rows=modules.map((module,i)=>({module,heading:`${i+1}. ${MODULES[module]}`,answerQuote:`${MODULES[module]} 부분은 자동 검사 구조를 확인하는 합성 테스트 문장입니다.`,sourceIds:['ref-a']}));
  const img=i=>`<p><img src="https://example.org/fixture-${i}.jpg" alt="검증용 이미지 ${i} 장면"></p>`;
  const source={id:`test-${domain}`,title:`비발행 합성 테스트 ${domain}`,category:{food:'음식',nutrient:'영양소',medicine:'약학',disease:'질병'}[domain],tags:['테스트'],status:'ready',approved:true,contentStandard:'R1',representativeImageUrl:'https://example.org/fixture-1.jpg',bodyHtml:
    img(1)+'<p>이 문서는 프로그램 검사만 위한 합성 자료이며 건강정보나 제품 추천에 사용하지 않습니다.</p><blockquote><strong>핵심만 먼저:</strong> 원문과 검토기록이 일치하는지 확인합니다.</blockquote>'+
    rows.map((row,i)=>`<h2>${row.heading}</h2>${row.module==='red_flags'?'<blockquote data-kind="danger">':row.module==='contraindications'?'<blockquote data-kind="caution">':''}<p>${row.answerQuote} 실제 진료나 구매에는 사용하지 않습니다.</p>${['red_flags','contraindications'].includes(row.module)?'</blockquote>':''}<p><a href="${urls[0]}">검증용 출처 연결</a></p>${i===0?img(2):i===1?img(3):''}`).join('')+
    '<h2>핵심 정리</h2><ul><li>테스트 자료이므로 실제 건강관리에 적용하지 않습니다.</li></ul><h2>자료 출처</h2><ul>'+urls.map((u,i)=>`<li><a href="${u}">검증 연결 ${i+1}</a></li>`).join('')+'</ul>'};
  const at=module=>rows.find(r=>r.module===module);
  const manifest={version:'R1',domain,classification:{rawInput:`${topic} 글을 적어줘`,topic,meaning:entityId==='food:pear'?'과일 배':`테스트용 ${domain} 주제`,entityId,status:'resolved',reason:'사용자 표현의 문맥을 확인한 합성 테스트용 분류입니다.'},sourceDigest:contentDigest(source),intent:{primaryQuestion:'독자의 질문과 답변이 본문에 연결되어 있는가?',readerSituation:'프로그램 계약을 시험하기 위해 작성한 합성 독자 상황입니다.',nextActions:['검사 결과를 확인하되 건강정보로 사용하지 않습니다.']},extensions,coverage:rows,connections:Object.fromEntries(DOMAINS.filter(d=>d!==domain).map(d=>[d,{status:'not-applicable',reason:'이 테스트 사례에는 관련 독자 질문이 없다는 가정으로 처리했습니다.'}])),sources:urls.map((url,i)=>({id:`ref-${i?'b':'a'}`,url,title:'합성 테스트의 출처 연결 항목',kind:'official',role:domain==='medicine'&&i===0?'authorization':'health',checkedAt:'2026-10-07',scopeNote:'이 기록은 검증용이며 실제로 이 문장의 건강효과를 입증하지 않습니다.'})),glossary:[],comparisons:[],combinations:[],selectionCriteria:[],review:{status:'approved',checkedAt:'2026-10-07',reviewer:{name:'synthetic-test-fixture',kind:'ai',independence:'same-author'},checks:Object.fromEntries(REVIEW_CHECKS.map(k=>[k,{status:'pass',note:'합성 테스트가 이 검토기록의 형식을 충족하는지 확인했습니다.'}])),warningResolutions:[]}};
  if(extensions.comparison.applies) manifest.comparisons.push({...at('comparison'),left:'선택지 A',right:'선택지 B',goal:'동일한 사용 목적에서 비교합니다.',basis:'같은 대상과 분량을 기준으로 정리합니다.',directness:'qualitative',limitations:'직접 비교 자료가 있다는 뜻이 아닌 합성 테스트입니다.'});
  if(extensions.combinations.applies) manifest.combinations.push({...at('combinations'),items:['선택지 A','선택지 B'],relationship:'compatible-only',purpose:'같이 사용할 수 있음과 추가 효과가 다름을 구분합니다.'});
  if(extensions.products.applies) manifest.selectionCriteria.push({...at('selection'),criterion:'표시된 실제 성분 함량',whyItMatters:'용기 전체 양과 일회분을 혼동하지 않기 위해서입니다.',howToCheck:'제품 표시의 일회분 기준과 성분량을 함께 확인합니다.'});
  return {source,manifest};
}
export function refresh(pair) {pair.manifest.sourceDigest=contentDigest(pair.source);return pair;}
