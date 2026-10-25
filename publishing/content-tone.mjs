import { normalizeText, textOf } from './content-html.mjs';

export function inspectTone(document, review, add, warn) {
  // Deliberately narrow hard failures. Negation and urgent safety instructions remain allowed.
  const prose = document.sections.filter(s => !['자료 출처','함께 보면 좋은 글'].includes(s.heading)).map(s => s.text).join(' ');
  if (/(기존\s*글처럼.{0,100}(잘못|틀렸)|기존\s*표현은.{0,50}삭제|삭제하는\s*것이\s*맞습니다|독자도\s*이\s*정도는|상식적으로\s*생각해)/u.test(document.text)) add('E_CONTENT_EDITOR_MEMO', '본문');
  const glossary = review.glossary;
  if (!Array.isArray(glossary)) { add('E_CONTENT_GLOSSARY', 'glossary'); return; }
  const seen = new Set();
  for (const item of glossary) {
    const term = normalizeText(item?.term), explanation = normalizeText(item?.explanation);
    if (!term || seen.has(term) || explanation.length < 6) { add('E_CONTENT_GLOSSARY', term); continue; }
    seen.add(term);
    const at = document.text.indexOf(term);
    if (at < 0 || !document.text.slice(Math.max(0, at - 160), at + term.length + 200).includes(explanation)) add('E_CONTENT_TERM_UNEXPLAINED', term);
  }
  for (const term of ['생체이용률','혈소판 응집','인슐린 저항성','고칼륨혈증','메타분석','무작위 대조시험']) {
    if (prose.includes(term) && !seen.has(term)) add('E_CONTENT_TERM_UNEXPLAINED', term);
  }
  const paragraphs = document.elements.filter(n => n.name === 'p').map(n => normalizeText(textOf(n))).filter(Boolean);
  if (paragraphs.some(p => Array.from(p).length > 450)) warn('W_CONTENT_LONG_PARAGRAPH', '450자 초과 문단: 모바일 가독성 검토');
  if ((prose.match(/하지만|다만|안 됩니다|없습니다|어렵습니다/gu) ?? []).length > 16) warn('W_CONTENT_NEGATIVE_RHYTHM', '제한 설명의 반복 여부를 검토하되 필요한 경고는 유지');
  const duplicates = paragraphs.filter((p, i) => p.length > 50 && paragraphs.indexOf(p) < i);
  if (duplicates.length) warn('W_CONTENT_DUPLICATE_PROSE', '요약 외 본문 반복 여부 검토');
}
