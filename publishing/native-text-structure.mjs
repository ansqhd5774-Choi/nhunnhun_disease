import {parseDocument,DomUtils} from 'htmlparser2';
import {publicAssetIdentity} from './alt-macro-contract.mjs';
import {maintenanceHash} from './alt-maintenance-contract.mjs';

// Ignore only an image source's signed transport query. Every other attribute,
// non-image URL, style and structural node remains in the structural proof.
export function nativeTextStructureHash(html){
  const doc=parseDocument(html);
  for(const image of DomUtils.findAll(n=>n.name==='img',doc.children)){
    if(typeof image.attribs?.src!=='string')throw Error('E_TEXT_PUBLIC_IMAGE_SOURCE');
    image.attribs.src=publicAssetIdentity(image.attribs.src);
  }
  return maintenanceHash(DomUtils.getInnerHTML(doc));
}
