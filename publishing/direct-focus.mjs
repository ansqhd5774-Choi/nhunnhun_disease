import {parseDocument} from 'htmlparser2';
import {DIRECT_AUTHORING_CONTRACT} from './direct-authoring-contract.mjs';

const UTILITY_HEADING=/^(?:자주 묻는 질문|FAQ|핵심 정리|함께 보면 좋은 글|자료 출처)$/iu;
const NUTRIENT_CHANGE_HEADING=/(?:효능|기대(?:되는)?(?:\s*신체)?\s*변화|어떤\s*변화|누가\s*(?:먹|섭취|복용)|먹으면\s*좋)/u;
const TARGET_GROUP_PATTERN=/(?:사람|성인|환자|참가자|대상자|남성|여성|어린이|청소년|노인|고령자|임신부|임산부|수유부)/u;
const CHANGE_PATTERN=/(?:개선|증가|감소|낮아|높아|줄(?:었|어|어들|어드는|이는)|완화|향상|회복|유지|변화|호전)/u;
const TIME_PERIOD_PATTERN=/(?:(?:^|[^0-9])\d{1,3}(?:\.\d+)?\s*(?:일|주|개월|달|년)(?:간|동안|후)?(?:[^0-9]|$))|(?:한\s*달(?:간|동안|후)?)/u;
const AMOUNT_PATTERN=/(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?:μg|mcg|mg|g|IU|국제단위|mL|ml|정|캡슐)(?:\/일|\s*\/\s*일|\s*하루)?/iu;
const NUTRIENT_FOOD_RANKING_HEADING=/(?=.*(?:식품|음식))(?=.*(?:TOP\s*(?:7|5|3)|상위\s*(?:7|5|3)))/iu;
const ESTIMATED_RANKING_VALUE_PATTERN=/(?:\d[\d.,~～\-–—]*\s*(?:μg|mcg|mg|g)(?:\s*\/\s*(?:100\s*g|회|1회|일))?[^.!?\n]{0,24}(?:추정|환산|계산(?:값|치)?))|(?:(?:추정|환산|계산(?:값|치)?)[^.!?\n]{0,24}\d[\d.,~～\-–—]*\s*(?:μg|mcg|mg|g))|(?:\d+(?:\.\d+)?\s*%[^.!?\n]{0,30}(?:배합|함유)[^.!?\n]{0,30}(?:적용|환산|계산))/iu;
const NUTRIENT_PAIRING_HEADING=/(?:함께\s*섭취|같이\s*먹|조합|상호작용)/u;
const NUTRIENT_DEFICIENCY_EXCESS_HEADING=/(?:결핍.*과다|과다.*결핍|결핍.*추천\s*제품|과다.*추천\s*제품)/u;
const STRUCTURE_LOCK_TAGS=Object.freeze(['h2','h3','p','div','section','aside','ul','ol','li','table','thead','tbody','tr','th','td','img','figure','figcaption','blockquote','details','summary']);
const NUTRIENT_SCOPE_ENFORCEMENT_DATE=20261018;
const NUTRIENT_CHANGE_SCOPES=Object.freeze(new Set(['emphasis-only','content-update','full-rewrite']));

const nodeText=node=>node?.type==='text'?(node.data??''):(node?.children??[]).map(nodeText).join('');
const clean=value=>String(value??'').replace(/\s+/gu,' ').trim();
const sourceDate=id=>{
  const match=String(id??'').match(/(?:^|[-_])(20\d{6})(?:$|[-_])/u);
  return match?Number(match[1]):null;
};

function structureReview(bodyHtml=''){
  const root=parseDocument(String(bodyHtml));
  const totals=Object.fromEntries(STRUCTURE_LOCK_TAGS.map(tag=>[tag,0]));
  const sections=[];
  let current=null;
  const visit=node=>{
    if(node?.name&&Object.prototype.hasOwnProperty.call(totals,node.name))totals[node.name]++;
    if(node.name==='h2'){
      current={heading:clean(nodeText(node)).replace(/^\d+[.)]\s*/u,''),ul:0,ol:0,li:0,table:0,tr:0,h3:0,img:0};
      sections.push(current);
    } else if(current&&node?.name&&Object.prototype.hasOwnProperty.call(current,node.name)){
      current[node.name]++;
    }
    for(const child of node.children??[])visit(child);
  };
  for(const child of root.children??[])visit(child);
  return {totals,sections};
}

