import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import food from './standards/food.mjs';
import nutrient from './standards/nutrient.mjs';
import medicine from './standards/medicine.mjs';
import disease from './standards/disease.mjs';
import { CONTENT_STANDARD_VERSION, DOMAINS, SITE_CATEGORIES, MODULES, EXTENSIONS, REVIEW_CHECKS, SOURCE_KINDS, SOURCE_ROLES, ENTITY_DOMAINS, UNAMBIGUOUS_TOPICS, normTopic, TOPIC_ENTITIES, TOPIC_EXTENSIONS } from './standards/common.mjs';
import { inspectHtml, normalizeText, sectionByHeading, assertPublicHttps, textOf } from './content-html.mjs';
import { inspectTone } from './content-tone.mjs';
import { inspectEmphasis, inspectScanDensity, SCAN_DENSITY_POLICY } from './content-emphasis.mjs';
import { checkDecisionDetails } from './content-decisions.mjs';
import { checkCrossDomain } from './cross-domain.mjs';

export const DOMAIN_RULES = Object.freeze({ food, nutrient, medicine, disease });
const R53_REQUIRED = Object.freeze({
  food:['identity','nutrition','benefits','combinations','safety','selection'],
  nutrient:['benefits','long_term','amount','food_sources','combinations','deficiency'],
  medicine:['identity','indications','combinations','interactions','safety','alternatives'],
  disease:['identity','risk','diagnosis','diet','treatment','follow_up'],
});
const isR53Source = source => /^auto-\d+-r53-/.test(source?.id ?? '');
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const completeText = (value, min = 10) => typeof value === 'string' && normalizeText(value).length >= min && !/^(TODO|TBD|미작성|작성 필요|해당 없음|없음|N\/A|예시)$/iu.test(value.trim());
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const contentDigest = source => createHash('sha256').update(JSON.stringify(canonical(source))).digest('hex');
export const todayInSeoul = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
function validDay(day, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) return false;
  const date = new Date(day + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day && day <= today;
}
export function evaluateContent(source, manifest, { today = todayInSeoul(), enforceScanDensity = true } = {}) {
  const errors = [], warnings = [];
  const add = (code, detail) => errors.push({ code, detail });
  const warn = (code, detail) => warnings.push({ code, detail });
  const result = extra => ({ passed: errors.length === 0, errors, warnings, ...extra });
  if (source?.contentStandard !== CONTENT_STANDARD_VERSION) { add('E_CONTENT_STANDARD_REQUIRED', 'contentStandard=R1'); return result(); }
  if (!object(manifest) || manifest.version !== CONTENT_STANDARD_VERSION || !DOMAINS.includes(manifest.domain)) { add('E_CONTENT_REVIEW_SCHEMA', 'version/domain'); return result(); }
  const allowed = ['version','domain','classification','sourceDigest','intent','extensions','coverage','connections','sources','glossary','comparisons','combinations','selectionCriteria','review'];
  if (Object.keys(manifest).some(k => !allowed.includes(k))) add('E_CONTENT_REVIEW_SCHEMA', 'unknown fields');
  if (manifest.sourceDigest !== contentDigest(source)) add('E_CONTENT_REVIEW_STALE', '본문·이미지·분류·승인 상태 변경 후 재검토 필요');
  const domain = manifest.domain;
  const r53 = isR53Source(source);
  if (!SITE_CATEGORIES[domain].includes(source.category)) add('E_CONTENT_CATEGORY_MISMATCH', `${domain} / ${source.category ?? 'missing'}`);
  const c = manifest.classification;
  if (!object(c) || c.status !== 'resolved' || !completeText(c.rawInput, 1) || !completeText(c.topic, 1) || !completeText(c.meaning, 2) || !completeText(c.reason) || !/^[a-z][a-z0-9:-]{2,100}$/.test(c.entityId ?? '')) add('E_CONTENT_CLASSIFICATION', '원문·주제·의미·근거·entityId 필요');
  if (c) {
    const known = ENTITY_DOMAINS[c.entityId] ?? UNAMBIGUOUS_TOPICS[normTopic(c.topic)];
    if (known && known !== domain) add('E_CONTENT_CLASSIFICATION_CONFLICT', c.topic);
    if (/^(food|nutrient|medicine|disease):/.test(c.entityId ?? '') && !c.entityId.startsWith(domain + ':')) add('E_CONTENT_CLASSIFICATION_CONFLICT', c.entityId);
    if (normTopic(c.topic) === '배' && (!/과일|배나무|pear/i.test(c.meaning ?? '') || domain !== 'food')) add('E_CONTENT_AMBIGUOUS_TOPIC', '과일 배는 명시적으로 해소하고 복통은 복통으로 정규화');
  }
  if (!object(manifest.intent) || !completeText(manifest.intent.primaryQuestion) || !completeText(manifest.intent.readerSituation) || !Array.isArray(manifest.intent.nextActions) || !manifest.intent.nextActions.length || manifest.intent.nextActions.some(a => !completeText(a))) add('E_CONTENT_INTENT', '독자의 상황·질문·다음 행동');
  const required = new Set(r53 ? (R53_REQUIRED[domain] ?? DOMAIN_RULES[domain].core) : DOMAIN_RULES[domain].core);
  if (!object(manifest.extensions) || Object.keys(manifest.extensions).some(k => !Object.hasOwn(EXTENSIONS, k))) add('E_CONTENT_EXTENSIONS', '확장 모듈 검토표');
  for (const [key, modules] of Object.entries(EXTENSIONS)) {
    const entry = manifest.extensions?.[key];
    if (!object(entry) || typeof entry.applies !== 'boolean' || !completeText(entry.reason)) { add('E_CONTENT_EXTENSION_DECISION', key); continue; }
    if (entry.applies && !r53) for (const module of modules) required.add(module);
    if (entry.applies && ['cultivars','origins','seasonality'].includes(key) && domain !== 'food' && !/원료|산지|식품/.test(entry.reason)) warn('W_CONTENT_EXTENSION_FIT', key);
  }
  const topicEntity = TOPIC_ENTITIES[normTopic(c?.topic)] ?? c?.entityId;
  if (TOPIC_ENTITIES[normTopic(c?.topic)] && c?.entityId !== topicEntity) add('E_CONTENT_ENTITY_CANONICAL', topicEntity);
  for (const key of TOPIC_EXTENSIONS[topicEntity] ?? []) {
    // Profiles suggest questions; the explicit, reasoned decision owns applicability.
    // Applicable extensions are already added above. Do not force unsupported content.
    if (manifest.extensions?.[key]?.applies === false) warn('W_CONTENT_TOPIC_EXTENSION_OMITTED', key);
  }
  const document = inspectHtml(source.bodyHtml ?? '');
  const sources = new Map();
  if (!Array.isArray(manifest.sources)) add('E_CONTENT_SOURCES', 'sources array');
  for (const s of Array.isArray(manifest.sources) ? manifest.sources : []) {
    if (!object(s) || !/^[a-z][a-z0-9-]{1,60}$/.test(s.id ?? '') || sources.has(s.id) || !SOURCE_KINDS.includes(s.kind) || !SOURCE_ROLES.includes(s.role) || !completeText(s.title, 3) || !completeText(s.scopeNote) || !validDay(s.checkedAt, today)) { add('E_CONTENT_SOURCE_SCHEMA', s?.id ?? 'source'); continue; }
    try { assertPublicHttps(s.url); } catch { add('E_CONTENT_SOURCE_URL', s.id); continue; }
    if (!document.links.includes(s.url)) add('E_CONTENT_SOURCE_NOT_IN_BODY', s.id);
    sources.set(s.id, s);
  }
  const minimumEvidence = r53 && ['food','nutrient'].includes(domain) ? 1 : 2;
  if (new Set([...sources.values()].filter(s => ['health','safety','nutrition','authorization'].includes(s.role) && ['official','guideline','systematic-review','trial','nutrition-database'].includes(s.kind)).map(s => s.url)).size < minimumEvidence) add('E_CONTENT_HEALTH_EVIDENCE', '건강 근거 자료 수 부족');
  if (['medicine','disease'].includes(domain) && ![...sources.values()].some(s => ['official','guideline'].includes(s.kind) && ['health','safety','authorization'].includes(s.role))) add('E_CONTENT_PRIMARY_MEDICAL_SOURCE', domain);
  if (domain === 'medicine' && ![...sources.values()].some(s => s.kind === 'official' && s.role === 'authorization' && /(^|\.)mfds\.go\.kr$/.test(new URL(s.url).hostname))) add('E_CONTENT_KR_AUTHORIZATION', '정확한 제품·성분의 국내 허가사항');
  const coverage = new Map();
  if (!Array.isArray(manifest.coverage)) add('E_CONTENT_COVERAGE', 'coverage array');
  for (const item of Array.isArray(manifest.coverage) ? manifest.coverage : []) {
    if (!object(item) || !Object.hasOwn(MODULES, item.module ?? '') || coverage.has(item.module)) { add('E_CONTENT_MODULE', item?.module ?? 'module'); continue; }
    coverage.set(item.module, item);
    const section = sectionByHeading(document, item.heading), quote = normalizeText(item.answerQuote);
    if (!section || !completeText(quote, 12) || !section.text.includes(quote)) add('E_CONTENT_ANSWER_NOT_FOUND', item.module);
    const safetyKinds = {red_flags:['danger','care'],contraindications:['caution','danger','care']}[item.module];
    if (safetyKinds && section && !inspectHtml(section.body).elements.some(n => n.name === 'blockquote' && safetyKinds.includes(n.attribs['data-kind']) && normalizeText(textOf(n)).includes(quote))) add('E_CONTENT_SAFETY_EMPHASIS', item.module);
    if (!Array.isArray(item.sourceIds) || (item.module !== 'decision' && !item.sourceIds.length)) add('E_CONTENT_MODULE_EVIDENCE', item.module);
    for (const id of Array.isArray(item.sourceIds) ? item.sourceIds : []) {
      const s = sources.get(id);
      if (!s || (section && !section.links.includes(s.url))) add('E_CONTENT_MODULE_CITATION', `${item.module}:${id}`);
    }
  }
  for (const module of required) if (!coverage.has(module)) add('E_CONTENT_REQUIRED_MODULE', module);
  if (!r53) {
    checkCrossDomain(manifest, document, add);
    for (const entry of Object.values(manifest.connections ?? {})) {
      if (entry?.status !== 'included') continue;
      const section = sectionByHeading(document, entry.heading);
      for (const id of Array.isArray(entry.sourceIds) ? entry.sourceIds : []) if (!sources.has(id) || (section && !section.links.includes(sources.get(id).url))) add('E_CONTENT_CONNECTION_CITATION', id);
    }
    checkDecisionDetails(manifest, document, sources, add);
    inspectTone(document, manifest, add, warn);
    if (enforceScanDensity) inspectScanDensity(document, add);
  }
  inspectEmphasis(document, add, warn);
  const r = manifest.review;
  if (!object(r) || r.status !== 'approved' || !validDay(r.checkedAt, today) || !object(r.reviewer) || !['human','ai'].includes(r.reviewer.kind) || !completeText(r.reviewer.name, 2) || !['same-author','independent'].includes(r.reviewer.independence)) add('E_CONTENT_REVIEW_REQUIRED', '실제 편집 검토 기록');
  for (const check of REVIEW_CHECKS) if (r?.checks?.[check]?.status !== 'pass' || !completeText(r.checks[check].note, 12)) add('E_CONTENT_REVIEW_CHECK', check);
  for (const warning of warnings) if (!(Array.isArray(r?.warningResolutions) ? r.warningResolutions : []).some(x => x?.code === warning.code && completeText(x.note, 12))) add('E_CONTENT_WARNING_REVIEW', warning.code);
  if (r && !Array.isArray(r.warningResolutions)) add('E_CONTENT_REVIEW_SCHEMA', 'warningResolutions array');
  // PASS proves the declared contract and review evidence exist. It is NOT an independent medical/semantic verdict.
  return result({ domain, requiredModules: [...required], reviewedBy: r?.reviewer, semanticVerification: 'editor-attested-not-automatically-proven', scanDensityPolicy: enforceScanDensity ? SCAN_DENSITY_POLICY.version : 'archival-skip' });
}
export function readContentReview(source, { kind = source?.articleId ? 'updates' : 'posts', root = process.cwd() } = {}) {
  if (!['posts','updates'].includes(kind) || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(source?.id ?? '')) throw new Error('E_CONTENT_REVIEW_PATH');
  let review;
  try { review = JSON.parse(readFileSync(resolve(root, 'content-reviews', kind, `${source.id}.json`), 'utf8')); }
  catch { throw new Error('E_CONTENT_REVIEW_MISSING'); }
  return review;
}
export function assertContentStandard(source, options = {}) {
  if(source?.contentStandard==='SP1') {
    return {passed:null,skipped:true,errors:[],warnings:[],semanticVerification:'not-performed'};
  }
  if (source?.contentStandard !== CONTENT_STANDARD_VERSION) throw new Error('E_CONTENT_STANDARD_REQUIRED');
  const report = evaluateContent(source, options.manifest ?? readContentReview(source, options), options);
  if (!report.passed) { const error = new Error(report.errors[0].code); error.details = report.errors; throw error; }
  return report;
}
