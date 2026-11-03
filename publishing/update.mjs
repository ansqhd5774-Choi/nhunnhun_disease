import {assertSelectedSource} from './repository-scope.mjs';
import {assertWriterLease} from './writer-lock.mjs';
import {assertDirectPreflight} from './direct-preflight.mjs';
import {isNativeTextMaintenance} from './native-text-contract.mjs';
import {runNativeTextMaintenance} from './native-text-runner.mjs';
import {captureNativeTextBaseline} from './native-text-public.mjs';
import {observeUpdateStage} from './update-observation.mjs';
import {selectEditorMode,probeManagedPost} from './update-editor-controls.mjs';
import { assertContentStandard } from './content-standards.mjs';
import { isPublishedProductLinkRepair } from './validate-content.mjs';
import { assertCurrentSource } from './runner-gate.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BLOG } from './core.mjs';
import { localBrowserConfig, assertLocalGit, openEditorConnection, closeEditorConnection, freshEditorPage, ensureEditorRendering, installLightweightRouting } from './local-browser.mjs';
import { renderEditorialPost, assertEditorialContract, EDITORIAL_TEMPLATE_VERSION, editorialVersionFor } from './editorial.mjs';
import {restoreNativeImageFigures} from './native-image-attachments.mjs';
import {assertLegacyRepairBaseline} from './reflow-existing-native.mjs';
import {installNativeReflowSubmitGuard} from './native-reflow-submit-guard.mjs';
import { loadUpdates, eligibleUpdate, updateFingerprint } from './update-core.mjs';
import { UpdateLedger } from './update-ledger.mjs';
import { assertImageReview } from './image-review.mjs';
import {finalizeSelectedUpdate} from './finalize-update.mjs';
import { preparePublishEditor, openPublishDialog } from './publish-dialog.mjs';
import {isAltMaintenance} from './alt-maintenance-source.mjs';
import {runAltMaintenance} from './alt-maintenance-runner.mjs';
import {captureAltBaseline} from './alt-maintenance-public.mjs';
import {openPublicBrowser} from './local-browser.mjs';

async function focusBasicImageInsertionTarget(page){
  for(const frame of page.frames()){
    const editor=frame.locator('[contenteditable="true"]').first();
    if(await editor.count()&&await editor.isVisible().catch(()=>false)){
      await editor.focus();
      await editor.press('ControlOrMeta+End');
      return;
    }
  }
  const report=[];
  for(const frame of page.frames()){
    report.push(await frame.evaluate(()=>({
      editable:document.querySelectorAll('[contenteditable]').length,
      iframe:document.querySelectorAll('iframe').length,
      bodyEditable:document.body?.getAttribute('contenteditable')??null
    })).catch(()=>({unavailable:true})));
  }
  console.log('UPDATE_BASIC_IMAGE_TARGET_PROBE '+JSON.stringify(report));
  throw new Error('E_UPDATE_IMAGE_EDITOR_FOCUS');
}

async function captureBasicModeImageFigures(page,imageMap){
  const paths=[...imageMap.values()].map(url=>new URL(url).pathname);
  let last={frames:0,figures:0,matched:0};
  for(let attempt=0;attempt<12;attempt++){
    const frames=page.frames();
    const parts=[];
    let figures=0;
    for(const frame of frames){
      const markup=await frame.evaluate(()=>{
        return [...document.querySelectorAll('figure')].filter(node=>
          node.querySelector('img')
        ).map(node=>node.outerHTML);
      }).catch(()=>[]);
      figures+=markup.length;
      parts.push(...markup);
    }
    const html=parts.join('\n');
    const matched=paths.filter(path=>html.includes(path)).length;
    last={frames:frames.length,figures,matched};
    if(matched===paths.length)return html;
    await page.waitForTimeout(400);
  }
  // Diagnostic metadata only: never print signed URLs or editor content.
  const frameStructure=[];
  for(const frame of page.frames()){
    frameStructure.push(await frame.evaluate(()=>({
      editable:document.querySelectorAll('[contenteditable]').length,
      image:document.querySelectorAll('img').length,
      figure:document.querySelectorAll('figure').length,
      bodyEditable:document.body?.getAttribute('contenteditable')??null
    })).catch(()=>({unavailable:true})));
  }
  console.log('UPDATE_NATIVE_IMAGE_PROBE '+JSON.stringify(last));
  console.log('UPDATE_NATIVE_FRAME_STRUCTURE '+JSON.stringify(frameStructure));
  throw new Error('E_UPDATE_IMAGE_NATIVE_FIGURE');
}

