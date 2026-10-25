import { normalizeText, sectionByHeading } from './content-html.mjs';
const text = v => typeof v === 'string' && normalizeText(v).length >= 8;
export function checkDecisionDetails(review, document, sources, add) {
  function anchor(item, code) {
    const section = sectionByHeading(document, item.heading), quote = normalizeText(item.answerQuote);
    if (!section || quote.length < 12 || !section.text.includes(quote)) add(code, '본문 답변 위치');
    if (!Array.isArray(item.sourceIds) || !item.sourceIds.length) { add(code, '근거 누락'); return; }
    for (const id of item.sourceIds) if (!sources.has(id) || (section && !section.links.includes(sources.get(id).url))) add(code, `근거:${id}`);
  }
  for (const [key, extension] of [['comparisons','comparison'],['combinations','combinations'],['selectionCriteria','products']]) {
    if (!Array.isArray(review[key]) || (review.extensions?.[extension]?.applies && !review[key].length)) add('E_CONTENT_DECISION_DETAILS', key);
  }
  for (const c of Array.isArray(review.comparisons) ? review.comparisons : []) {
    if (!c || typeof c !== 'object') { add('E_CONTENT_COMPARISON_BASIS','비교 객체'); continue; }
    if (!text(c.goal) || !text(c.basis) || typeof c.left !== 'string' || !c.left.trim() || typeof c.right !== 'string' || !c.right.trim() || c.left === c.right || !['head-to-head','indirect','qualitative'].includes(c.directness) || !text(c.limitations)) add('E_CONTENT_COMPARISON_BASIS', c.goal);
    anchor(c,'E_CONTENT_COMPARISON_EVIDENCE');
  }
  for (const c of Array.isArray(review.combinations) ? review.combinations : []) {
    if (!c || typeof c !== 'object') { add('E_CONTENT_COMBINATION_TYPE','조합 객체'); continue; }
    if (!Array.isArray(c.items) || c.items.some(x => typeof x !== 'string' || !x.trim()) || new Set(c.items).size < 2 || !text(c.purpose) || !['benefit','compatible-only','symptom-support','avoid','consult','insufficient-evidence'].includes(c.relationship)) add('E_CONTENT_COMBINATION_TYPE', c.relationship);
    anchor(c,'E_CONTENT_COMBINATION_EVIDENCE');
    if (c.relationship === 'benefit' && !(Array.isArray(c.sourceIds) ? c.sourceIds : []).some(id => ['official','guideline','systematic-review','trial'].includes(sources.get(id)?.kind))) add('E_CONTENT_COMBINATION_BENEFIT', '추가 효과를 단순 병용 가능과 구분');
  }
  for (const c of Array.isArray(review.selectionCriteria) ? review.selectionCriteria : []) {
    if (!c || typeof c !== 'object') { add('E_CONTENT_SELECTION_CRITERION','선택기준 객체'); continue; }
    if (!text(c.criterion) || !text(c.whyItMatters) || !text(c.howToCheck)) add('E_CONTENT_SELECTION_CRITERION', c.criterion);
    anchor(c,'E_CONTENT_SELECTION_EVIDENCE');
  }
}
