import {assertDirectPreflight} from './direct-preflight.mjs';
import {isNativeTextMaintenance} from './native-text-contract.mjs';
import { assertContentStandard } from './content-standards.mjs';
import { loadUpdates } from './update-core.mjs';
import { renderEditorialPost, EDITORIAL_TEMPLATE_VERSION } from './editorial.mjs';
import { assertImageReview } from './image-review.mjs';
import {isAltMaintenance} from './alt-maintenance-source.mjs';

try{
  const updates=await loadUpdates('updates',process.env.UPDATE_SOURCE_ID || null);
  for(const update of updates){
    if(isNativeTextMaintenance(update)){console.log('PASS_NATIVE_TEXT_SOURCE: '+update.id+'; exact runtime preconditions required');continue;}
    if(isAltMaintenance(update)){
      console.log('PASS_ALT_MAINTENANCE_SOURCE: '+update.id+'; runtime preconditions required; existing content not recertified');
      continue;
    }
    if(update.contentStandard==='SP1') {
      assertDirectPreflight(update);
      console.log(`PASS_DIRECT_PREFLIGHT: ${update.id}`);
      continue;
    }
    if(update.contentStandard!==undefined) assertContentStandard(update,{enforceScanDensity:false});
    if(update.imageReview) assertImageReview(update);
    renderEditorialPost(update);
  }
  console.log(`PASS_UPDATE_SOURCE: ${updates.length} updates validated; editorial=${EDITORIAL_TEMPLATE_VERSION}.`);
}catch(error){
  const code=/^E_[A-Z0-9_]+$/.test(error?.message??'')?error.message:'E_UPDATE_VALIDATE_RUNTIME';
  console.error('FAIL_UPDATE_SOURCE: '+code);
  process.exitCode=1;
}
