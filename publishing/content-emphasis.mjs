import { inspectHtml, normalizeText, textOf, walk } from './content-html.mjs';

export const EMPHASIS_PALETTE = Object.freeze({
  key: { background: '#fff1a8', color: '#713f12', label: '핵심' },
  action: { background: '#dcfce7', color: '#14532d', label: '도움 되는 행동' },
  info: { background: '#dbeafe', color: '#1e3a8a', label: '참고' },
  caution: { background: '#ffedd5', color: '#7c2d12', label: '주의' },
  danger: { background: '#fee2e2', color: '#7f1d1d', label: '위험' }
});
export const CALLOUTS = Object.freeze({
  tip: { tone: 'info', label: '생활 팁' }, check: { tone: 'action', label: '확인할 점' },
  caution: { tone: 'caution', label: '주의' }, danger: { tone: 'danger', label: '즉시 확인할 위험 신호' },
  care: { tone: 'info', label: '진료·상담이 필요한 경우' }
});
const inline = new Set(['strong', 'em', 'u', 'mark']);

export const SCAN_DENSITY_POLICY = Object.freeze({
  version: 'R4-scan-v1',
  thresholds: Object.freeze([
    { minChars: 400, minAnchors: 4, minStrongLike: 2, minHighlightLike: 1 },
    { minChars: 250, minAnchors: 3, minStrongLike: 1, minHighlightLike: 1 },
    { minChars: 120, minAnchors: 2, minStrongLike: 1, minHighlightLike: 1 },
  ]),
  excludedHeadings: Object.freeze(['핵심 정리','함께 보면 좋은 글','자료 출처']),
});

