import { parseDocument } from 'htmlparser2';

export const normalizeText = value => String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
export function textOf(node) {
  if (!node) return '';
  if (node.type === 'text') return node.data;
  if (['script', 'style'].includes(node.name)) return '';
  const text = (node.children ?? []).map(textOf).join('');
  return /^(p|h[1-6]|li|tr|blockquote|br|div)$/.test(node.name ?? '') ? `${text} ` : text;
}
export function walk(node, visit) {
  for (const child of node.children ?? []) { visit(child); walk(child, visit); }
}
export function inspectHtml(html) {
  const root = parseDocument(String(html), { decodeEntities: true, withStartIndices: true, withEndIndices: true });
  const elements = [], headings = [], links = [];
  walk(root, node => {
    if (!node.name) return;
    elements.push(node);
    if (/^h[23]$/.test(node.name)) headings.push(node);
    if (node.name === 'a' && node.attribs.href) links.push(node.attribs.href);
  });
  const sections = headings.map((node, index) => {
    // A H2 owns its H3 subsections; a H3 stops at the next H2/H3.
    const end = headings.slice(index + 1).find(next => node.name === 'h3' || next.name === 'h2')?.startIndex ?? html.length;
    const body = html.slice(node.endIndex + 1, end);
    return { heading: normalizeText(textOf(node)), level: Number(node.name[1]), body,
      text: normalizeText(textOf(parseDocument(body))),
      links: (() => { const out = []; walk(parseDocument(body), n => { if (n.name === 'a' && n.attribs.href) out.push(n.attribs.href); }); return out; })() };
  });
  return { root, elements, headings, sections, links, text: normalizeText(textOf(root)) };
}
export function sectionByHeading(document, heading) {
  const matches = document.sections.filter(s => s.heading === normalizeText(heading));
  return matches.length === 1 ? matches[0] : null;
}
export function assertPublicHttps(value, code = 'E_CONTENT_SOURCE_URL') {
  let url;
  try { url = new URL(value); } catch { throw new Error(code); }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname) ||
      /[?&](token|api_key|access_token|key)=/i.test(url.search)) throw new Error(code);
  return url;
}
