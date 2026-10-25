import {maintenanceHash} from './alt-maintenance-contract.mjs';

// Observational adapter. The caller opens/cancels the existing publication dialog.
// This module never changes editor content or clicks a submit control.
export async function observeAltMetadata(page) {
  const observed=await page.evaluate(()=>{
    const panels=[...document.querySelectorAll('.publish_editor')].filter(p=>p.getClientRects().length&&getComputedStyle(p).visibility!=='hidden');
    const title=document.querySelector('#post-title-inp');
    const category=document.querySelector('#category-btn .mce-txt');
    const labels=[...document.querySelectorAll('.txt_tag a[aria-label$=" 태그 수정"]')];
    const panel=panels.length===1?panels[0]:null;
    const boxes=panel?[...panel.querySelectorAll('.box_thumb')]:[];
    const thumbs=boxes.length===1?[...boxes[0].querySelectorAll('.thumb_g')]:[];
    const radios=panel?[...panel.querySelectorAll('input[type=radio][name=basicSet]')]:[];
    const checked=radios.filter(r=>r.checked);
    return {counts:{panels:panels.length,boxes:boxes.length,thumbs:thumbs.length,radios:radios.length,checked:checked.length,tags:labels.length},
      metadata:{title:title?.value??null,category:category?.textContent?.trim()??null,
        tags:labels.map(a=>a.getAttribute('aria-label').replace(/ 태그 수정$/,'')),
        representativeImage:thumbs.length===1?thumbs[0].getAttribute('style'):null,
        visibility:checked.length===1?checked[0].value:null}};
  });
  const c=observed?.counts,m=observed?.metadata;
  // Zero-tag and no-representative layouts have not yet been observed: stop that article only.
  if(!c||c.panels!==1||c.boxes!==1||c.thumbs!==1||c.radios!==3||c.checked!==1||c.tags<1||
    !m?.title||!m.category||!m.representativeImage||!m.representativeImage.includes('background-image:')||
    !['20','15','0'].includes(m.visibility)) throw Error('E_ALT_METADATA_OBSERVATION_UNCONFIRMED');
  return {metadata:m,sha256:maintenanceHash(JSON.stringify(m)),counts:c};
}
export function assertObservedMetadataPreserved(before,after) {
  if(!before?.sha256||before.sha256!==after?.sha256) throw Error('E_ALT_METADATA_DRIFT');
  return {preserved:true,semanticVerification:'metadata-observed-only'};
}
