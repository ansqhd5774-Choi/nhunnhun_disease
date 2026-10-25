const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const unnumber = value => normalize(value).replace(/^\d{1,2}\.\s+/, '');
const withoutInjectedAdLabel = value => String(value ?? '').split(/\r?\n/).filter(line => normalize(line) !== '광고').join('\n');

// The public Tistory skin can inject an isolated "광고" label between article blocks.
// Ignore that label only on the live/public side; source prose remains exact.
// The reading skin can also alter an H2 numbering decoration. No other prose or quantity may differ.
export function publicBodiesMatch(actual, expected) {
  if (normalize(withoutInjectedAdLabel(actual?.text)) === normalize(expected?.text)) return true;
  if (!Array.isArray(actual?.headings) || !Array.isArray(expected?.headings) ||
      !actual.headings.length || actual.headings.length !== expected.headings.length) return false;
  const a = actual.headings.map(normalize), e = expected.headings.map(normalize);
  const bases = e.map(unnumber);
  if (new Set(bases).size !== bases.length || a.some((h,i) => unnumber(h) !== bases[i])) return false;
  if (!a.some((h,i) => h !== e[i])) return false;
  function canonical(snapshot, headings, publicSide=false) {
    const lines = String(snapshot.text ?? '').split(/\r?\n/).filter(line => !publicSide || normalize(line) !== '광고');
    for (const heading of headings) {
      // Ambiguous body lines that repeat the heading cannot use this exception.
      if (lines.filter(line => normalize(line) === heading).length !== 1) return null;
    }
    const replacements = new Map(headings.map((h,i) => [h,bases[i]]));
    return normalize(lines.map(line => replacements.get(normalize(line)) ?? line).join('\n'));
  }
  const left = canonical(actual,a,true), right = canonical(expected,e,false);
  return left !== null && right !== null && left === right;
}
