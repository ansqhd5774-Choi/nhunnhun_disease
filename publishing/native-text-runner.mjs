import {observeUpdateStage} from './update-observation.mjs';
import {applyNativeTextMaintenance,nativeTextFingerprint} from './native-text-contract.mjs';
import {cancelAltDialog,altDialogControl} from './alt-maintenance-dialog-controls.mjs';
import {maintenanceHash} from './alt-maintenance-contract.mjs';
import {observeAltMetadata} from './alt-maintenance-observe.mjs';

import {preparePublishEditor,openPublishDialog} from './publish-dialog.mjs';

// Existing update entry point supplies its source gate, editor mode and ledger.
// Changes declared native text slots and an explicit title; preserves all image macros and other metadata.
export async function runNativeTextMaintenance({page,source,originalHtml,selectMode,ledger,assertSource,
  capturePublicBaseline,finalize,log=console.log,
  prepare=preparePublishEditor,open=openPublishDialog,observe=observeAltMetadata,cancel=cancelAltDialog,control=altDialogControl}){
  if(await ledger.read(source.id))throw Error('E_UPDATE_EXISTING_STATE_REQUIRES_REVIEW');
  if(maintenanceHash(originalHtml)!==source.maintenance.expectedBodySha256)throw Error('E_TEXT_BODY_DRIFT');
  await prepare(page,{title:source.expectedCurrentTitle});
  await open(page,{title:source.expectedCurrentTitle},log,'E_TEXT_DIALOG',{clickTimeoutMs:25000,observe:(stage,action,options)=>observeUpdateStage(stage,action,{...options,log})});
  const before=await observeUpdateStage('text-metadata-before',()=>observe(page),{log,safeReadOnly:true,timeoutMs:15000});
  // Only existing public articles are in scope. Protected/private never become public.
  if(before.metadata.visibility!=='20')throw Error('E_ALT_PUBLIC_VISIBILITY_REQUIRED');

  await observeUpdateStage('text-dialog-cancel',()=>cancel(page,{observe:(stage,action,options)=>observeUpdateStage(stage,action,{...options,log})}),{log});
  // Anonymous baseline is collected before any content staging, not inferred from HTTP 200.
  const baseline=await observeUpdateStage('text-public-baseline',()=>capturePublicBaseline(originalHtml,source,before.metadata),{log});
  const changed=applyNativeTextMaintenance(originalHtml,before.metadata,source.maintenance,baseline.assetMapping);
  await selectMode(page,'html');
  const code=page.locator('.CodeMirror:visible .CodeMirror-code');
  await code.waitFor({state:'visible'});
  // Re-check the actual mode serialization immediately before any input.
  const currentHtml=await page.locator('.CodeMirror:visible').evaluate(el=>el?.CodeMirror?.getValue?.()||'');
  if(maintenanceHash(currentHtml)!==source.maintenance.expectedBodySha256)throw Error('E_TEXT_PRESTAGE_BODY_DRIFT');
  await code.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(changed.targetHtml);
  const staged=await page.locator('.CodeMirror:visible').evaluate(el=>el?.CodeMirror?.getValue?.()||'');
  if(maintenanceHash(staged)!==changed.targetBodySha256)throw Error('E_TEXT_STAGED_BODY_DRIFT');
  await page.locator('#post-title-inp').fill(source.title);
  await prepare(page,{title:source.title});
  await open(page,{title:source.title},log,'E_TEXT_DIALOG');
  const after=await observeUpdateStage('text-metadata-after',()=>observe(page),{log,safeReadOnly:true,timeoutMs:15000});
  if(after.metadata.title!==source.title||JSON.stringify({...after.metadata,title:before.metadata.title})!==JSON.stringify(before.metadata))throw Error('E_TEXT_METADATA_DRIFT');
  const submit=await control(page,'submit');
  const sourceCommit=assertSource();
  // Re-read immediately before checkpoint; no re-submit when a previous run exists.
  if(await ledger.read(source.id))throw Error('E_UPDATE_EXISTING_STATE_REQUIRES_REVIEW');
  await ledger.write(source.id,{phase:'submitting',operation:source.operation,fingerprint:nativeTextFingerprint(source),
    url:source.targetUrl,articleId:source.articleId,sourceCommit,baseline,
    originalBodySha256:changed.originalBodySha256,targetBodySha256:changed.targetBodySha256,
    originalMetadataSha256:source.maintenance.expectedMetadataSha256,metadataSha256:after.sha256,expectedPublicTextSha256:source.maintenance.targetPublicTextSha256,timestamp:new Date().toISOString(),semanticVerification:'specific-identity-correction-author-reviewed'});
  // Exactly one final submit. Exceptions leave submitting for read-only recovery.
  await submit.click();
  log('SUBMIT_CLICKED: '+source.id+' '+source.targetUrl);
  return finalize(source.id);
}
