import {cancelAltDialog} from './alt-maintenance-dialog-controls.mjs';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {randomBytes,createCipheriv} from 'node:crypto';
import {localBrowserConfig,assertLocalGit,openEditorConnection,closeEditorConnection,freshEditorPage,ensureEditorRendering,installLightweightRouting} from './local-browser.mjs';
import {assertCurrentSource} from './runner-gate.mjs';
import {selectEditorMode,probeManagedPost} from './update-editor-controls.mjs';
import {openPublishDialog} from './publish-dialog.mjs';
import {observeAltMetadata,assertObservedMetadataPreserved} from './alt-maintenance-observe.mjs';
import {ALT_OPERATION,maintenanceHash,applyAltMaintenance} from './alt-maintenance-contract.mjs';

// Six explicitly reviewed pictures; no generated descriptions or batch-wide inference.
export const ALT_VISUAL_PATCHES=[
  {articleId:'352',imageIndex:1,newAlt:'유리그릇에 담긴 노란색 소프트젤 캡슐'},
  {articleId:'276',imageIndex:7,newAlt:"Doctor's Best 라이코펜 10mg 보충제 제품 용기"},
  {articleId:'342',imageIndex:9,newAlt:'상품 수령 후 냉장 보관을 안내하는 파란색 표지'},
  {articleId:'334',imageIndex:4,newAlt:'수정체 제거와 인공수정체 삽입을 보여 주는 4단계 설명 그림'},
  {articleId:'332',imageIndex:7,newAlt:'치아씨드 제품 포장과 원재료·원산지·보관방법 표시 예시'},
  {articleId:'331',imageIndex:7,newAlt:'딸기와 블루베리, 견과류와 곡물을 올린 컵 디저트'}
];
export function draftAltSnapshot(originalHtml,metadata,patch){
  const images=[...originalHtml.matchAll(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)];
  const image=images[patch.imageIndex];
  if(!image)throw Error(/\[##_Image\|/.test(originalHtml)?'E_ALT_EDITOR_MACRO_UNSUPPORTED':'E_ALT_IMAGE_MISSING');
  const src=image[0].match(/\ssrc=(["'])(.*?)\1/i),alt=image[0].match(/\salt=(["'])(.*?)\1/i);
  if(!src)throw Error('E_ALT_IMAGE_MISSING');
  const maintenance={operation:ALT_OPERATION,articleId:patch.articleId,expectedTitle:metadata.title,
    expectedBodySha256:maintenanceHash(originalHtml),expectedMetadataSha256:maintenanceHash(JSON.stringify(metadata)),
    patches:[{imageIndex:patch.imageIndex,expectedSrcSha256:maintenanceHash(src[2]),expectedAltRaw:alt?.[2]??null,newAlt:patch.newAlt}]};
  // Apply only to an in-memory string to prove selection and exact diff; never stage.
  applyAltMaintenance(originalHtml,metadata,maintenance);
  return {id:`repair-alt-${patch.articleId}-20261010`,articleId:patch.articleId,targetUrl:`https://nhunnhun.tistory.com/${patch.articleId}`,
    expectedCurrentTitle:metadata.title,title:metadata.title,status:'draft',approved:false,operation:ALT_OPERATION,maintenance};
}

export async function observeAltEditor(page,patch,{selectMode=selectEditorMode,open=openPublishDialog,observe=observeAltMetadata,probe=probeManagedPost,progress=()=>{}}={}){
  const step=async(name,action)=>{progress({articleId:patch.articleId,stage:name,state:"start"});const result=await action();progress({articleId:patch.articleId,stage:name,state:"done"});return result;};
  await step('navigation',()=>page.goto(`https://nhunnhun.tistory.com/manage/newpost/${patch.articleId}`,{waitUntil:'domcontentloaded',timeout:30000}));
  const current=new URL(page.url());
  if(current.origin!=='https://nhunnhun.tistory.com'||current.pathname!==`/manage/newpost/${patch.articleId}`)throw Error('E_ALT_SNAPSHOT_TARGET');
  await page.locator('#post-title-inp').waitFor({state:'visible',timeout:15000});
  const title=await page.locator('#post-title-inp').inputValue();
  await step('managed-probe',()=>probe(page,{articleId:patch.articleId,title,expectedCurrentTitle:title}));
  await step('dialog-open',()=>open(page,{title},()=>{},'E_ALT_SNAPSHOT_DIALOG'));
  const before=await step('metadata-before',()=>observe(page));
  if(before.metadata.visibility!=='20')throw Error('E_ALT_PUBLIC_VISIBILITY_REQUIRED');
  await step('dialog-cancel',()=>cancelAltDialog(page));
  await step('mode-html',()=>selectMode(page,'html'));
  const originalHtml=await step('html-read',()=>page.locator('.CodeMirror:visible').evaluate(el=>el?.CodeMirror?.getValue?.()||''));
  progress({articleId:patch.articleId,stage:'html-shape',state:'done',nonempty:!!originalHtml.trim(),literalImgCount:(originalHtml.match(/<img\b/gi)||[]).length,imageMacroCount:(originalHtml.match(/\[##_Image\|/g)||[]).length});
  if(!originalHtml.trim())throw Error('E_UPDATE_ORIGINAL_EMPTY');
  await step('mode-basic',()=>selectMode(page,'basic'));
  await step('dialog-open',()=>open(page,{title},()=>{},'E_ALT_SNAPSHOT_DIALOG'));
  const after=await step('metadata-after',()=>observe(page));
  assertObservedMetadataPreserved(before,after);
  await step('dialog-cancel',()=>cancelAltDialog(page));
  return {originalHtml,metadata:before.metadata};
}
export function sealAltSnapshot(value,key=randomBytes(32),iv=randomBytes(12)){
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {key,encrypted:JSON.stringify({algorithm:'AES-256-GCM',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:bytes.toString('base64')})};
}
export async function writeAltObservationCheckpoint(directory,runId,records){
  const target=join(directory,'observation-checkpoint.private.json'),temporary=target+'.tmp';
  await writeFile(temporary,JSON.stringify({version:'alt-observation-checkpoint-v1',runId,readOnly:true,finalSubmitCount:0,complete:false,processedCount:records.length,records},null,2));
  await rename(temporary,target);
}
export async function runAltSnapshot(env=process.env){
  // Standard read-only workflow only. Never enable update or obtain a GitHub write token.
  if(env.ALT_SNAPSHOT_READ_ONLY!=='true'||env.GITHUB_ACTIONS!=='true'||env.GITHUB_REF!=='refs/heads/main'||env.UPDATE_ENABLED==='true'||!/^\d+$/.test(env.GITHUB_RUN_ID||''))throw Error('E_ALT_SNAPSHOT_READ_ONLY_GATE');
  assertLocalGit();assertCurrentSource();
  if(!env.LOCALAPPDATA||!env.RUNNER_TEMP)throw Error('E_ALT_SNAPSHOT_PRIVATE_DIRECTORY');
  const privateDirectory=join(env.LOCALAPPDATA,'NHUNNHUN','alt-snapshots',env.GITHUB_RUN_ID);
  const artifactDirectory=join(env.RUNNER_TEMP,`health-alt-snapshot-encrypted-${env.GITHUB_RUN_ID}`);
  await mkdir(privateDirectory,{recursive:true});await mkdir(artifactDirectory,{recursive:true});
  const records=[];let connection;
  try{
    connection=await openEditorConnection(await localBrowserConfig());
    for(const patch of ALT_VISUAL_PATCHES){
      let page;
      try{
        assertCurrentSource();page=await freshEditorPage(connection.context);
        await ensureEditorRendering(connection.context,page);await installLightweightRouting(page);
        page.on('dialog',d=>{void(d.type()==='confirm'?d.accept():d.dismiss()).catch(()=>{});});
        const observed=await observeAltEditor(page,patch,{progress:event=>console.log('ALT_SNAPSHOT_STAGE '+JSON.stringify(event))});
        // Raw editor HTML and signed representative URLs stay on this local runner only.
        await writeFile(join(privateDirectory,`${patch.articleId}.raw.private.json`),JSON.stringify(observed),{flag:'wx'});
        const draft=draftAltSnapshot(observed.originalHtml,observed.metadata,patch);
        records.push({articleId:patch.articleId,status:'DRAFT_CONDITIONS_CAPTURED',draft,license:'UNKNOWN',semanticVerification:'alt-visual-review-only'});
      }catch(error){records.push({articleId:patch.articleId,status:'OBSERVATION_UNCONFIRMED',code:/^E_[A-Z0-9_]+$/.test(error.message)?error.message:'E_ALT_SNAPSHOT_RUNTIME'});}
      finally{await writeAltObservationCheckpoint(privateDirectory,env.GITHUB_RUN_ID,records);if(page){console.log('ALT_SNAPSHOT_STAGE '+JSON.stringify({articleId:patch.articleId,stage:'page-close',state:'start'}));await page.close().catch(()=>{});console.log('ALT_SNAPSHOT_STAGE '+JSON.stringify({articleId:patch.articleId,stage:'page-close',state:'done'}));}}
    }
    assertCurrentSource();
    const snapshot={version:'alt-condition-snapshot-v1',runId:env.GITHUB_RUN_ID,readOnly:true,finalSubmitCount:0,records};
    await writeFile(join(privateDirectory,'conditions.private.json'),JSON.stringify(snapshot,null,2),{flag:'wx'});
    // Only ciphertext is uploaded, even when the GitHub repository is public.
    // The random decryption key is never logged or included in the artifact.
    const sealed=sealAltSnapshot(snapshot);
    await writeFile(join(privateDirectory,'artifact.key'),sealed.key,{flag:'wx'});
    await writeFile(join(artifactDirectory,'conditions.enc.json'),sealed.encrypted,{flag:'wx'});
    console.log('ALT_SNAPSHOT_READ_ONLY '+JSON.stringify({runId:env.GITHUB_RUN_ID,captured:records.filter(x=>x.status==='DRAFT_CONDITIONS_CAPTURED').length,unconfirmed:records.filter(x=>x.status!=='DRAFT_CONDITIONS_CAPTURED').length,finalSubmitCount:0,approved:false}));
  }finally{console.log('ALT_SNAPSHOT_STAGE '+JSON.stringify({stage:'connection-close',state:'start'}));await closeEditorConnection(connection);console.log('ALT_SNAPSHOT_STAGE '+JSON.stringify({stage:'connection-close',state:'done'}));}
}
// This dedicated read-only CLI owns only its Node process, never the managed Chrome.
// All private files and connection cleanup have been awaited before this boundary.
export function exitSnapshotCli(code){process.stdout.write('',()=>process.stderr.write('',()=>process.exit(code)));}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const failed=error=>{console.error(/^E_[A-Z0-9_]+$/.test(error.message)?error.message:'E_ALT_SNAPSHOT_RUNTIME');exitSnapshotCli(1);};
  if(process.env.ALT_OBSERVATION_SCOPE==='native-identity3')import('./native-text-preflight.mjs').then(m=>m.runNativePreflight()).then(()=>exitSnapshotCli(process.exitCode||0)).catch(failed);
  else runAltSnapshot().then(()=>exitSnapshotCli(0)).catch(failed);
}
