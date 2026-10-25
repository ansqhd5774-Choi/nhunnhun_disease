import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkUpdateSource} from '../publishing/update-core.mjs';
import {renderDirectArticle} from '../publishing/direct-design.mjs';
import {directFocusReview} from '../publishing/direct-focus.mjs';
import {imageReviewObservation} from '../publishing/image-review.mjs';
import {observeEmphasis} from './emphasis-summary.mjs';
import {pairingReview} from './pairing-review.mjs';
import {buildFoodAxisReview} from './food-axis-review.mjs';
import {observeFoodBenefitBreadth} from '../publishing/food-benefit-breadth.mjs';
import {checkPost,checkPublishHtml} from '../publishing/core.mjs';
import {directPreflight} from '../publishing/direct-preflight.mjs';

const GENERIC_EDITORIAL_QUESTIONS=[
  '이 키워드를 검색한 독자가 가장 먼저 알고 싶은 핵심 질문을 6개 이내로 정리했는가?',
  '각 핵심 소제목이 독자의 질문 하나에 직접 답하며 세부 설명 때문에 별도 대주제를 불필요하게 만들지 않았는가?',
  '분야에 맞는 건강·영양 중심 제목인가? 제목이 약속한 중심 질문에 직접 답하는가?',
  '신뢰 가능한 자료로 주장과 수치를 확인하고, 대상·제형·용량이 다른 내용을 그대로 일반화하지 않았는가?',
  '수치 설명은 모으고 FAQ·요약을 제외한 불필요한 반복을 줄였는가?'
];
function foodEditorialReview(foodAxisReview){
  return {status:'AUTHOR_REVIEW_REQUIRED',automatedSemanticVerdict:false,ruleSource:'docs/project-instructions/PROJECT_INSTRUCTIONS_FOOD_R8.1.txt',qualityRuleSource:'docs/content/FOOD_CONTENT_QUALITY_R1.md',scope:'FOOD_ONLY',questions:[
    '음식 원고는 이 저장소의 음식 전용 지침만 편집 기준으로 사용하고, 사용자 확정 6개 소제목(소개, 영양소·핵심 성분, 꾸준 섭취 변화, 궁합·시너지, 주의사항, 고르는 법·보관법)을 이름·순서·의미 그대로 사용했는가?',
    '일반 독자가 실제로 궁금해하는 질문과 생활정보 범위를 먼저 확인하고, 글이 음식의 특징·영양·장점·활용·선택·섭취·보관을 중심으로 구성됐는가?',
    '근거 없는 확정 치료 효과만 제외하고 음식 고유 성분의 함량·연구된 작용·사람 섭취 근거를 각각 구분해 설명했는가?',
    ...foodAxisReview.axes.map(axis=>`${axis.expectedAxis}: ${axis.readerQuestion} ${axis.reviewQuestion}`),
    ...foodAxisReview.balanceReview.questions,
    '음식 이미지·내부링크·강조가 일반 독자의 이해와 실제 선택·섭취·보관에 직접 도움이 되는가?'
  ]};
}
export function prepareDirectSource(source) {
  if(source.articleId)checkUpdateSource(source,source.id+'.json');
  else {checkPost(source,source.id+'.json');checkPublishHtml(source);}
  const observation=observeEmphasis(source.bodyHtml,{category:source.category});
  const focusReview=directFocusReview(source.bodyHtml);
  const foodAxisReview=source.category==='음식'?buildFoodAxisReview(source):null;
  const imageEditorialReview=imageReviewObservation(source);
  const editorialReview=foodAxisReview?foodEditorialReview(foodAxisReview):{status:'AUTHOR_REVIEW_REQUIRED',automatedSemanticVerdict:false,questions:[...GENERIC_EDITORIAL_QUESTIONS]};
  return {report:{sourceId:source.id,preflight:directPreflight(source),...observation,focusReview,pairingReview:pairingReview(source.bodyHtml,source.category),imageEditorialReview,...(foodAxisReview?{foodAxisReview,foodBenefitBreadth:observeFoodBenefitBreadth(source)}:{}),editorialReview},preview:'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>원고 디자인 확인</title></head><body>'+renderDirectArticle(source.bodyHtml)+'</body></html>'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const source=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const prepared=prepareDirectSource(source);
  const output=resolve('evidence','direct-preparation',source.id);
  mkdirSync(output,{recursive:true});
  writeFileSync(join(output,'preview.html'),prepared.preview);
  writeFileSync(join(output,'emphasis.json'),JSON.stringify(prepared.report,null,2)+'\n');
  console.log(JSON.stringify({preview:join(output,'preview.html'),...prepared.report},null,2));
}
