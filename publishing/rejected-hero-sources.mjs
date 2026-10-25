// Manually curated after actual visual inspection. This is not an AI/semantic gate.
// Only sources that were explicitly judged unsuitable as a representative/hero image belong here.
export const REJECTED_HERO_SOURCE_PAGES=new Set([
  'https://commons.wikimedia.org/wiki/File:Beef_liver_nicely_cooked_at_Phakwe_Cattle_post.jpg',
  'https://commons.wikimedia.org/wiki/File:Macae2.JPG',
  'https://commons.wikimedia.org/wiki/File:Beta-alaniini_kristallid_polariseeritud_valguses.jpg'
]);

export function isRejectedHeroSource(sourcePage){
  return REJECTED_HERO_SOURCE_PAGES.has(String(sourcePage??'').trim());
}
