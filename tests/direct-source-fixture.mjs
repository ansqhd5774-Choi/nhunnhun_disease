export function directFixture(overrides={}){
 const category=overrides.category??'음식';
 const review=['A','B','C'].map((name,i)=>({src:`https://commons.wikimedia.org/wiki/Special:Redirect/file/Fruit_${name}.jpg?width=960`,alt:'과일의 형태와 색을 보여주는 사진',role:i?'context':'hero',composition:i?'context':'closeup',sourcePage:`https://commons.wikimedia.org/wiki/File:Fruit_${name}.jpg`,author:'Fixture Author',license:'CC BY-SA 4.0'}));
 const images=review.map(r=>`<p><img src="${r.src}" alt="${r.alt}"></p>`).join('');
 const nutrientHeadings=[
  '정의와 주요 성분 및 작용은 무엇인가?',
  '한 달 복용 후 기대되는 신체 변화는 무엇인가?',
  '일일 권장 섭취량과 효과적인 섭취법은 무엇인가?',
  '풍부한 식품 TOP7과 각 식품의 평균 함유량은 얼마인가?',
  '함께 섭취하면 좋은 영양소와 주의할 상호작용은 무엇인가?',
  '결핍 및 과다 복용의 위험, 예방 가능한 질병과 추천 제품은 무엇인가?'
 ];
 const headings=category==='영양소'?nutrientHeadings:['소개','핵심 정보','역할과 효과','연결과 활용','주의사항','실천과 관리'];
 const sections=headings.map((h,index)=>{
  const isNutrientChange=category==='영양소'&&index===1;
  const highlighted=isNutrientChange?'건강 지표 개선·기능 유지 도움':'주요 수치와 조건';
  const tone=isNutrientChange?' data-tone="positive"':'';
  let detail='';
  if(category==='영양소'&&index===1)detail='<p>성인이 500mg을 하루 1회 4주 섭취했을 때 불편감이 줄고 일상 기능이 개선됐습니다.</p>';
  if(category==='영양소'&&index===3)detail='<table><tbody><tr><td>1</td><td><mark data-tone="info"><u><strong>식품 A</strong></u></mark></td><td>120mg/100g</td></tr><tr><td>2</td><td><mark data-tone="info"><strong>식품 B</strong></mark></td><td>80mg/100g</td></tr><tr><td>3</td><td><mark data-tone="info"><strong>식품 C</strong></mark></td><td>40mg/100g</td></tr></tbody></table>';
  return `<h2>${h}</h2><ul><li><strong>핵심</strong><strong>기준</strong><mark${tone}><strong>${highlighted}</strong></mark></li></ul>${detail}`;
 }).join('');
 const extras=Array.from({length:8},(_,i)=>`<mark data-tone="info"><u><strong>중요한 실천 행동 ${i+1}</strong></u></mark>`).join('');
 const extraBold=Array.from({length:2},(_,i)=>`<strong>보조 핵심 ${i+1}</strong>`).join('');
 return {id:'direct-179-test',articleId:'179',targetUrl:'https://nhunnhun.tistory.com/179',expectedCurrentTitle:'감자',title:'감자',category:'음식',contentStandard:'SP1',status:'ready',approved:true,representativeImageUrl:review[0].src,imageReview:review,bodyHtml:images+sections+`<p>${extras}${extraBold}</p>`+'<h2>자료 출처</h2><ul>'+review.map(r=>`<li><a href="${r.sourcePage}">사진 출처</a></li>`).join('')+'</ul>',...overrides};
}