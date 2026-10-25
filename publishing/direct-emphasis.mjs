import {parseDocument} from 'htmlparser2';
import {DIRECT_AUTHORING_CONTRACT} from './direct-authoring-contract.mjs';

export const DIRECT_EMPHASIS_MINIMUMS=DIRECT_AUTHORING_CONTRACT.emphasisMinimums;
export const DIRECT_NUTRIENT_EMPHASIS_MINIMUMS=DIRECT_AUTHORING_CONTRACT.nutrientEmphasisMinimums;
// Food emphasis is semantic, not quota-driven. Keep this export for compatibility.
export const DIRECT_FOOD_EMPHASIS_MINIMUMS=null;

// Structural omission guard only; the author still chooses meaningful phrases.
export function assertDirectEmphasis(source) {
  if(!source.id?.startsWith('direct-'))return;
  const contains=(node,name)=>(node.children??[]).some(child=>child.name===name||contains(child,name));
  let emphasized=false;
  const visit=node=>{
    if(node.name==='mark'&&contains(node,'strong'))emphasized=true;
    for(const child of node.children??[])visit(child);
  };
  visit(parseDocument(source.bodyHtml??''));
  if(!emphasized)throw Error('E_DIRECT_EMPHASIS_MISSING');
}

const OFFICIAL_INTAKE_ABSENCE_PATTERN=/(?:공식\s*)?(?:하루\s*)?(?:권장량|권장\s*섭취량|상한)(?:이|가|은|는)?[^.!?]{0,35}(?:없|정해(?:지지|져\s*있지)\s*않|마련되지\s*않)/u;
const DEFENSIVE_NEGATION_HIGHLIGHT_PATTERN=/(?:아닙니다|아니다|아니며|아니고|같지\s*않|동일하지\s*않|보면\s*안\s*(?:됩니다|된다))/u;
const LIMITATION_HIGHLIGHT_PATTERNS=[
  /(?:근거|자료|증거)(?:가|는|를|도)?\s*(?:부족|충분하지|제한적)/u,
  /(?:확인|입증|검증)(?:하지\s*못|되지\s*않|되지\s*않았|되지\s*않은|되지\s*않습니다|되지\s*않았다|되지\s*않음)/u,
  /단정(?:하기|할\s*수)?\s*어렵/u,
  /말할\s*만한[^.!?]{0,30}근거(?:가|는)?\s*부족/u,
  /확립(?:(?:되지\s*않|되지\s*않았|되지\s*않은|되지\s*않습니다|되지\s*않았다|되지\s*않음)|(?:(?:돼|되어)\s*있지\s*않))/u,
  /(?:보장|장담)(?:할\s*수)?\s*없/u,
  /(?:효과|변화|이득|개선)(?:가|은|는|을|를)?[^.!?]{0,30}(?:나타나지\s*않|없었|없습니다|확인하지\s*못|관찰되지\s*않)/u,
  /(?:(?:비교\s*가능한)\s*)?(?:공식\s*)?(?:자료|데이터(?:베이스)?|기준)(?:가|는)?\s*(?:없|마련되지\s*않)/u,
  /(?:모든|누구나)[^.!?]{0,40}(?:필요|먹어야|복용해야|섭취해야)[^.!?]{0,25}(?:아니|아닙|없)/u,
  OFFICIAL_INTAKE_ABSENCE_PATTERN,
  DEFENSIVE_NEGATION_HIGHLIGHT_PATTERN,
  /(?:유의하게|뚜렷하게)[^.!?]{0,35}(?:달라지지\s*않|변하지\s*않|개선되지\s*않)/u,
  /(?:같은|동일한)\s*(?:효과\s*크기|섭취\s*기준|용량|조건)[^.!?]{0,30}(?:(?:계산|판단|적용)하지\s*않|아니|않|다(?:르|릅))/u,
  /(?:보충|농축|추출|오일)[^.!?]{0,70}(?:조리용|일상|평소)[^.!?]{0,45}(?:조건|용량|농도|제형)(?:이|가|은|는)?\s*다(?:르|릅)/u,
  /(?:조리용|일상|평소)[^.!?]{0,70}(?:보충|농축|추출|오일)[^.!?]{0,45}(?:조건|용량|농도|제형)(?:이|가|은|는)?\s*다(?:르|릅)/u,
  /(?:시험|자료|수치|용량)[^.!?]{0,70}(?:권장량|안전\s*상한)[^.!?]{0,30}(?:바꾸지\s*않|간주하지\s*않)/u,
  /(?:일상|평소|조리용)[^.!?]{0,45}(?:그대로|같은)[^.!?]{0,25}(?:적용|계산|판단)(?:하지\s*않|할\s*수\s*없)/u,
  /(?:효과|개선|수치|결과)[^.!?]{0,55}(?:예방|치료|효능)[^.!?]{0,35}(?:바꾸어\s*해석하면\s*안|확대(?:해|하여)\s*표현하지\s*않|동일하게\s*볼\s*수\s*없)/u,
];
const PURE_SAFETY_HEADING=/^(?:주의(?:사항)?|부작용(?:과|·)\s*주의(?:사항)?|금기(?:와|·)\s*주의(?:사항)?|응급(?:\s*신호)?|이상반응(?:과|·)\s*주의(?:사항)?)$/u;
const ACTIONABLE_SAFETY_PATTERN=/(?:즉시\s*(?:중단|진료|병원|응급)|복용을?\s*중단|섭취를?\s*중단|피해야|복용하지\s*말|섭취하지\s*말|의료진(?:과|에게)\s*(?:상담|확인)|진료를?\s*받)/u;
const BENEFIT_HEADING_PATTERN=/(?:효능|기대(?:되는)?(?:\s*신체)?\s*변화|어떤\s*변화|건강상\s*이점|장점)/u;
const BENEFIT_OUTCOME_PATTERN=/(?:개선|증가|감소|낮추|줄(?:이|어)|유지|보호|회복|완화|향상|도움|위험\s*감소|진행\s*(?:지연|감소))/u;
const TOP_FOOD_HEADING_PATTERN=/(?:TOP\s*\d+|풍부한\s*식품)/iu;
const DEFINITION_HEADING_PATTERN=/(?:정의와\s*주요\s*성분|정의.*주요.*성분.*작용)/u;
const NUTRIENT_NARRATIVE_CONNECTOR_PATTERN=/(?:하지만|그러나|반면|다만|그래서|때문에|(?:으|이)므로|(?:이|하)지만)/u;
const NUTRIENT_HIGHLIGHT_MAX_CHARS=32;
const MARK_TONES=new Set(['positive','info','caution','negative']);
const nodeText=node=>node?.type==='text'?(node.data??''):(node?.children??[]).map(nodeText).join('');
const cleanText=value=>String(value??'').replace(/\s+/gu,' ').trim();
const containsTag=(node,name)=>node?.name===name||(node?.children??[]).some(child=>containsTag(child,name));
const containsMarkedStrong=node=>(node?.name==='mark'&&containsTag(node,'strong'))||(node?.children??[]).some(containsMarkedStrong);
const highlightLevel=node=>{
  let level=node?.name==='mark'&&containsTag(node,'strong')?(containsTag(node,'u')?3:2):0;
  for(const child of node?.children??[])level=Math.max(level,highlightLevel(child));
  return level;
};
const collectRows=(node,rows=[])=>{
  if(node?.name==='tr')rows.push(node);
  for(const child of node?.children??[])collectRows(child,rows);
  return rows;
};
const firstDataCell=row=>(row?.children??[]).find(child=>child?.name==='td');

