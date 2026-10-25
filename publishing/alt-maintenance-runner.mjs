import {observeUpdateStage} from './update-observation.mjs';
import {ALT_MACRO_OPERATION} from './alt-macro-contract.mjs';
import {applyMappedImageGridAlt as applyMappedMacroAlt} from './alt-image-grid-contract.mjs';
import {cancelAltDialog,altDialogControl} from './alt-maintenance-dialog-controls.mjs';
import {applyAltMaintenance,maintenanceHash} from './alt-maintenance-contract.mjs';
import {observeAltMetadata,assertObservedMetadataPreserved} from './alt-maintenance-observe.mjs';
import {altFingerprint} from './alt-maintenance-source.mjs';
import {preparePublishEditor,openPublishDialog} from './publish-dialog.mjs';

// Existing update entry point supplies its source gate, editor mode and ledger.
// This operation never renders an article, uploads an image, or edits metadata.
export async function runAltMaintenance({page,source,originalHtml,selectMode,ledger,assertSource,
  capturePublicBaseline,finalize,log=console.log,
  prepare=preparePublishEditor,open=openPublishDialog,observe=observeAltMetadata}){
  if(await ledger.read(source.id))throw Error('E_UPDATE_EXISTING_STATE_REQUIRES_REVIEW');
  await prepare(page,{title:source.title});
  await open(page,{title:source.title},log,'E_ALT_DIALOG',{clickTimeoutMs:25000,observe:(stage,action,options)=>observeUpdateStage(stage,action,{...options,log})});
  const before=await observeUpdateStage('alt-metadata-before',()=>observe(page),{log,safeReadOnly:true,timeoutMs:15000});
  // Only existing public articles are in scope. Protected/private never become public.
  if(before.metadata.visibility!=='20')throw Error('E_ALT_PUBLIC_VISIBILITY_REQUIRED');

  await observeUpdateStage('alt-dialog-cancel',()=>cancelAltDialog(page,{observe:(stage,action,options)=>observeUpdateStage(stage,action,{...options,log})}),{log});
  // Anonymous baseline is collected before any content staging, not inferred from HTTP 200.
  const baseline=await observeUpdateStage('alt-public-baseline',()=>capturePublicBaseline(originalHtml,source,before.metadata),{log});
  const changed=source.operation===ALT_MACRO_OPERATION?applyMappedMacroAlt(originalHtml,before.metadata,source.maintenance,baseline.macroMapping):applyAltMaintenance(originalHtml,before.metadata,source.maintenance);
  await selectMode(page,'html');
  const code=page.locator('.CodeMirror:visible .CodeMirror-code');
  await code.waitFor({state:'visible'});
  await code.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(changed.targetHtml);
  const staged=await page.locator('.CodeMirror:visible').evaluate(el=>el?.CodeMirror?.getValue?.()||'');
  if(maintenanceHash(staged)!==changed.targetBodySha256)throw Error('E_ALT_STAGED_BODY_DRIFT');
  await prepare(page,{title:source.title});
  await open(page,{title:source.title},log,'E_ALT_DIALOG');
  const after=await observeUpdateStage('alt-metadata-after',()=>observe(page),{log,safeReadOnly:true,timeoutMs:15000});
  assertObservedMetadataPreserved(before,after);
  const submit=await altDialogControl(page,'submit');
  const sourceCommit=assertSource();
  // Re-read immediately before checkpoint; no re-submit when a previous run exists.
  if(await ledger.read(source.id))throw Error('E_UPDATE_EXISTING_STATE_REQUIRES_REVIEW');
  await ledger.write(source.id,{phase:'submitting',operation:source.operation,fingerprint:altFingerprint(source),
    url:source.targetUrl,articleId:source.articleId,sourceCommit,baseline,
    originalBodySha256:changed.originalBodySha256,targetBodySha256:changed.targetBodySha256,
    metadataSha256:after.sha256,timestamp:new Date().toISOString(),semanticVerification:'alt-visual-review-only'});
  // Exactly one final submit. Exceptions leave submitting for read-only recovery.
  await submit.click();
  log('SUBMIT_CLICKED: '+source.id+' '+source.targetUrl);
  return finalize(source.id);
}
