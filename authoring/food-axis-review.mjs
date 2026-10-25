const FOOD_RULE_SOURCE='docs/project-instructions/PROJECT_INSTRUCTIONS_FOOD_R8.1.txt';
const FOOD_QUALITY_RULE_SOURCE='docs/content/FOOD_CONTENT_QUALITY_R1.md';
const FOOD_AXES = [
  {expectedAxis:'소개',readerQuestion:'이 음식은 무엇이고, 어떤 맛·식감·종류·제철·산지 특징이 있는가?',reviewQuestion:'처음 보는 일반 독자가 이 음식의 정체와 특징을 바로 이해할 수 있는가? 소개에 제철 정보가 실제 문장으로 포함됐는가? 제철 작성 전 다른 국내 음식 블로그 최소 2개를 직접 확인했고, 상충 시 어종·품종·산지·유통 형태 차이를 교차확인했는가?'},
  {expectedAxis:'영양소·핵심 성분',readerQuestion:'이 음식에서 중요한 영양소와 핵심 성분은 무엇이고 몸에서 어떤 역할을 하는가?',reviewQuestion:'기본 영양표 외에 음식 고유 성분(예: 케이퍼의 루틴·퀘르세틴·캠페롤)을 실제 함량과 각각의 연구된 작용으로 설명했는가? 세포·동물 연구와 실제 섭취 효과를 구분했고 단순 성분명 나열로 끝내지 않았는가?'},
  {expectedAxis:'꾸준 섭취 변화',readerQuestion:'이 음식을 꾸준히 먹으면 몸에서 어떤 긍정적인 변화가 기대되는가?',reviewQuestion:'체중 관리·근육·심혈관·뇌·에너지 대사·장·뼈·면역·피부 등 음식 특성에 맞는 실제 신체 변화를 중심으로 설명했는가? 조리·보관 편의나 식사 지속성이 핵심을 대신하지 않았는가? 작성 과정 설명보다 독자가 체감할 변화와 실제 의미에 집중했는가?'},
  {expectedAxis:'궁합·시너지',readerQuestion:'무엇과 함께 먹으면 좋고, 왜 좋은지, 실제로 어떻게 먹으면 되는가?',reviewQuestion:'추상적인 영양 균형 설명보다 구체적인 음식 이름을 먼저 제시했는가? 각 조합이 음식명 → 왜 좋은지 → 맛·향·식감에서 어떤 장점이 있는지 → 실제로 어떻게 함께 먹는지 순서로 바로 이해되는가? 영양 궁합뿐 아니라 맛·향·식감 궁합도 함께 다뤘는가?'},
  {expectedAxis:'주의사항',readerQuestion:'누가 어떤 상황에서 주의해야 하고, 실제로 무엇을 조심하면 되는가?',reviewQuestion:'알레르기·독성·과다섭취·중요한 상호작용처럼 행동을 바꿔야 하는 주의만 남겼는가? 일반적인 부정·제한 문장으로 분량을 채우지 않았는가?'},
  {expectedAxis:'고르는 법·보관법',readerQuestion:'좋은 제품을 어떻게 고르고, 집에서는 어떻게 보관하면 되는가?',reviewQuestion:'신선도·구매 기준·제품 형태·보관 위치와 방법을 구체적으로 답했는가? 독자가 바로 적용할 수 있는 행동 정보가 있는가? 브랜드 완제품 비교가 실질적으로 필요한 음식이라면 판매량이 아니라 성분·가격·첨가물·편의성·정보 투명성을 비교한 추천 TOP3가 있는가?'}
];
const BALANCE_REVIEW_QUESTIONS=[
  '기존 음식 글 전체 재작성이라면 기존 본문을 초안·문장 재료로 쓰지 않고, 빈 문서에서 정확한 검색어 벤치마크와 새 조사로 처음부터 작성했는가? 부분 수정은 사용자가 범위를 명시한 경우에만 했는가?',
  '도입과 본문 첫인상이 음식의 특징·영양·장점·활용을 먼저 보여주는가?',
  '사용자 확정 6개 소제목의 이름·순서·의미를 임의 변경하지 않았는가?',
  '소개에 제철 정보가 실제 문장으로 들어갔는가?',
  '제철 정보를 작성하기 전에 다른 국내 음식 블로그 최소 2개를 직접 확인했는가?',
  '블로그 간 제철 설명이 다를 경우 어종·품종·산지·자연산/양식·생물/냉동·가공 형태 차이를 추가 조사해 교차확인했는가?',
  '③ 꾸준 섭취 변화가 조리·보관 편의가 아니라 실제 긍정적 신체 변화를 중심으로 작성됐는가?',
  '③ 본문이 사실 확인 과정 설명보다 독자가 기대할 변화와 실제 의미에 집중하는가?',
  '④ 궁합·시너지는 독자의 질문에 구체적인 음식 이름부터 답하고 있는가? 추상적인 영양 균형 설명이 답보다 먼저 나오지 않는가?',
  '④의 각 조합은 음식명 → 왜 좋은지 → 맛·향·식감 장점 → 실제 먹는 법 순서로 생활에서 바로 쓸 수 있게 설명됐는가?',
  '④에서 영양 궁합만 다루지 않고 실제 맛·향·식감 궁합도 함께 다뤘는가?',
  '본문 전반에서 원리 설명보다 구체적인 답을 먼저 제시하고, 그 뒤 이유와 실제 활용을 설명하는 순서를 지켰는가?',
  '신규 음식 글은 처음부터 승인된 카드·목록·표 디자인 구조를 사용했는가? ③~⑥의 여러 항목을 단순 평문 문단으로 풀어 카드 디자인을 잃지 않았는가?',
  '기존 음식 글 수정은 승인된 HTML 디자인을 보존했는가? 내용 수정이나 형광펜 추가를 이유로 카드·박스·목록·표 구조를 삭제하지 않았는가?',
  '③~⑥이 렌더러에서 effects / pairs / cautions / storage 구조로 표현될 수 있는 반복 항목 구조를 갖췄는가?',
  '형광펜은 경고 표시가 아니라 빠른 읽기를 위한 스캔 앵커인가? 형광펜을 위에서 아래로 훑었을 때 음식의 정체·핵심 영양·꾸준 섭취 변화·궁합·필수 주의·선택/보관의 핵심 흐름이 잡히는가?',
  '6개 핵심 소제목의 핵심 정보가 형광펜 요약 레이어에 빠짐없이 반영됐는가? 단, 제철·산지·정의·배경처럼 핵심성이 낮은 세부를 단지 소제목을 채우기 위해 억지로 강조하지 않았는가?',
  '③·④처럼 핵심 정보가 여러 갈래인 소제목을 형광펜 한 문장으로 뭉개지 않고 중요한 변화·조합을 필요한 만큼 나눠 강조했는가?',
  '형광펜이 문장 전체도, 의미가 끊기는 단일 명사도 아닌 자연스러운 최소 의미 구절인가? 카드에서는 카드 제목과 형광펜을 함께 읽었을 때 `면역력 증진 → 면역 기능 관리에 도움`, `대추 → 쓴맛 완화`처럼 즉시 의미가 연결되는가?',
  '같은 음식명을 모든 형광펜 앞에 반복하거나 `홍삼 · 효과`, `참치 · 효과`처럼 원래 문장에 없던 전보식 표현을 양산하지 않았는가?',
  '형광펜이 경고·주의 문장에 편중되지 않고 장점·효능·신체 변화·실제 섭취/선택 행동을 우선적으로 보여주는가?',
  '제철·산지·정의·명칭·분류·배경 설명을 단지 필수 포함 정보라는 이유만으로 형광펜이나 밑줄 처리하지 않았는가?',
  '각 형광펜·밑줄을 놓쳤을 때 독자의 건강 이해·선택·섭취·보관 행동이 실제로 달라지는가? 아니라면 일반 문장 또는 굵게로 낮췄는가?',
  '부정·제한·반박 문장이 글 전체를 압도하지 않고, 꼭 필요한 주의는 ⑤ 주의사항에 집중했는가?',
  '근거 없는 확정 치료 효과만 걸러내고 음식 고유 성분의 측정값·기초 연구 작용·사람 연구를 해당 연구 단계에 맞게 구분해 살려 썼는가?',
  '같은 사실을 도입·표·본문·요약에서 표현이나 숫자만 바꿔 반복하지 않았는가?',
  '100mL→200mL처럼 단순 배수·단위 환산·산술 확장으로 표의 행이나 열을 채우지 않았는가?',
  '표의 각 행·열이 독자에게 새로운 선택·섭취·보관 판단 정보를 주는가?',
  '일반 영양표가 음식 고유 특징·제품/형태 차이·실제 선택 정보를 밀어내지 않았는가?',
  '브랜드 완제품 추천이 실질적으로 필요한 음식이라면 ⑥에 추천 제품 TOP3를 넣었는가? 반대로 생과일·생선·채소처럼 브랜드 비교가 의미 없는 음식에 억지 TOP3를 만들지 않았는가?',
  '추천 제품 TOP3가 판매량·리뷰 수·브랜드 인지도 순위가 아니라 핵심성분/기능성 함량·1일 비용·당류/첨가물·섭취 편의성·제품 정보 투명성을 비교한 결과인가?',
  '추천 제품의 현재 공식/신고 정보와 가격을 확인했고 확인 날짜와 가격 변동 가능성을 밝혔는가? 공식정보와 유통정보가 충돌하면 숨기지 않고 감점·제외 또는 차이 설명을 했는가?',
  '내용이 얕은 부분을 문장·표·강조로 늘리지 않고 벤치마크와 추가 조사로 보강했는가?',
  '구매·섭취·궁합·주의·보관 중 독자가 실제 행동으로 옮길 수 있는 정보가 충분한가?'
];
const UTILITY_HEADING_RE=/^(?:자주\s*묻는\s*질문|FAQ|핵심\s*정리|함께\s*보면\s*좋은\s*글|자료\s*출처)$/iu;
function decodeHtml(text){return String(text??'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;/gi,"'");}
function textOnly(html){return decodeHtml(String(html??'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function normalizedHeading(value){return String(value??'').replace(/^\d+[.)]\s*/u,'').trim();}
function firstAnswer(segment){const blocks=String(segment??'').matchAll(/<(p|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>/gi);for(const match of blocks){const answer=textOnly(match[2]);if(answer)return answer;}return '';}
function markedTexts(segment){return [...String(segment??'').matchAll(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi)].map(match=>textOnly(match[1])).filter(Boolean);}
function designItemCount(segment){
  const h3=[...String(segment??'').matchAll(/<h3\b[^>]*>[\s\S]*?<\/h3>/gi)].length;
  const li=[...String(segment??'').matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)].length;
  return Math.max(h3,li);
}
export function buildFoodAxisReview(source={}){
  const html=String(source.bodyHtml??'');
  const allHeadings=[...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((match,order)=>({order,index:match.index??0,end:(match.index??0)+match[0].length,heading:textOnly(match[1])})).filter(item=>item.heading);
  const coreHeadings=allHeadings.filter(item=>!UTILITY_HEADING_RE.test(normalizedHeading(item.heading)));
  const reviewHeadings=coreHeadings.slice(0,6);
  const axes=FOOD_AXES.map((definition,index)=>{const item=reviewHeadings[index];const next=item?allHeadings.find(heading=>heading.order>item.order):null;const segment=item?html.slice(item.end,next?.index??html.length):'';return {axis:index+1,...definition,heading:item?.heading??'',firstAnswer:firstAnswer(segment),highlightSummary:markedTexts(segment),designItemCount:designItemCount(segment)};});
  const highlightSummarySections=axes.map(axis=>({axis:axis.axis,heading:axis.heading,highlights:axis.highlightSummary}));
  const missingHighlightAxes=highlightSummarySections.filter(item=>item.highlights.length===0).map(item=>item.axis);
  const designStructureSections=axes.filter(axis=>axis.axis>=3&&axis.axis<=6).map(axis=>({axis:axis.axis,heading:axis.heading,itemCount:axis.designItemCount,expectedRendererClass:({3:'effects',4:'pairs',5:'cautions',6:'storage'})[axis.axis]}));
  const weakDesignAxes=designStructureSections.filter(item=>item.itemCount<2).map(item=>item.axis);
  return {assessment:'AUTHOR_REVIEW_REQUIRED',automatedSemanticVerdict:false,scope:'FOOD_ONLY',ruleSource:FOOD_RULE_SOURCE,qualityRuleSource:FOOD_QUALITY_RULE_SOURCE,observedCoreH2Count:coreHeadings.length,axes,designStructureReview:{status:'AUTHOR_REVIEW_REQUIRED',purpose:'신규 글은 승인된 카드 디자인으로 작성하고 기존 글 수정은 승인 HTML 구조를 보존했는지 검토',sections:designStructureSections,weakDesignAxes,warning:'③~⑥에 실제 여러 항목이 있다면 h3+p 또는 ul/li 같은 반복 구조를 사용해 effects/pairs/cautions/storage 디자인을 유지한다. 형광펜으로 디자인을 대체하지 않는다.'},highlightSummaryReview:{status:'AUTHOR_REVIEW_REQUIRED',purpose:'형광펜을 훑을 때 6개 핵심 축의 정보를 빠르게 파악할 수 있는 스캔 앵커인지 검토',sections:highlightSummarySections,missingHighlightAxes,warning:'형광펜은 원문 안의 자연스러운 최소 의미 구절로 잡는다. 카드 제목이 이미 문맥을 제공하면 음식명·항목명을 형광펜에 반복하지 않고, 문장 전체나 의미가 끊기는 단일 명사는 피한다.'},balanceReview:{status:'AUTHOR_REVIEW_REQUIRED',automatedSemanticVerdict:false,scope:'FOOD_ONLY',ruleSource:FOOD_RULE_SOURCE,qualityRuleSource:FOOD_QUALITY_RULE_SOURCE,questions:[...BALANCE_REVIEW_QUESTIONS]}};
}