function scanRequirement(chars) {
  return SCAN_DENSITY_POLICY.thresholds.find(rule => chars >= rule.minChars) ?? null;
}
function isScanSection(section) {
  if (section.level !== 2) return false;
  const heading = normalizeText(section.heading);
  if (SCAN_DENSITY_POLICY.excludedHeadings.includes(heading)) return false;
  if (/FAQ$/iu.test(heading)) return false;
  return true;
}
export function scanDensityReport(document) {
  return document.sections.filter(isScanSection).map(section => {
    const body = inspectHtml(section.body);
    const chars = Array.from(section.text).length;
    const strong = body.elements.filter(n => n.name === 'strong').length;
    const marks = body.elements.filter(n => n.name === 'mark').length;
    const colors = body.elements.filter(n => n.name === 'span' && n.attribs?.['data-tone']).length;
    const underlines = body.elements.filter(n => n.name === 'u').length;
    const callouts = body.elements.filter(n => n.name === 'blockquote' && n.attribs?.['data-kind']).length;
    const anchors = strong + marks + colors + underlines + callouts * 3;
    const strongLike = strong + callouts;
    const highlightLike = marks + callouts;
    const requirement = scanRequirement(chars);
    return { heading: section.heading, chars, strong, marks, colors, underlines, callouts, anchors, strongLike, highlightLike, requirement };
  });
}
export function inspectScanDensity(document, add) {
  for (const row of scanDensityReport(document)) {
    const r = row.requirement;
    if (!r) continue;
    if (row.anchors < r.minAnchors || row.strongLike < r.minStrongLike || row.highlightLike < r.minHighlightLike) {
      add('E_CONTENT_SCAN_EMPHASIS', JSON.stringify({
        heading: row.heading, chars: row.chars,
        actual: { anchors: row.anchors, strongLike: row.strongLike, highlightLike: row.highlightLike },
        required: { anchors: r.minAnchors, strongLike: r.minStrongLike, highlightLike: r.minHighlightLike }
      }));
    }
  }
}
export function inspectEmphasis(document, add, warn) {
  let marked = 0;
  for (const node of document.elements) {
    const tone = node.attribs?.['data-tone'];
    if (node.name === 'mark' && !Object.hasOwn(EMPHASIS_PALETTE, tone ?? '')) add('E_CONTENT_EMPHASIS_TONE', 'mark');
    if (tone && !['mark','span'].includes(node.name)) add('E_CONTENT_EMPHASIS_TAG', node.name);
    if (node.name === 'span' && tone && !Object.hasOwn(EMPHASIS_PALETTE, tone)) add('E_CONTENT_EMPHASIS_TONE', 'span');
    const kind = node.attribs?.['data-kind'];
    if (kind && (node.name !== 'blockquote' || !Object.hasOwn(CALLOUTS, kind))) add('E_CONTENT_CALLOUT_KIND', kind);
    if (node.name === 'mark') {
      const text = normalizeText(textOf(node)); marked += Array.from(text).length;
      if (!text || Array.from(text).length > 80) add('E_CONTENT_EMPHASIS_PHRASE', '형광펜은 80자 이내 핵심 구절');
      if (node.children?.some(n => n.name)) add('E_CONTENT_EMPHASIS_NESTING', '형광펜 안에 다른 강조·링크를 중첩하지 않음');
      if (node.parent?.name === 'p' && text.length > 30 && normalizeText(textOf(node.parent)) === text) add('E_CONTENT_EMPHASIS_PARAGRAPH', '문단 전체 형광펜');
    }
    if (inline.has(node.name) || tone) {
      let depth = 1;
      for (let parent = node.parent; parent; parent = parent.parent) if (inline.has(parent.name) || parent.attribs?.['data-tone']) depth++;
      if (depth > 2 || (node.name === 'mark' && depth > 1)) add('E_CONTENT_EMPHASIS_NESTING', node.name);
    }
  }
  if (document.text.length && marked / Array.from(document.text).length > 0.15) warn('W_CONTENT_EMPHASIS_DENSITY', '형광펜 15% 초과: 편집 가이드 경고이며 효과 점수가 아님');
}
export function emphasisExpectations(sourceHtml) {
  const document = inspectHtml(sourceHtml);
  const marks = document.elements.filter(n => n.name === 'mark');
  return {
    highlights: marks.length,
    minimumHighlightColors: new Set(marks.map(n => EMPHASIS_PALETTE[n.attribs['data-tone']]?.background)).size,
    underlines: document.elements.filter(n => n.name === 'u').length,
    marks: marks.map(n => ({ tone: n.attribs['data-tone'], text: normalizeText(textOf(n)) })),
    textColors: document.elements.filter(n => n.name === 'span' && n.attribs['data-tone']).map(n => ({ tone: n.attribs['data-tone'], text: normalizeText(textOf(n)) })),
    callouts: document.elements.filter(n => n.name === 'blockquote' && n.attribs['data-kind']).map(n => ({ kind: n.attribs['data-kind'], text: normalizeText(textOf(n)) }))
  };
}
export function renderSemanticEmphasis(html) {
  const errors = [], doc = inspectHtml(html);
  inspectEmphasis(doc, (code, detail) => errors.push({code, detail}), () => {});
  if (errors.length) throw new Error(errors[0].code);
  let out = html;
  out = out.replace(/<mark data-tone="(key|action|info|caution|danger)">([^<]*)<\/mark>/g, (_m, tone, text) =>
    `<span data-nh-mark="${tone}" style="background:linear-gradient(transparent 45%,${EMPHASIS_PALETTE[tone].background} 45%);padding:0 .06em;">${text}</span>`);
  out = out.replace(/<span data-tone="(key|action|info|caution|danger)">([\s\S]*?)<\/span>/g, (_m, tone, text) =>
    `<span data-nh-color="${tone}" style="color:${EMPHASIS_PALETTE[tone].color};">${text}</span>`);
  out = out.replace(/<u>/g, '<u style="text-decoration:underline;text-underline-offset:3px;">');
  out = out.replace(/<blockquote data-kind="(tip|check|caution|danger|care)">([\s\S]*?)<\/blockquote>/g, (_m, kind, body) => {
    const config = CALLOUTS[kind], palette = EMPHASIS_PALETTE[config.tone];
    return `<div data-nh-callout="${kind}" style="margin:20px 0;padding:16px 18px;background:${palette.background};border-left:4px solid ${palette.color};color:#111827;line-height:1.8;overflow-wrap:anywhere;"><p style="margin:0 0 8px;color:${palette.color};font-weight:700;">${config.label}</p><div data-nh-callout-body="${kind}">${body}</div></div>`;
  });
  return out;
}
export function assertEmphasisContract(renderedHtml, sourceHtml) {
  const e = emphasisExpectations(sourceHtml), r = inspectHtml(renderedHtml);
  const select = key => r.elements.filter(n => n.attribs[key]);
  const marks = select('data-nh-mark').map(n => ({ tone: n.attribs['data-nh-mark'], text: normalizeText(textOf(n)) }));
  const colors = select('data-nh-color').map(n => ({ tone: n.attribs['data-nh-color'], text: normalizeText(textOf(n)) }));
  const calls = select('data-nh-callout-body').map(n => ({ kind: n.attribs['data-nh-callout-body'], text: normalizeText(textOf(n)) }));
  if (JSON.stringify(marks) !== JSON.stringify(e.marks) || JSON.stringify(colors) !== JSON.stringify(e.textColors) || JSON.stringify(calls) !== JSON.stringify(e.callouts)) throw new Error('E_EDITORIAL_R4_EMPHASIS_CONTRACT');
  if (r.elements.filter(n => n.name === 'u').length !== e.underlines) throw new Error('E_EDITORIAL_R4_UNDERLINE_CONTRACT');
  for (const n of select('data-nh-mark')) {
    if (!(n.attribs.style ?? '').includes(EMPHASIS_PALETTE[n.attribs['data-nh-mark']]?.background ?? 'INVALID')) throw new Error('E_EDITORIAL_R4_COLOR_CONTRACT');
  }
  for (const n of select('data-nh-color')) {
    if (!(n.attribs.style ?? '').includes(EMPHASIS_PALETTE[n.attribs['data-nh-color']]?.color ?? 'INVALID')) throw new Error('E_EDITORIAL_R4_COLOR_CONTRACT');
  }
  const blocks = select('data-nh-callout');
  if (blocks.length !== e.callouts.length) throw new Error('E_EDITORIAL_R4_CALLOUT_CONTRACT');
  for (const n of blocks) {
    const kind = n.attribs['data-nh-callout'], config = CALLOUTS[kind];
    if (!config || !normalizeText(textOf(n)).startsWith(config.label) || !(n.attribs.style ?? '').includes(EMPHASIS_PALETTE[config.tone].background)) throw new Error('E_EDITORIAL_R4_CALLOUT_CONTRACT');
  }
  return renderedHtml;
}
