import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {observeAltEditor} from './alt-maintenance-snapshot.mjs';
import {localBrowserConfig,assertLocalGit,openEditorConnection,closeEditorConnection,freshEditorPage,ensureEditorRendering,installLightweightRouting,openPublicBrowser} from './local-browser.mjs';
import {assertCurrentSource} from './runner-gate.mjs';
import {maintenanceHash as hash} from './alt-maintenance-contract.mjs';
import {checkNativeTextSource,nativePlainText,applyNativeTextMaintenance} from './native-text-contract.mjs';
import {captureNativeTextBaseline} from './native-text-public.mjs';
import {diagnoseNativeModeDifference} from './native-text-mode-diagnostic.mjs';

export const NATIVE_PREFLIGHT_IDS=['236','233','200'];
const safeCode=e=>/^E_[A-Z0-9_]+$/.test(e?.message||'')?e.message:'E_NATIVE_PREFLIGHT_OBSERVATION';
export function assertNativePreflightEnvironment(env){
 if(env.ALT_SNAPSHOT_READ_ONLY!=='true'||env.ALT_OBSERVATION_SCOPE!=='native-identity3'||env.GITHUB_ACTIONS!=='true'||env.GITHUB_REF!=='refs/heads/main'||env.UPDATE_ENABLED!=='false'||!/^\d+$/.test(env.GITHUB_RUN_ID||'')||!env.RUNNER_TEMP)throw Error('E_NATIVE_PREFLIGHT_READ_ONLY_GATE');
}
export async function inspectNativePreflight(source,observed,{captureBaseline}){
 const checks={source:'NOT_CHECKED',body:'NOT_CHECKED',metadata:'NOT_CHECKED',publicText:'NOT_CHECKED',assets:'NOT_CHECKED',targetDOM:'NOT_CHECKED'};
 const proof={};
 let stage='source';
 try{
  if(!NATIVE_PREFLIGHT_IDS.includes(source.articleId)||source.status!=='draft'||source.approved!==false)throw Error('E_NATIVE_PREFLIGHT_DRAFT_SCOPE');
  // Schema check only; this ephemeral copy is never passed to an update runner,
  // written as a source or approved for submission.
  checkNativeTextSource({...source,status:'ready',approved:true},source.id+'.json');checks.source='PASS';
  stage='body';proof.body={expected:source.maintenance.expectedBodySha256,actual:hash(observed.originalHtml),bytes:Buffer.byteLength(observed.originalHtml,'utf8')};if(proof.body.actual!==proof.body.expected)throw Error('E_TEXT_BODY_DRIFT');checks.body='PASS';
  stage='metadata';proof.metadata={expected:source.maintenance.expectedMetadataSha256,actual:hash(JSON.stringify(observed.metadata))};if(proof.metadata.actual!==proof.metadata.expected)throw Error('E_TEXT_METADATA_DRIFT');checks.metadata='PASS';
  stage='publicText';proof.publicText={expected:source.maintenance.expectedPublicTextSha256,actual:hash(nativePlainText(observed.originalHtml))};if(proof.publicText.actual!==proof.publicText.expected)throw Error('E_TEXT_EXPECTED_TEXT');checks.publicText='PASS';
  stage='publicBaseline';const baseline=await captureBaseline(observed.originalHtml,source,observed.metadata);checks.assets='PASS';checks.targetDOM='PASS';
  stage='exactDiff';applyNativeTextMaintenance(observed.originalHtml,observed.metadata,source.maintenance,baseline.assetMapping);
  return {articleId:source.articleId,sourceId:source.id,status:'PASS',checks,proof,readOnly:true,editorInputCount:0,finalSubmitCount:0};
 }catch(error){if(Object.hasOwn(checks,stage))checks[stage]='FAIL';return {articleId:NATIVE_PREFLIGHT_IDS.includes(source?.articleId)?source.articleId:'UNKNOWN',sourceId:/^[a-z0-9-]{3,80}$/.test(source?.id||'')?source.id:'UNKNOWN',status:'FAIL',stage,code:safeCode(error),checks,proof,readOnly:true,editorInputCount:0,finalSubmitCount:0};}
}
export async function runNativePreflight(env=process.env){
 assertNativePreflightEnvironment(env);assertLocalGit();assertCurrentSource();
 const directory=join(env.RUNNER_TEMP,`health-native-preflight-${env.GITHUB_RUN_ID}`);await mkdir(directory,{recursive:true});
 const records=[];let connection,config;
 try{
  config=await localBrowserConfig();connection=await openEditorConnection(config);
  for(const articleId of NATIVE_PREFLIGHT_IDS){let page;try{
   assertCurrentSource();const source=JSON.parse(await readFile(`docs/candidates/repair-native-identity-${articleId}-20261010.json`,'utf8'));
   page=await freshEditorPage(connection.context);await ensureEditorRendering(connection.context,page);await installLightweightRouting(page);
   page.on('dialog',d=>{void(d.type()==='confirm'?d.accept():d.dismiss()).catch(()=>{});});
   const observed=await observeAltEditor(page,{articleId},{progress:e=>console.log('NATIVE_PREFLIGHT_STAGE '+JSON.stringify({articleId,stage:e.stage,state:e.state}))});
   const result=await inspectNativePreflight(source,observed,{captureBaseline:async(html,s,metadata)=>{const browser=await openPublicBrowser(config);try{return await captureNativeTextBaseline(browser,html,s,metadata);}finally{await browser.close();}}});
   if(result.code==='E_TEXT_BODY_DRIFT'){
    try{if(!env.LOCALAPPDATA)throw Error('E_NATIVE_MODE_REFERENCE_DIRECTORY');const original=await readFile(join(env.LOCALAPPDATA,'NHUNNHUN','alt-snapshots',`${articleId}-editor-current.private.html`),'utf8');result.modeDiagnostic=diagnoseNativeModeDifference(original,observed.originalHtml,source);}
    catch(error){result.modeDiagnostic={status:'UNCONFIRMED',code:safeCode(error),publicationEnabled:false,sourceRewritten:false};}
   }
   records.push(result);
  }catch(error){records.push({articleId,status:'FAIL',stage:'observation',code:safeCode(error),readOnly:true,editorInputCount:0,finalSubmitCount:0});}
  finally{if(page)await page.close().catch(()=>{});}
  const summary={version:'native-preflight-v1',runId:env.GITHUB_RUN_ID,processedCount:records.length,complete:records.length===NATIVE_PREFLIGHT_IDS.length,readOnly:true,editorInputCount:0,finalSubmitCount:0,records};await writeFile(join(directory,'safe-results.json'),JSON.stringify(summary,null,2));console.log('NATIVE_PREFLIGHT_RESULT '+JSON.stringify(records.at(-1)));
  }
 }finally{await closeEditorConnection(connection);}
 assertCurrentSource();if(records.some(r=>r.status!=='PASS'))process.exitCode=1;
}
