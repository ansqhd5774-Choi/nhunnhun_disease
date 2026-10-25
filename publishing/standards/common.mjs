export const CONTENT_STANDARD_VERSION = 'R1';
export const DOMAINS = ['food', 'nutrient', 'medicine', 'disease'];
export const SITE_CATEGORIES = Object.freeze({ food: ['음식'], nutrient: ['영양소'], medicine: ['약학', '약', '약약'], disease: ['질병'] });
// These are question modules, NOT a mandatory 46-heading template.
export const MODULES = Object.freeze({
  identity: '정체·종류·이름의 의미', role: '몸에서 하는 역할을 쉽게 설명', nutrition: '식품 영양성분·가식부·1회분 기준',
  benefits: '기대할 수 있는 도움과 건강상 의미', audience: '고려할 사람·불필요한 사람', expectations: '효과 크기·근거·현실적인 기대',
  amount: '섭취량·용량·단위·대상·상한의 구분', use: '먹거나 사용하는 방법·시점·경로',
  preparation: '조리·실제 식사 활용', storage: '보관·변질·폐기 기준', selection: '주제에 맞는 선택 기준',
  safety: '흔한 문제와 중요한 위해', decision: '독자가 지금 할 수 있는 선택·다음 행동',
  indications: '허가된 효능·적응증과 한계', contraindications: '금기·주의 대상', interactions: '약·음식·영양제의 상호작용·중복',
  symptoms: '주요 증상·발현 양상', causes: '원인', risk: '위험요인', self_check: '자가 점검의 범위·확진과의 차이',
  diagnosis: '검사·감별·진단 과정', treatment: '표준치료와 선택지', home_care: '집에서 할 수 있는 안전한 관리',
  red_flags: '응급 위험신호와 즉시 할 행동', medical_help: '진료 시점·진료과·약사 상담',
  timeline: '효과 시작·관찰기간·개인차', long_term: '꾸준한 사용·자료기간·장기 안전성·재평가',
  stopping: '중단 후 변화·의료진과 조정할 경우', comparison: '같은 목적·기준으로 비교', alternatives: '대체 가능한 것과 불가능한 것',
  combinations: '추가하면 도움이 되는 조합과 단순 병용 가능의 구분', product_variants: '성분·제형·실함량·마케팅 차이',
  food_sources: '식품 공급원·보충제 대체 범위', deficiency: '결핍 위험·확인 방법',
  cultivars: '품종별 맛·식감·용도', origins: '산지·재배환경·품종·생산연도의 구분', seasonality: '품종·산지별 제철',
  cost: '동일 기준 1일·1회 비용 및 가격 확인일', folk_remedies: '민간요법의 도움·한계·위험·표준치료와 관계',
  exercise: '운동·회복과의 관계', diet: '함께 먹을 음식·식단·피할 식품', vulnerable_groups: '어린이·고령자·임신·수유·질환별 차이',
  missed_dose: '복용을 잊거나 더 먹었을 때의 공식 안내', myths: '실제 검색되는 오해를 짧게 풀이', latest: '새 정보로 달라진 판단과 확인일',
  follow_up: '효과·이상반응 관찰·재검·진료 전환'
});
export const EXTENSIONS = Object.freeze({
  longTerm: ['timeline', 'long_term', 'follow_up'], comparison: ['comparison', 'alternatives'],
  combinations: ['combinations', 'interactions'], products: ['product_variants', 'selection'],
  foodReplacement: ['food_sources', 'alternatives'], essentialNutrient: ['deficiency', 'food_sources'],
  cultivars: ['cultivars'], origins: ['origins'], seasonality: ['seasonality'],
  cost: ['cost'], folkRemedies: ['folk_remedies'], selfCheck: ['self_check', 'medical_help'],
  exercise: ['exercise'], diet: ['diet'], vulnerableGroups: ['vulnerable_groups'],
  discontinuation: ['stopping'], missedDose: ['missed_dose'], myths: ['myths'], latest: ['latest']
});
export const REVIEW_CHECKS = ['readerIntent', 'accuracy', 'expectations', 'comparison', 'combinations', 'crossDomain', 'safety', 'tone', 'emphasis', 'images', 'linksAndSearch'];
export const SOURCE_KINDS = ['official', 'guideline', 'systematic-review', 'trial', 'nutrition-database', 'manufacturer', 'local-authority', 'article'];
export const SOURCE_ROLES = ['health', 'safety', 'nutrition', 'product', 'origin', 'context', 'authorization'];
export const SECTION_STATUS = ['included', 'not-applicable'];
export const ENTITY_DOMAINS = Object.freeze({
  'food:watermelon': 'food', 'food:pear': 'food', 'food:apple': 'food',
  'nutrient:vitamin-c': 'nutrient', 'nutrient:magnesium': 'nutrient', 'nutrient:pycnogenol': 'nutrient',
  'medicine:acetaminophen': 'medicine', 'medicine:cold-remedy': 'medicine',
  'disease:common-cold': 'disease', 'disease:hypertension': 'disease', 'disease:diabetes': 'disease'
});
export const normTopic = value => String(value ?? '').normalize('NFC').replace(/[\s®™]/gu, '').toLowerCase();
export const UNAMBIGUOUS_TOPICS = Object.freeze({ '수박':'food', '먹는배':'food', '과일배':'food', '비타민c':'nutrient', '타이레놀':'medicine', '아세트아미노펜':'medicine', '고혈압':'disease', '당뇨병':'disease' });
// Broad-guide identities and suggested questions. Profiles never prove applicability or evidence.
export const TOPIC_ENTITIES = Object.freeze({ '사과':'food:apple', '배':'food:pear', '먹는배':'food:pear', '과일배':'food:pear', '수박':'food:watermelon', '비타민c':'nutrient:vitamin-c', '피크노제놀':'nutrient:pycnogenol', '감기약':'medicine:cold-remedy', '감기':'disease:common-cold' });
export const TOPIC_EXTENSIONS = Object.freeze({
  'food:apple': ['cultivars','origins','seasonality','comparison','diet'],
  'food:pear': ['cultivars','origins','seasonality','comparison','diet'],
  'food:watermelon': ['cultivars','seasonality','comparison','diet'],
  'nutrient:vitamin-c': ['longTerm','comparison','combinations','products','foodReplacement','essentialNutrient','vulnerableGroups'],
  'nutrient:pycnogenol': ['longTerm','comparison','combinations','products','vulnerableGroups'],
  'medicine:cold-remedy': ['comparison','combinations','diet','folkRemedies','vulnerableGroups'],
  'disease:common-cold': ['selfCheck','diet','folkRemedies','vulnerableGroups']
});
