import {parseDocument} from 'htmlparser2';

const text=node=>node.type==='text'?node.data:(node.children??[]).map(text).join('');

const CONFIG={
  음식:{
    targetSection:4,
    reviewQuestions:[
      '무엇과 먹으면 좋은지 독자가 바로 알 수 있는가?',
      '왜 좋은지 성분의 실제 작용 또는 영양 보완 이유를 쉬운 말로 설명했는가?',
      '실제로 한 끼에서 어떻게 함께 먹을지 예를 들었는가?',
      '확인된 흡수·상호작용과 단순 풍미·식사 활용을 구분했는가?',
      '근거 없는 시너지나 질병 예방 효과를 만들지 않았는가?',
      '안전 주의가 궁합 설명을 대신하지 않았는가?'
    ]
  },
  영양소:{
    targetSection:5,
    reviewQuestions:[
      '영양소/기능성 성분 + 영양소/기능성 성분 조합이 독자에게 바로 보이는가?',
      '각 조합이 왜 좋은지 흡수·대사·영양 보완 또는 직접 사람 근거를 쉬운 말로 설명했는가?',
      '같이 먹는 방법과 아침·점심·저녁·식전·식후 등 필요한 복용 시점을 제시했는가?',
      '직접 확인된 복합 효과와 성분 수준의 기전을 구분했는가?',
      '중복 섭취·상한·고함량 복용·처방약 상호작용을 필요한 경우 확인했는가?',
      '음식 궁합이나 주의사항만 나열해 영양소 조합 설명을 대신하지 않았는가?'
    ]
  },
  약학:{
    targetSection:4,
    reviewQuestions:[
      '위험하거나 중요한 약물·음식 병용이 독자에게 바로 보이는가?',
      '허가사항·설명서·진료지침에 근거한 상호작용인지 확인했는가?',
      '함께 복용하면 생길 수 있는 문제와 필요한 행동을 쉬운 말로 설명했는가?',
      '복용 간격이 필요하면 실제 시간 기준을 제시했는가?',
      '임의 중단이나 용량 변경을 권하지 않았는가?',
      '중요한 금기와 단순 주의를 구분했는가?'
    ]
  },
  질병:{
    targetSection:4,
    reviewQuestions:[
      '예방·관리에 도움이 되는 음식이 독자에게 바로 보이는가?',
      '왜 도움이 되는지 영양·생활 관리 이유를 쉬운 말로 설명했는가?',
      '실제 식사에서 적용할 양·빈도·방법을 제시했는가?',
      '표준 치료를 음식으로 대체한다고 오해하게 쓰지 않았는가?',
      '직접 임상 근거와 일반적인 건강 식사 원칙을 구분했는가?',
      '질환에 따라 피해야 할 음식·상호작용이 있으면 함께 표시했는가?'
    ]
  }
};

// This is a deterministic review helper only. Accepting an externally authored
// category source here does not expand nhunnhun_disease's editorial authoring scope.
export function pairingReview(bodyHtml, category='음식') {
  const config=CONFIG[category];
  if(!config)throw new Error('E_PAIRING_REVIEW_CATEGORY');
  const {targetSection,reviewQuestions}=config;
  const nodes=parseDocument(bodyHtml).children;
  let section=0,heading='',content=[];
  for(const node of nodes){
    if(node.name==='h2'){
      section++;
      if(section>targetSection)break;
      if(section===targetSection)heading=text(node).trim();
    } else if(section===targetSection)content.push(node);
  }
  const combinations=[];
  const visit=node=>{
    if(node.name==='li')combinations.push(text(node).replace(/\s+/g,' ').trim());
    for(const child of node.children??[])visit(child);
  };
  content.forEach(visit);
  return {heading,combinations,targetSection,reviewQuestions,assessment:'AUTHOR_REVIEW_REQUIRED'};
}