export function directFocusReview(bodyHtml='') {
  const root=parseDocument(String(bodyHtml));
  const sections=[];
  let current={heading:'__INTRO__',text:''};
  sections.push(current);
  const visit=node=>{
    if(node.name==='h2'){
      current={heading:clean(nodeText(node)).replace(/^\d+[.)]\s*/u,''),text:''};
      sections.push(current);
      return;
    }
    if(node.type==='text')current.text+=' '+(node.data??'');
    for(const child of node.children??[])visit(child);
  };
  for(const child of root.children??[])visit(child);
  const headings=sections.filter(s=>s.heading!=='__INTRO__').map(s=>s.heading);
  const coreHeadings=headings.filter(h=>!UTILITY_HEADING.test(h));
  const utilityHeadings=headings.filter(h=>UTILITY_HEADING.test(h));
  const nutrientChangeSections=sections
    .filter(section=>section.heading!=='__INTRO__'&&!UTILITY_HEADING.test(section.heading)&&NUTRIENT_CHANGE_HEADING.test(section.heading))
    .map(section=>{
      const text=clean(section.text);
      return {
        heading:section.heading,
        hasTargetGroup:TARGET_GROUP_PATTERN.test(text),
        hasChange:CHANGE_PATTERN.test(text),
        hasTimePeriod:TIME_PERIOD_PATTERN.test(text),
        hasAmount:AMOUNT_PATTERN.test(text),
      };
    });
  const nutrientFoodRankingSections=sections
    .filter(section=>section.heading!=='__INTRO__'&&!UTILITY_HEADING.test(section.heading)&&NUTRIENT_FOOD_RANKING_HEADING.test(section.heading))
    .map(section=>{
      const text=clean(section.text);
      return {
        heading:section.heading,
        hasEstimatedRankingValue:ESTIMATED_RANKING_VALUE_PATTERN.test(text),
      };
    });
  return {coreHeadings,utilityHeadings,nutrientChangeSections,nutrientFoodRankingSections};
}

// Shared direct/SP1 technical structure guard only.
// It does not score research wording, evidence wording, caveats, negativity, or editorial tone.
export function assertDirectSubmissionFocus(source) {
  if(source?.contentStandard!=='SP1'||!source?.id?.startsWith('direct-'))return;
  const review=directFocusReview(source.bodyHtml??'');
  if(review.coreHeadings.length>DIRECT_AUTHORING_CONTRACT.coreHeadingMaximum)throw Error('E_DIRECT_FOCUS_SECTION_OVERLOAD');
  if(source.category==='영양소'){
    const datedSource=sourceDate(source.id);
    const isFutureReadyUpdate=datedSource!==null&&datedSource>=NUTRIENT_SCOPE_ENFORCEMENT_DATE&&source.status==='ready'&&source.approved===true&&Boolean(source.articleId)&&Boolean(source.targetUrl);
    if(isFutureReadyUpdate&&!NUTRIENT_CHANGE_SCOPES.has(source.changeScope))throw Error('E_DIRECT_NUTRIENT_CHANGE_SCOPE_REQUIRED');
    if(source.changeScope==='emphasis-only'&&source.preserveStructure!==true)throw Error('E_DIRECT_STRUCTURE_PRESERVE_FLAG_REQUIRED');

    if(!review.nutrientChangeSections.length)throw Error('E_DIRECT_NUTRIENT_EXPECTED_CHANGE_SECTION_MISSING');
    const targeted=review.nutrientChangeSections.filter(section=>section.hasTargetGroup);
    if(targeted.length&&targeted.every(section=>!(section.hasChange&&section.hasTimePeriod&&section.hasAmount)))
      throw Error('E_DIRECT_NUTRIENT_EXPECTED_CHANGE_INCOMPLETE');
    if(review.nutrientFoodRankingSections.some(section=>section.hasEstimatedRankingValue))
      throw Error('E_DIRECT_NUTRIENT_FOOD_RANKING_ESTIMATED_VALUE');

    const structure=structureReview(source.bodyHtml??'');
    const foodSections=structure.sections.filter(section=>NUTRIENT_FOOD_RANKING_HEADING.test(section.heading));
    if(foodSections.some(section=>section.table<1))throw Error('E_DIRECT_NUTRIENT_FOOD_TABLE_MISSING');

    const pairingSections=structure.sections.filter(section=>NUTRIENT_PAIRING_HEADING.test(section.heading));
    if(pairingSections.some(section=>section.table<1&&section.ul+section.ol<1))
      throw Error('E_DIRECT_NUTRIENT_PAIRING_STRUCTURE_MISSING');

    const safetyProductSections=structure.sections.filter(section=>NUTRIENT_DEFICIENCY_EXCESS_HEADING.test(section.heading));
    if(safetyProductSections.some(section=>section.table<1&&section.ul+section.ol<1))
      throw Error('E_DIRECT_NUTRIENT_SAFETY_PRODUCT_STRUCTURE_MISSING');

    if(source.changeScope==='emphasis-only'||source.preserveStructure===true){
      const baseline=source.structureBaseline;
      if(!baseline||typeof baseline!=='object'||Array.isArray(baseline))throw Error('E_DIRECT_STRUCTURE_BASELINE_MISSING');
      for(const tag of STRUCTURE_LOCK_TAGS){
        if(!Object.prototype.hasOwnProperty.call(baseline,tag))continue;
        const expected=Number(baseline[tag]);
        if(!Number.isInteger(expected)||expected<0)throw Error('E_DIRECT_STRUCTURE_BASELINE_INVALID');
        if(structure.totals[tag]!==expected)throw Error('E_DIRECT_STRUCTURE_PRESERVATION');
      }
      for(const tag of ['h2','h3','ul','ol','li','table','tr','img','blockquote']){
        if(!Object.prototype.hasOwnProperty.call(baseline,tag))throw Error('E_DIRECT_STRUCTURE_BASELINE_INVALID');
      }
    }
  }
  return review;
}