// New submission preparation only. Historical read-only loading keeps its existing guard.
export function assertDirectSubmissionEmphasis(source) {
  if(source.contentStandard!=='SP1'||!source.id?.startsWith('direct-'))return;
  assertDirectEmphasis(source);
  // Food content must not be rewritten to satisfy arbitrary emphasis counts.
  // Other categories keep their existing numerical contracts.
  const minimums=source.category==='음식'
    ?null
    :source.category==='영양소'
      ?DIRECT_NUTRIENT_EMPHASIS_MINIMUMS
      :DIRECT_EMPHASIS_MINIMUMS;
  let currentHeading='';
  let inBenefitSection=false;
  let hasBenefitSection=false;
  let inDefinitionSection=false;
  let definitionAnswerCaptured=false;
  let definitionAnswerLevel=0;
  let definitionSectionMaxLevel=0;
  let definitionPriorityViolation=false;
  let benefitOutcomeHighlights=0;
  let primaryHighlights=0;
  let boldCount=0;
  let highlightCount=0;
  let underlineCount=0;
  let topRankEmphasisMissing=false;
  const finishDefinitionSection=()=>{
    if(inDefinitionSection&&definitionAnswerCaptured&&definitionSectionMaxLevel>definitionAnswerLevel)definitionPriorityViolation=true;
  };
  const visit=node=>{
    if(node.name==='h2'){
      finishDefinitionSection();
      const rawHeading=cleanText(nodeText(node));
      currentHeading=rawHeading.replace(/^\d+[.)]\s*/u,'');
      inBenefitSection=BENEFIT_HEADING_PATTERN.test(currentHeading);
      if(inBenefitSection)hasBenefitSection=true;
      inDefinitionSection=source.category==='영양소'&&(/^1[.)]\s*/u.test(rawHeading)||DEFINITION_HEADING_PATTERN.test(currentHeading));
      definitionAnswerCaptured=false;
      definitionAnswerLevel=0;
      definitionSectionMaxLevel=0;
    } else if(inDefinitionSection&&!definitionAnswerCaptured&&['p','ul','ol','table','blockquote'].includes(node.name)) {
      definitionAnswerCaptured=true;
      definitionAnswerLevel=highlightLevel(node);
    }
    if(source.category==='영양소'&&node.name==='table'&&TOP_FOOD_HEADING_PATTERN.test(currentHeading)){
      const rankedRows=collectRows(node).map(row=>{
        const first=firstDataCell(row);
        const match=cleanText(nodeText(first)).match(/^([123])(?:위)?$/u);
        return match?{rank:Number(match[1]),row}:null;
      }).filter(Boolean);
      const topThree=[1,2,3].map(rank=>rankedRows.find(item=>item.rank===rank)).filter(Boolean);
      if(topThree.length===3&&topThree.some(item=>!containsMarkedStrong(item.row)))topRankEmphasisMissing=true;
    }
    if(node.name==='strong')boldCount++;
    if(node.name==='mark') {
      highlightCount++;
      const rawTone=node.attribs?.['data-tone'];
      const tone=rawTone==null?'default':String(rawTone).trim().toLowerCase();
      if(tone!=='default'&&!MARK_TONES.has(tone))throw Error('E_DIRECT_EMPHASIS_TONE');
      const children=(node.children??[]).filter(n=>n.type!=='comment' && !(n.type==='text'&&!n.data.trim()));
      const inner=children[0];
      const underlined=inner?.name==='u';
      const boldChildren=underlined?(inner.children??[]).filter(n=>n.type!=='comment' && !(n.type==='text'&&!n.data.trim())):children;
      if(children.length!==1||boldChildren.length!==1||boldChildren[0].name!=='strong')throw Error('E_DIRECT_EMPHASIS_STRUCTURE');
      if(underlined)underlineCount++;
      if(inDefinitionSection)definitionSectionMaxLevel=Math.max(definitionSectionMaxLevel,underlined?3:2);
      const text=cleanText(nodeText(node));
      const isLimitation=LIMITATION_HIGHLIGHT_PATTERNS.some(pattern=>pattern.test(text));
      const isActionableSafety=PURE_SAFETY_HEADING.test(currentHeading)&&ACTIONABLE_SAFETY_PATTERN.test(text);
      // Nutrient highlights are scan anchors, not narrative sentences. Keep only short phrases / values / actions.
      // A full-sentence safety instruction remains allowed only inside a dedicated safety section.
      const isNutrientNarrativeHighlight=source.category==='영양소'&&!isActionableSafety&&(
        Array.from(text).length>NUTRIENT_HIGHLIGHT_MAX_CHARS||
        NUTRIENT_NARRATIVE_CONNECTOR_PATTERN.test(text)||
        /[.!?。]$/u.test(text)
      );
      if(isNutrientNarrativeHighlight)throw Error('E_DIRECT_NUTRIENT_HIGHLIGHT_NARRATIVE');
      // Limitation, no-effect, defensive-negation and neutral absence-of-standard facts stay plain/bold.
      // Only an actionable safety instruction in a dedicated safety section may remain strongly highlighted.
      if(isLimitation&&!isActionableSafety)throw Error('E_DIRECT_EMPHASIS_LIMITATION');
      if(!PURE_SAFETY_HEADING.test(currentHeading))primaryHighlights++;
      if(source.category==='영양소'&&inBenefitSection&&tone==='positive'&&BENEFIT_OUTCOME_PATTERN.test(text))benefitOutcomeHighlights++;
    }
    for(const child of node.children??[])visit(child);
  };
  visit(parseDocument(source.bodyHtml??''));
  finishDefinitionSection();
  if(!primaryHighlights)throw Error('E_DIRECT_PRIMARY_EMPHASIS_MISSING');
  // The first answer block under nutrient H2 #1 is the definition itself. Product comparison or label-reading guidance
  // later in the section must never receive a stronger emphasis tier than that direct answer.
  if(definitionPriorityViolation)throw Error('E_DIRECT_DEFINITION_ANSWER_EMPHASIS_PRIORITY');
  // Nutrient benefit sections must visibly emphasize at least one confirmed health outcome,
  // not merely source quality, limitations, dosage, or product-selection facts.
  if(source.category==='영양소'&&hasBenefitSection&&!benefitOutcomeHighlights)throw Error('E_DIRECT_BENEFIT_EMPHASIS_MISSING');
  // In a nutrient TOP food table, ranks 1-3 are the direct answer to the H2 and must be visibly emphasized.
  if(topRankEmphasisMissing)throw Error('E_DIRECT_TOP3_EMPHASIS_MISSING');
  if(minimums){
    if(boldCount<minimums.bold)throw Error('E_DIRECT_EMPHASIS_BOLD_MIN');
    if(highlightCount<minimums.highlight)throw Error('E_DIRECT_EMPHASIS_HIGHLIGHT_MIN');
    if(underlineCount<minimums.underline)throw Error('E_DIRECT_EMPHASIS_UNDERLINE_MIN');
  }
  return {boldCount,highlightCount,underlineCount};
}