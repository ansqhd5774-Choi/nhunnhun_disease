import {isNativeTextMaintenance,checkNativeTextSource} from '../publishing/native-text-contract.mjs';
import {readFileSync} from 'node:fs';
import {prepareDirectSource} from './prepare-direct-source.mjs';
import {assertDirectPreflight} from '../publishing/direct-preflight.mjs';
import {hasAuthoritativePreflight} from '../publishing/direct-authoring-contract.mjs';
import {isAltMaintenance,checkAltSource} from '../publishing/alt-maintenance-source.mjs';
import {confirmGithubSource} from './source-confirmation.mjs';

// Source preparation reports emphasis/image metadata. Reuse a prior preflight only
// when the workflow explicitly proves it was run for this exact GITHUB_SHA.
const kind=process.argv[2];
const id=process.env.UPDATE_SOURCE_ID||process.env.PUBLISH_SOURCE_ID;
if(!['posts','updates'].includes(kind)||!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id||''))throw Error('E_PREPARATION_TARGET');
const source=JSON.parse(readFileSync(`${kind}/${id}.json`,'utf8'));
if(kind==='updates'&&isNativeTextMaintenance(source)){checkNativeTextSource(source,source.id+'.json');console.log('SOURCE_PREPARATION_MAINTENANCE '+JSON.stringify({id,scope:'native-text-and-explicit-title-only',semanticVerification:'specific-identity-correction-author-reviewed'}));
}else if(kind==='updates'&&isAltMaintenance(source)){
  checkAltSource(source,`${id}.json`);
  console.log('SOURCE_PREPARATION_MAINTENANCE '+JSON.stringify({id,scope:'image-alt-only',semanticVerification:'existing-content-not-recertified'}));
}else if(source.contentStandard==='SP1'&&source.id.startsWith('direct-')) {
  if(process.env.GITHUB_ACTIONS==='true')console.log('SOURCE_CONFIRMED '+JSON.stringify(await confirmGithubSource({kind,source,commitSha:process.env.GITHUB_SHA,token:process.env.GITHUB_TOKEN})));
  const reused=hasAuthoritativePreflight();
  if(!reused)assertDirectPreflight(source);
  const {report}=prepareDirectSource(source);
  console.log('SOURCE_PREPARATION '+JSON.stringify({...report,preflight:reused?'reused-authoritative-ci':'validated-locally',semanticVerification:'author-review-not-automated'}));
} else console.log('SOURCE_PREPARATION_EXISTING_STANDARD '+id);
