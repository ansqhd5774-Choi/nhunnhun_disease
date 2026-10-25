export function normalizePublicTitle(value) {
  return String(value || '').normalize('NFC').replace(/[\s｜|]+/g,'').trim();
}
export function assertPublicTitle(snapshot, expected) {
  const title=normalizePublicTitle(expected);
  if(!title || normalizePublicTitle(snapshot.heading)!==title) throw new Error('E_PUBLIC_TITLE_MISMATCH');
  if(normalizePublicTitle(snapshot.og)!==title) throw new Error('E_PUBLIC_TITLE_METADATA_MISMATCH');
}
