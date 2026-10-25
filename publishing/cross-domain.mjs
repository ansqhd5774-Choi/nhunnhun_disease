import { DOMAINS } from './standards/common.mjs';
import { normalizeText, sectionByHeading } from './content-html.mjs';
export function checkCrossDomain(review, document, add) {
  const others = DOMAINS.filter(domain => domain !== review.domain);
  for (const domain of others) {
    const entry = review.connections?.[domain];
    if (!entry || !['included','not-applicable'].includes(entry.status) || normalizeText(entry.reason).length < 10) {
      add('E_CONTENT_CONNECTION', domain); continue;
    }
    if (entry.status === 'not-applicable') continue;
    const section = sectionByHeading(document, entry.heading);
    const quote = normalizeText(entry.answerQuote);
    if (!section || quote.length < 12 || !section.text.includes(quote)) add('E_CONTENT_CONNECTION_BODY', domain);
    if (!['supportive-food','nutrient-source','symptom-care','interaction','treatment-context','alternative','risk-context'].includes(entry.relationship)) add('E_CONTENT_CONNECTION_TYPE', domain);
    if (!Array.isArray(entry.sourceIds) || !entry.sourceIds.length) add('E_CONTENT_CONNECTION_EVIDENCE', domain);
  }
  if (Object.keys(review.connections ?? {}).some(k => !others.includes(k))) add('E_CONTENT_CONNECTION_DOMAIN', 'connections');
}
