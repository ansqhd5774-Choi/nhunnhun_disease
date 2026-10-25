import {parseDocument} from 'htmlparser2';

// Distinct body systems, not distinct biomarkers: LDL, total cholesterol and
// triglycerides all remain a single lipid axis.
const DOMAINS=Object.freeze({
  lipids:/LDL|HDL|중성\s*지방|콜레스테롤|혈중\s*지질|지질\s*수치/iu,
  vascular:/혈압|혈관|혈류|혈액\s*순환|동맥|혈관\s*기능/iu,
  glycemic:/혈당|인슐린|당화\s*혈색소|혈당\s*반응/iu,
  weight:/체중|체지방|내장\s*지방|복부\s*지방|포만감|식욕/iu,
  cognition:/인지|기억력|학습|집중력|뇌\s*기능|신경\s*기능/iu,
  gut:/장내|장\s*건강|장\s*미생물|유익균|배변|마이크로바이옴/iu,
  muscle:/근육|근력|근합성|근육\s*회복/iu,
  bone:/뼈|골밀도|골격|골다공/iu,
  immune:/면역|염증|산화\s*스트레스|항산화/iu,
  skin:/피부|피부\s*장벽|피부\s*건강/iu,
  energy:/피로|에너지\s*대사|지구력/iu
});
const NODE_TEXT=node=>node?.type==='text'?(node.data??''):(node?.children??[]).map(NODE_TEXT).join('');
const CLEAN=s=>String(s??'').replace(/\s+/gu,' ').trim();
const HEADING=s=>CLEAN(s).replace(/^\d+[.)]\s*/u,'');
const CORE=['소개','영양소·핵심 성분','꾸준 섭취 변화','궁합·시너지','주의사항','고르는 법·보관법'];
function allMarks(node,marks=[]){
  if(node?.name==='mark'){
    const value=CLEAN(NODE_TEXT(node));
    if(value)marks.push(value);
  }
  for(const child of node?.children??[])allMarks(child,marks);
  return marks;
}
function foodChangeMarks(html){
  const nodes=parseDocument(html??'').children??[];
  const headings=nodes.filter(n=>n.name==='h2').map(n=>HEADING(NODE_TEXT(n)));
  if(!CORE.every((name,index)=>headings[index]===name))return null;
  let section=-1;
  const marks=[];
  for(const node of nodes){
    if(node.name==='h2'){section++;continue;}
    if(section===2)allMarks(node,marks);
    if(section>2)break;
  }
  return marks;
}
export function observeFoodBenefitBreadth(source){
  if(source?.category!=='음식'||source?.contentStandard!=='SP1'||!source?.id?.startsWith('direct-'))
    return {status:'NOT_APPLICABLE'};
  const marks=foodChangeMarks(source.bodyHtml);
  if(!marks)return {status:'NOT_APPLICABLE',reason:'no-normalized-six-axes'};
  const covered=Object.keys(DOMAINS).filter(name=>marks.some(mark=>DOMAINS[name].test(mark)));
  return {status:covered.length>=3?'DIVERSE':'REVIEW_REQUIRED',coveredDomains:covered,changeMarkCount:marks.length};
}
function validNarrowScopeReview(review,covered){
  if(!review||review.status!=='EVIDENCE_SCREENED'||!Array.isArray(review.domains))return false;
  if(CLEAN(review.scopeReason).length<30)return false;
  const seen=new Set();
  for(const entry of review.domains){
    if(!entry||!Object.hasOwn(DOMAINS,entry.domain)||seen.has(entry.domain))return false;
    seen.add(entry.domain);
    if(!['included','insufficient','not_applicable'].includes(entry.verdict))return false;
    let sourceUrl;
    try{sourceUrl=new URL(entry.sourceUrl);}catch{return false;}
    if(sourceUrl.protocol!=='https:'||!sourceUrl.hostname.includes('.')||/\.(?:invalid|test|example)$/iu.test(sourceUrl.hostname)||/^example\.(?:com|org|net)$/iu.test(sourceUrl.hostname)||sourceUrl.username||sourceUrl.password)return false;
    if(CLEAN(entry.reason).length<18)return false;
    // An included domain needs to be visible in the same section's highlight layer.
    if(entry.verdict==='included'&&!covered.includes(entry.domain))return false;
  }
  return seen.size>=4&&covered.every(domain=>review.domains.some(row=>row.domain===domain&&row.verdict==='included'))
    &&review.domains.filter(row=>row.verdict!=='included').length>=2;
}
export function assertFoodBenefitBreadth(source){
  const observation=observeFoodBenefitBreadth(source);
  if(observation.status==='NOT_APPLICABLE')return observation;
  if(observation.status==='DIVERSE')return observation;
  if(!validNarrowScopeReview(source.foodBenefitScopeReview,observation.coveredDomains))
    throw Error('E_DIRECT_FOOD_BENEFIT_BREADTH');
  return {...observation,status:'NARROW_SCOPE_DOCUMENTED',automatedSemanticVerdict:false};
}