function imageSources(html){
  return [...html.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/gi)].map(m=>m[2]);
}
function imageRetryDelayMs(response,attempt){
  const retryAfter=(response.headers.get('retry-after')||'').trim();
  if(retryAfter){
    const seconds=Number(retryAfter);
    const ms=Number.isFinite(seconds)
      ? Math.max(0,seconds*1000)
      : Math.max(0,Date.parse(retryAfter)-Date.now());
    if(ms>120000) throw new Error('E_UPDATE_IMAGE_RATE_LIMIT_LONG');
    if(ms>0) return ms;
  }
  if(response.status===429||response.status===503) return Math.min(30000,5000*(2**attempt));
  return 500;
}
async function downloadImage(url,path){
  let last='';
  for(let attempt=0;attempt<4;attempt++){
    let response;
    try{
      response=await fetch(url,{
        headers:{
          'User-Agent':'NHUNNHUN-Tistory-Publisher/1.0 (https://nhunnhun.tistory.com/)',
          'Accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        },
        signal:AbortSignal.timeout(20000)
      });
    }catch(error){
      if(error?.name==='TimeoutError'||error?.name==='AbortError') throw new Error('E_UPDATE_IMAGE_DOWNLOAD_TIMEOUT');
      throw new Error('E_UPDATE_IMAGE_DOWNLOAD_NETWORK');
    }
    if(response.ok){
      const type=response.headers.get('content-type')??'';
      if(!type.toLowerCase().startsWith('image/')) throw new Error('E_UPDATE_IMAGE_CONTENT_TYPE');
      const bytes=Buffer.from(await response.arrayBuffer());
      if(!bytes.length || bytes.length>12*1024*1024) throw new Error('E_UPDATE_IMAGE_SIZE');
      await writeFile(path,bytes);
      return;
    }
    last=String(response.status);
    await new Promise(r=>setTimeout(r,imageRetryDelayMs(response,attempt)));
  }
  throw new Error('E_UPDATE_IMAGE_DOWNLOAD_'+last);
}
async function uploadImage(page,sourceUrl,index,tempDir){
  const originalName=decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop()||'');
  const ext=originalName.match(/\.(jpe?g|png|webp|gif)$/i)?.[1]?.toLowerCase();
  if(!ext)throw new Error('E_UPDATE_IMAGE_EXTENSION');
  const path=join(tempDir,`update-image-${index}.${ext==='jpeg'?'jpg':ext}`);
  let step='download';
  try{
    await downloadImage(sourceUrl,path);
    step='editor-focus';
    await focusBasicImageInsertionTarget(page);
    step='attach-menu';
    const menu=page.locator('div[aria-label="첨부"] button:visible, #attach-layer-btn:visible').first();
    if(await menu.count())await menu.click({timeout:10000});
    else{
      const opened=await page.evaluate(()=>{
        const trigger=document.querySelector('#attach-layer-btn')||
          document.querySelector('div[aria-label="첨부"] button');
        if(!trigger)return false;
        trigger.click();
        return true;
      });
      if(!opened)throw new Error('E_UPDATE_IMAGE_ATTACH_BUTTON');
    }
    step='input-probe';
    const input=page.locator('#attach-image');
    const inputCount=await input.count();
    if(inputCount===0){
      step='input-attach-wait';
      await input.waitFor({state:'attached',timeout:10000});
    }
    step='response-arm';
    const responsePromise=page.waitForResponse(res=>
      res.url().includes('/manage/post/attach.json') &&
      res.request().method()==='POST'
    ,{timeout:30000}).catch(()=>null);
    step='set-input';
    try{
      const pickerTypes=await input.evaluateAll(nodes=>nodes.map(node=>({
        tag:node.tagName.toLowerCase(),
        type:node.getAttribute('type'),
        visible:!!node.getClientRects().length
      })));
      console.log('UPDATE_NATIVE_PICKER_STRUCTURE '+JSON.stringify(pickerTypes));
      const visiblePicker=page.locator('#attach-image:visible').first();
      let set=false;
      if(await visiblePicker.count()){
        const chooserPromise=page.waitForEvent('filechooser',{timeout:8000}).catch(()=>null);
        await visiblePicker.click({timeout:8000});
        const chooser=await chooserPromise;
        if(chooser){
          await chooser.setFiles(path);
          set=true;
        }
      }
      if(!set){
        const actualFileInput=page.locator('#attach-image[type="file"]').first();
        if(!await actualFileInput.count())throw Error('E_UPDATE_IMAGE_INPUT');
        await actualFileInput.setInputFiles(path);
      }
    }catch{
      throw new Error('E_UPDATE_IMAGE_INPUT');
    }
    step='response-wait';
    let uploadResponse;
    try{
      uploadResponse=await responsePromise;
    }catch{
      throw new Error('E_UPDATE_IMAGE_RESPONSE_TIMEOUT');
    }
    step='response-status';
    if(uploadResponse.status()!==200){
      console.log('UPDATE_IMAGE_UPLOAD_HTTP_STATUS '+uploadResponse.status());
      throw new Error('E_UPDATE_IMAGE_UPLOAD_HTTP');
    }
    step='response-json';
    let data;
    try{
      data=await uploadResponse.json();
    }catch{
      throw new Error('E_UPDATE_IMAGE_UPLOAD_RESPONSE');
    }
    step='response-url';
    if(!data?.url || !data.url.includes('kakaocdn.net')) throw new Error('E_UPDATE_IMAGE_UPLOAD');
    return data.url;
  }catch(error){
    if(/^E_UPDATE_IMAGE_/.test(String(error?.message||''))) throw error;
    const code={
      download:'E_UPDATE_IMAGE_DOWNLOAD_UNEXPECTED',
      'editor-focus':'E_UPDATE_IMAGE_EDITOR_FOCUS',
      'attach-menu':'E_UPDATE_IMAGE_ATTACH_BUTTON',
      'input-probe':'E_UPDATE_IMAGE_INPUT_PROBE',
      'attach-button':'E_UPDATE_IMAGE_ATTACH_BUTTON',
      'input-attach-wait':'E_UPDATE_IMAGE_INPUT_ATTACH_WAIT',
      'response-arm':'E_UPDATE_IMAGE_RESPONSE_ARM',
      'set-input':'E_UPDATE_IMAGE_INPUT',
      'response-wait':'E_UPDATE_IMAGE_RESPONSE_TIMEOUT',
      'response-status':'E_UPDATE_IMAGE_UPLOAD_HTTP',
      'response-json':'E_UPDATE_IMAGE_UPLOAD_RESPONSE',
      'response-url':'E_UPDATE_IMAGE_UPLOAD'
    }[step]||'E_UPDATE_IMAGE_UNKNOWN';
    throw new Error(code);
  }
}
let editorConnection,editorContext,tempDir,editorPage;
let stage='configuration';
try{
  if(process.env.UPDATE_ENABLED!=='true'){
    console.log('UPDATE_DISABLED');
  }else{
    assertSelectedSource('updates',process.env.UPDATE_SOURCE_ID);
    await assertWriterLease();
    assertLocalGit();
    assertCurrentSource();
    const sourceId=process.env.UPDATE_SOURCE_ID;
    if(!sourceId)throw Error('E_UPDATE_TARGET_ID_REQUIRED');
    const ledger=new UpdateLedger();
    const queue=[];
    for(const update of await loadUpdates('updates',sourceId)){
      const state=await ledger.read(update.id);
      if(eligibleUpdate(update,state)) {
        assertDirectPreflight(update);
        if(!isNativeTextMaintenance(update)&&!isAltMaintenance(update)&&update.contentStandard!=='SP1') {
          if(!isPublishedProductLinkRepair(update)) assertContentStandard(update);
          assertImageReview(update);
        }
        queue.push(update);
      }
    }
    console.log('UPDATE_SELECTION '+JSON.stringify({sourceId,count:queue.length}));
    if(queue.length>1) throw new Error('E_ONE_UPDATE_PER_RUN');
    if(!queue.length){
      console.log('NO_PENDING_UPDATES');
    }else{
      const update=queue[0];
      const fingerprint=updateFingerprint(update);
      const browserConfig=await localBrowserConfig();
      editorConnection=await openEditorConnection(browserConfig);
      editorContext=editorConnection.context;
      tempDir=await mkdtemp(join(tmpdir(),'tistory-update-'));
      let page=await freshEditorPage(editorContext);
      editorPage=page;
      const viewportSession=await ensureEditorRendering(editorContext,page);
      await viewportSession.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await installLightweightRouting(page);
      page.setDefaultTimeout(25000);
      page.on('dialog',d=>{void (async()=>{try{if(d.type()==='confirm') await d.accept(); else await d.dismiss();}catch(error){const message=String(error?.message||error||'');if(!/No dialog is showing|Target page, context or browser has been closed|Browser has been closed/i.test(message)) console.error('E_UPDATE_DIALOG_HANDLER');}})();});

      stage='target-probe';
      await probeManagedPost(page,update);

      stage='editor-open';
      try{
        const editorUrl=new URL(page.url());
        if(editorUrl.origin!==BLOG||editorUrl.pathname!==`/manage/newpost/${update.articleId}`){
          await page.goto(`${BLOG}/manage/newpost/${update.articleId}`,{waitUntil:'domcontentloaded'});
        }
      }catch(error){
        const cause=String(error?.message||'').replace(new RegExp('https?:'+'/'+'/'+'[^ ]+','g'),'[URL]').slice(0,350);
        console.error('UPDATE_EDITOR_OPEN_CAUSE '+JSON.stringify({type:error?.name||'Error',message:cause,path:new URL(page.url()).pathname}));
        throw Object.assign(new Error('E_UPDATE_EDITOR_OPEN_NAVIGATION'),{cause:error});
      }
      if(new URL(page.url()).origin!==BLOG) throw new Error('E_LOGIN_REQUIRED');
      await page.locator('#post-title-inp').waitFor({state:'visible',timeout:15000}).catch(()=>{
        console.log('UPDATE_EDITOR_OPEN_STATE '+JSON.stringify({articleId:update.articleId,path:new URL(page.url()).pathname}));
        throw new Error('E_UPDATE_EDITOR_OPEN_TITLE');
      });
      const currentTitle=(await page.locator('#post-title-inp').inputValue()).trim();
      if(currentTitle!==update.expectedCurrentTitle) throw new Error('E_UPDATE_CURRENT_TITLE_MISMATCH');

      stage='original-mode-menu';
      await selectEditorMode(page,'html');
      stage='original-codemirror-wait';
      const cm=page.locator('.CodeMirror:visible');
      await cm.waitFor({state:'visible',timeout:10000}).catch(error=>{throw Object.assign(Error('E_UPDATE_CODEMIRROR_WAIT'),{cause:error});});
      stage='original-codemirror-read';
      const originalHtml=await cm.evaluate(el=>el?.CodeMirror?.getValue?.()||'').catch(error=>{throw Object.assign(Error('E_UPDATE_CODEMIRROR_READ'),{cause:error});});
      if(!originalHtml.trim()) throw new Error('E_UPDATE_ORIGINAL_EMPTY');

      stage='restore-basic-select';
      await selectEditorMode(page,'basic');
      stage='restore-basic-ready';
      await page.locator('#attach-image, #attach-layer-btn').first().waitFor({state:'attached',timeout:15000});

      if(isNativeTextMaintenance(update)){
        stage='native-text-maintenance';
        const publicResult=await runNativeTextMaintenance({page,source:update,originalHtml,selectMode:selectEditorMode,ledger,assertSource:assertCurrentSource,
          capturePublicBaseline:async(html,source,metadata)=>{const anonymous=await openPublicBrowser(browserConfig);try{return await captureNativeTextBaseline(anonymous,html,source,metadata);}finally{await anonymous.close();}},finalize:finalizeSelectedUpdate});
        console.log('UPDATE_PUBLIC_RESULT '+JSON.stringify(publicResult));if(publicResult.status!=='PUBLIC_VERIFIED')process.exitCode=1;
      }else if(isAltMaintenance(update)){
        stage='alt-only-maintenance';
        const publicResult=await runAltMaintenance({page,source:update,originalHtml,selectMode:selectEditorMode,ledger,assertSource:assertCurrentSource,
          capturePublicBaseline:async(html,source,metadata)=>{
            const anonymous=await observeUpdateStage('alt-anonymous-launch',()=>openPublicBrowser(browserConfig));
            try{return await captureAltBaseline(anonymous,html,source,metadata);}finally{await observeUpdateStage('alt-anonymous-close',()=>anonymous.close());}
          },finalize:finalizeSelectedUpdate});
        console.log('UPDATE_PUBLIC_RESULT '+JSON.stringify(publicResult));
        if(publicResult.status!=='PUBLIC_VERIFIED')process.exitCode=1;
      }else{
      stage='render-update';
      const rendered=renderEditorialPost(update);
      const sources=[...new Set(imageSources(rendered))];
      if(update.nativeReflow){
        stage='verify-legacy-photo-baseline';
        assertLegacyRepairBaseline(originalHtml,update.nativeReflow,update.imageReview);
      }
      const imageMap=new Map();
      for(let i=0;i<sources.length;i++){
        stage=`image-upload-${i+1}`;
        imageMap.set(sources[i],await uploadImage(page,sources[i],i,tempDir));
        if(i===0)await captureBasicModeImageFigures(page,imageMap);
      }
      stage='stage-content';
      const editorWithAttachments=await captureBasicModeImageFigures(page,imageMap);
      const targetHtml=restoreNativeImageFigures(rendered,imageMap,update.representativeImageUrl,editorWithAttachments);
      assertEditorialContract(targetHtml,update.bodyHtml,{version:editorialVersionFor(update)});
      if(update.nativeReflow){
        // For this opt-in photo repair, try the active rich editor.
        // CodeMirror edits alone left the old seven-image HTML in Tistory PUT;
        // the outbound guard still decides whether this alternative is safe.
        stage='stage-native-rich-editor';
        const probe=await page.evaluate(html=>{
          const editor=window.tinymce?.get?.('editor-tistory')||window.tinyMCE?.get?.('editor-tistory');
          if(!editor||typeof editor.setContent!=='function'||typeof editor.getContent!=='function')return {available:false};
          editor.setContent(html);
          editor.fire?.('change');
          editor.fire?.('input');
          editor.save?.();
          const value=editor.getContent();
          const raw=editor.getContent({format:'raw'});
          const dom=editor.getBody?.()?.innerHTML||'';
          return {available:true,length:value.length,images:(value.match(/<img\b/gi)||[]).length,
            figures:(value.match(/<figure\b/gi)||[]).length,
            rawImages:(raw.match(/<img\b/gi)||[]).length,
            rawFigures:(raw.match(/<figure\b/gi)||[]).length,
            domImages:(dom.match(/<img\b/gi)||[]).length,
            domFigures:(dom.match(/<figure\b/gi)||[]).length};
        },targetHtml);
        if(!probe.available)throw Error('E_NATIVE_REFLOW_RICH_EDITOR_UNAVAILABLE');
        console.log('UPDATE_NATIVE_RICH_EDITOR_PROBE '+JSON.stringify(probe));
        if(probe.images!==sources.length||probe.figures!==sources.length)
          throw Error('E_NATIVE_REFLOW_RICH_EDITOR_SHAPE');
        console.log('UPDATE_NATIVE_REFLOW_STAGED '+JSON.stringify({...probe,outboundGuard:'required'}));
      } else {
        await selectEditorMode(page,'html');
        const cm=page.locator('.CodeMirror:visible');
        await cm.waitFor({state:'visible'});
        const staged=await cm.evaluate((el,html)=>{
          const editor=el?.CodeMirror;
          if(typeof editor?.setValue!=='function')return null;
          editor.setValue(html);
          editor.save?.();
          return editor.getValue();
        },targetHtml);
        if(staged!==targetHtml)throw Error('E_UPDATE_CODEMIRROR_STAGE_EXACT');
      }

      stage='publish-editor-ready';
      await preparePublishEditor(page,{title:update.title});
      stage='publish-dialog';
      await openPublishDialog(page,{title:update.title},console.log,'E_UPDATE_PUBLISH_DIALOG');
      if(update.representativeImageUrl){
      const thumb=page.locator('.publish_editor .box_thumb');
      if(await thumb.count()!==1) throw new Error('E_UPDATE_REPRESENTATIVE_UNVERIFIED');
      const deleteRepresentative=thumb.locator('button.ico_delete, button.mce-ico.ico_delete');
      if(await deleteRepresentative.count()){
        stage='representative-remove';
        await deleteRepresentative.first().evaluate(el=>el.click()).catch(()=>{throw Error('E_UPDATE_REPRESENTATIVE_REMOVE');});
        await page.waitForFunction(()=>{
          const box=document.querySelector('.publish_editor .box_thumb');
          return !!box && ((box.textContent||'').includes('대표이미지 추가') || !!box.querySelector('input[type="file"]'));
        },null,{timeout:10000});
      }
      stage='representative-upload';
      const repPath=join(tempDir,'update-representative.bin');
      await downloadImage(update.representativeImageUrl,repPath);
      const repInput=thumb.locator('input[type="file"]');
      if(await repInput.count()!==1) throw new Error('E_UPDATE_REPRESENTATIVE_UNVERIFIED');
      await repInput.setInputFiles(repPath);
      await page.waitForFunction(()=>{
        const box=document.querySelector('.publish_editor .box_thumb');
        if(!box) return false;
        const text=(box.textContent||'').trim();
        return !text.includes('대표이미지 추가');
      },null,{timeout:10000});
      if((await thumb.innerText().catch(()=>''))?.includes('대표이미지 추가')) throw new Error('E_UPDATE_REPRESENTATIVE_UNVERIFIED');

      }
      stage='submit-control';
      let submit=null;
      for(const name of ['변경사항 저장','수정','완료','공개 발행']){
        const button=page.getByRole('button',{name,exact:true}).and(page.locator('button:visible'));
        if(await button.count()){submit=button.last();break;}
      }
      if(!submit) throw new Error('E_UPDATE_SUBMIT_CONTROL');

      const sourceCommit = assertCurrentSource();

      // Require Tistory's actual outbound content to equal the repaired body.
      // Incorrect outbound requests are aborted before reaching the server.
      const submitGuard=update.nativeReflow
        ? await installNativeReflowSubmitGuard(page,targetHtml)
        : null;

      await ledger.write(update.id,{
        phase:'submitting',fingerprint,url:update.targetUrl,articleId:update.articleId,
        sourceCommit,editorialTemplateVersion:EDITORIAL_TEMPLATE_VERSION,timestamp:new Date().toISOString(),
        runUrl:process.env.GITHUB_RUN_ID?`https://github.com/ansqhd5774-Choi/nhunnhun_disease/actions/runs/${process.env.GITHUB_RUN_ID}`:null
      });

      stage='final-submit';
      await submit.click();
      if(submitGuard){
        stage='verify-native-reflow-outbound';
        await submitGuard.assertObserved();
        console.log('UPDATE_NATIVE_REFLOW_OUTBOUND_VERIFIED');
      }
      console.log('SUBMIT_CLICKED: '+update.id+' '+update.targetUrl);
      stage='public-verification';
      const publicResult=await finalizeSelectedUpdate(update.id);
      console.log('UPDATE_PUBLIC_RESULT '+JSON.stringify(publicResult));
      if(publicResult.status!=='PUBLIC_VERIFIED')process.exitCode=1;
      }
    }
  }
}catch(error){
  const code=/^(?:E_[A-Z0-9_]+|BLOCKED_SOURCE_DRIFT)$/.test(error?.message??'')?error.message:'E_UPDATE_RUNTIME';
  console.error('UPDATE_DIAGNOSTIC: '+stage+' '+code);
  const originalError=error?.cause??error;
  console.error('UPDATE_EXCEPTION '+JSON.stringify({details:error?.details??null,stage,type:originalError?.name??'Error',timeout:/timeout/i.test(originalError?.message??''),strictLocator:/strict mode violation/i.test(originalError?.message??''),targetClosed:/closed/i.test(originalError?.message??'')}));
  if(editorPage) {
    const snapshot=await Promise.race([editorPage.evaluate(()=>({path:location.pathname,mode:document.querySelector('#editor-mode-layer-btn-open')?.textContent?.trim(),editors:[...document.querySelectorAll('.CodeMirror')].map(el=>({visible:!!(el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'),api:typeof el.CodeMirror?.getValue==='function'}))})).catch(()=>null),new Promise(resolve=>setTimeout(()=>resolve(null),1500))]);
    console.error('UPDATE_EDITOR_STATE '+JSON.stringify(snapshot));
  }
  console.error('STOP: 기존 글 수정 결과가 불명확하면 자동 재수정하지 않습니다.');
  process.exitCode=1;
}finally{
  if(editorPage){
    try{await editorPage.unrouteAll({behavior:'ignoreErrors'});}
    catch{console.error('E_UPDATE_ROUTING_CLEANUP');process.exitCode=1;}
  }
  try{await closeEditorConnection(editorConnection);}catch{console.error('E_UPDATE_BROWSER_DISCONNECT');process.exitCode=1;}
  if(tempDir) try{await rm(tempDir,{recursive:true,force:true});}catch{console.error('E_UPDATE_TEMP_CLEANUP');process.exitCode=1;}
  const finalExitCode=process.exitCode||0;
  setTimeout(()=>process.exit(finalExitCode),0);
}


