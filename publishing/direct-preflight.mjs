import {DIRECT_AUTHORING_CONTRACT,isDirectSource,hasAuthoritativePreflight} from './direct-authoring-contract.mjs';
import {assertDirectSubmissionEmphasis} from './direct-emphasis.mjs';
import {assertDirectSubmissionFocus} from './direct-focus.mjs';
import {assertImageReview} from './image-review.mjs';
import {assertFoodHighlightPhrases} from './food-highlight-phrase.mjs';
import {assertFoodBenefitBreadth} from './food-benefit-breadth.mjs';
import {renderDirectArticle} from './direct-design.mjs';
import {assertVerifiedFoodStockLeadRemoval} from './food-stock-lead-removal.mjs';

// Food summaries must be written only when they add a distinct reader benefit.
// The old stock lead was inserted across many published articles and repeated
// the same information already present in their six main sections.
export function assertFoodNoStockLead(source){
  if(source?.category!=='음식'||!source?.id?.startsWith('direct-'))return;
  if(/핵심(?:만)?\s*먼저\s*:?/u.test(source.bodyHtml??''))
    throw Error('E_DIRECT_FOOD_STOCK_LEAD');
}


// Require a real six-card reader summary for new complete food rewrites and
// explicit summary-repair revisions. The old generic "핵심만 먼저" stock lead
// remains forbidden; only a uniquely authored, structured summary qualifies.
export function assertFoodQuickSummary(source){
  if(source?.category!=='음식'||source?.contentStandard!=='SP1'||!source?.id?.startsWith('direct-'))return;
  if(source.changeScope!=='full-rewrite'&&!/-summary-r\d+-/u.test(source.id))return;
  const rendered=renderDirectArticle(source.bodyHtml??'');
  const opening='<section class="quick-summary" aria-label="핵심 요약">';
  const count=rendered.split(opening).length-1;
  if(count!==1)throw Error('E_DIRECT_FOOD_QUICK_SUMMARY_MISSING');
  const summary=rendered.slice(rendered.indexOf(opening),rendered.indexOf('</section>',rendered.indexOf(opening)));
  if((summary.match(/<article class="quick-summary-item">/gu)??[]).length!==6)throw Error('E_DIRECT_FOOD_QUICK_SUMMARY_COUNT');
  const firstH2=rendered.indexOf('<h2 id="direct-section-1"');
  if(firstH2!==-1&&rendered.indexOf(opening)>firstH2)throw Error('E_DIRECT_FOOD_QUICK_SUMMARY_PLACEMENT');
}

export function directPreflight(source){
  if(!isDirectSource(source))return {status:'NOT_APPLICABLE',contractVersion:DIRECT_AUTHORING_CONTRACT.version};
  if(source.changeScope==='stock-lead-removal'){
    try{
      assertVerifiedFoodStockLeadRemoval(source);
      assertFoodNoStockLead(source);
      return {status:'PREFLIGHT_PASS',contractVersion:DIRECT_AUTHORING_CONTRACT.version,checks:{verifiedBaseline:'PASS',stockLead:'PASS',otherContent:'UNCHANGED'},errors:[],automatedSemanticVerdict:false};
    }catch(error){
      const code=/^E_[A-Z0-9_]+$/.test(error?.message??'')?error.message:'E_STOCK_LEAD_PREFLIGHT';
      return {status:'FAIL',contractVersion:DIRECT_AUTHORING_CONTRACT.version,checks:{verifiedBaseline:code},errors:[code],automatedSemanticVerdict:false};
    }
  }
  if(hasAuthoritativePreflight())return {status:'PREFLIGHT_REUSED',contractVersion:DIRECT_AUTHORING_CONTRACT.version,validatedSha:process.env.GITHUB_SHA,checks:{stockLead:'REUSED',quickSummary:'REUSED',emphasis:'REUSED',foodHighlightPhrase:'REUSED',foodBenefitBreadth:'REUSED',focus:'REUSED',images:'REUSED'},errors:[],automatedSemanticVerdict:false};
  const checks={},errors=[];
  for(const [name,check] of [['stockLead',assertFoodNoStockLead],['quickSummary',assertFoodQuickSummary],['emphasis',assertDirectSubmissionEmphasis],['foodHighlightPhrase',assertFoodHighlightPhrases],['foodBenefitBreadth',assertFoodBenefitBreadth],['focus',assertDirectSubmissionFocus],['images',assertImageReview]]){
    try{check(source);checks[name]='PASS';}
    catch(error){const code=/^E_[A-Z0-9_]+$/.test(error.message)?error.message:'E_DIRECT_PREFLIGHT_RUNTIME';checks[name]=code;errors.push(code);}
  }
  return {status:errors.length?'FAIL':'PREFLIGHT_PASS',contractVersion:DIRECT_AUTHORING_CONTRACT.version,checks,errors,automatedSemanticVerdict:false};
}
export function assertDirectPreflight(source){
  const result=directPreflight(source);
  if(result.status==='FAIL')throw Error(result.errors[0]);
  return result;
}
