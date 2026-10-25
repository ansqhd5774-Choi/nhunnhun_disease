import {assertSelectedSource} from './repository-scope.mjs';
import {assertWriterLease} from './writer-lock.mjs';
import {assertDirectPreflight} from './direct-preflight.mjs';
import { verifyPublishedPublic } from './verify-published-public.mjs';
import { assertEmphasisContract } from './content-emphasis.mjs';
import { assertContentStandard } from './content-standards.mjs';
import { verificationContext } from './verification-context.mjs';
import { safeRuntimeDiagnostic, hasHumanVerificationFailure } from './runtime-diagnostics.mjs';
import { openHtmlMode } from './html-mode.mjs';
import { preparePublishEditor, openPublishDialog } from './publish-dialog.mjs';
import { assertCurrentSource } from './runner-gate.mjs';
import { localBrowserConfig, assertLocalGit, openEditorConnection, closeEditorConnection, openPublicBrowser, freshEditorPage, ensureEditorRendering, installLightweightRouting } from './local-browser.mjs';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BLOG, loadPosts, checkPublishHtml, eligible, fingerprint, assertArticleUrl } from './core.mjs';
import { Ledger } from './ledger.mjs';
import { renderEditorialPost, editorialExpectations, assertEditorialContract, EDITORIAL_TEMPLATE_VERSION, editorialVersionFor } from './editorial.mjs';
import { assertImageReview } from './image-review.mjs';
import { publishedUrls } from './published-url.mjs';
import { assertDirectPublicSnapshot } from './direct-public-contract.mjs';


function imageSources(html) {
  return [...html.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/gi)].map(m => m[2]);
}
async function downloadImage(url, path) {
  let last = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, {
      headers: {
        'User-Agent':'Mozilla/5.0',
        'Accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      signal:AbortSignal.timeout(20000),
    });
    if (response.ok) {
      const type = response.headers.get('content-type') ?? '';
      if (!type.toLowerCase().startsWith('image/')) throw new Error('E_IMAGE_CONTENT_TYPE');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error('E_IMAGE_SIZE');
      await writeFile(path, bytes);
      return;
    }
    last = String(response.status);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('E_IMAGE_DOWNLOAD_' + last);
}
async function uploadImage(page, sourceUrl, index) {
  const path = join(imageTempDir, `tistory-image-${index}.bin`);
  await downloadImage(sourceUrl, path);
  const input = page.locator('#attach-image');
  if (await input.count() === 0) {
    const opened = await page.evaluate(() => {
      const button = document.querySelectorAll('#attach-layer-btn')[0];
      if (!button) return false;
      button.click();
      return true;
    });
    if (!opened) throw new Error('E_IMAGE_ATTACH_BUTTON');
    await input.waitFor({state:'attached', timeout:10000});
  }
  const responsePromise = page.waitForResponse(res =>
    res.url().includes('/manage/post/attach.json') &&
    res.request().method() === 'POST'
  , {timeout:30000});
  try {
    await input.setInputFiles(path);
  } catch {
    throw new Error('E_IMAGE_INPUT');
  }
  let uploadResponse;
  try {
    uploadResponse = await responsePromise;
  } catch {
    throw new Error('E_IMAGE_RESPONSE_TIMEOUT');
  }
  if (uploadResponse.status() !== 200) throw new Error('E_IMAGE_UPLOAD_HTTP');
  let data;
  try {
    data = await uploadResponse.json();
  } catch {
    throw new Error('E_IMAGE_UPLOAD_RESPONSE');
  }
  if (!data?.url || !data.url.includes('kakaocdn.net')) throw new Error('E_IMAGE_UPLOAD');
  return data.url;
}
function replaceImageSources(html, mapping, representativeSource) {
  let first = true;
  return html.replace(/<img\b[^>]*>/gi, tag => {
    const match = tag.match(/\bsrc=(["'])(.*?)\1/i);
    if (!match) return tag;
    const source = match[2];
    const target = mapping.get(source);
    if (!target) throw new Error('E_IMAGE_MAPPING');
    let out = tag.replace(match[0], `src="${target}"`);
    out = out.replace(/\s(?:loading|decoding|fetchpriority)=(["']).*?\1/gi, '');
    const isPriority = source === representativeSource || first;
    out = out.replace(/>$/, ` loading="${isPriority ? 'eager' : 'lazy'}" decoding="async"${isPriority ? ' fetchpriority="high"' : ''}>`);
    first = false;
    return out;
  });
}

let editorConnection, editorContext, publicBrowser, editorPage, imageTempDir;
let finalSubmitDialogs = [];
let stage = 'configuration';
let fatalExitCode = 0;
try {
  if (process.env.PUBLISH_ENABLED !== 'true') {
    console.log('DISABLED: 발행 활성화 전에는 게시하지 않습니다.');
  } else {
    assertSelectedSource('posts',process.env.PUBLISH_SOURCE_ID);
    await assertWriterLease();
    assertLocalGit();
    assertCurrentSource();
    const ledger = new Ledger();
    const queue = [];
    for (const post of await loadPosts()) {
      const state = await ledger.read(post.id);
      if (eligible(post, state)) {
        checkPublishHtml(post);
        assertContentStandard(post);
        assertDirectPreflight(post);
        assertImageReview(post);
        queue.push({post, previousStateSha: state?.phase === 'failed' ? state.sha : undefined});
      }
    }
    if (queue.length > 1) throw new Error('E_ONE_POST_PER_RUN');
    if (queue.length) {
      const {post, previousStateSha} = queue[0];
      stage = 'local-browser';
      const browserConfig = await localBrowserConfig();
      editorConnection = await openEditorConnection(browserConfig);
      editorContext = editorConnection.context;
      imageTempDir = await mkdtemp(join(tmpdir(), 'tistory-images-'));
      stage = 'editor-open';
      const page = await freshEditorPage(editorContext);
      editorPage = page;
      await ensureEditorRendering(editorContext, page);
      await installLightweightRouting(page);
      page.setDefaultTimeout(20000);
      // The ordinary editor is used; no retired/undocumented Tistory write endpoint or cookie export.
      page.on('dialog', dialog => {
        void (async () => {
          try {
            const type = dialog.type();
            const message = dialog.message();
            console.log('DIALOG_DIAG '+JSON.stringify({stage,type,modeChange:/모드.*변경|변경.*모드/.test(message)}));
            if (type === 'confirm' && (stage === 'html-mode' || stage === 'final-submit' || /모드.*변경|변경.*모드/.test(message))) {
              await dialog.accept();
              console.log('DIALOG_ACTION '+JSON.stringify({stage,type,action:'accept'}));
            }
            else if (type === 'alert') await dialog.accept();
            else await dialog.dismiss();
          } catch (error) {
            const message = String(error?.message || error || '');
            if (/No dialog is showing/i.test(message)) console.error('DIALOG_ALREADY_HANDLED');
            if (!/No dialog is showing|Target page, context or browser has been closed|Browser has been closed/i.test(message)) {
              console.error('E_DIALOG_HANDLER');
            }
          }
        })();
      });
      stage = 'login-check';
      await page.goto(`${BLOG}/manage/posts`, {waitUntil:'domcontentloaded'});
      const managerUrl = new URL(page.url());
      if (managerUrl.origin !== BLOG || managerUrl.pathname !== '/manage/posts') throw new Error('E_LOGIN_REQUIRED');
      try {
        await page.getByRole('link', {name:'글쓰기', exact:true}).first().waitFor({state:'visible', timeout:15000});
      } catch {
        throw new Error('E_LOGIN_REQUIRED');
      }
      stage = 'editor-open';
      await page.goto(`${BLOG}/manage/post`, { waitUntil:'domcontentloaded' });
      if (new URL(page.url()).origin !== BLOG) throw new Error('E_LOGIN_REQUIRED');
      await page.locator('#post-title-inp').waitFor({state:'visible'});
      stage = 'editor-content';
      stage = 'image-upload';
      const editorialHtml = renderEditorialPost(post);
      const editorialExpected = editorialExpectations(post.bodyHtml,{version:editorialVersionFor(post)});
      const sources = [...new Set(imageSources(editorialHtml))];
      const representativeSource = post.representativeImageUrl || sources[0] || null;
      const uploadOrder = representativeSource ? [representativeSource, ...sources.filter(src => src !== representativeSource)] : sources;
      const imageMap = new Map();
      for (let i = 0; i < uploadOrder.length; i++) imageMap.set(uploadOrder[i], await uploadImage(page, uploadOrder[i], i));
      const bodyHtml = sources.length ? replaceImageSources(editorialHtml, imageMap, representativeSource) : editorialHtml;
      await openHtmlMode(page, value=>{ stage=value; });
      stage = 'html-body';
      await page.locator('.CodeMirror:visible .CodeMirror-code').click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(bodyHtml);
      const stagedHtml = await page.locator('.CodeMirror:visible').evaluate(el=>el?.CodeMirror?.getValue?.()||'');
      if (!stagedHtml.trim()) throw new Error('E_EDITOR_HTML_BODY');
      assertEditorialContract(stagedHtml, post.bodyHtml,{version:editorialVersionFor(post)});
      stage = 'category-tags';
      await page.locator('#category-btn').click();
      await page.locator('#category-list').waitFor({state:'visible'});
      const matches = [];
      for (const option of await page.locator('#category-list [role="option"]').all()) {
        if ((await option.innerText()).trim().replace(/^[-·]\s*/, '') === post.category) matches.push(option);
      }
      if (matches.length !== 1) {
        const labels = await page.locator('#category-list [role="option"]').allInnerTexts().catch(()=>[]);
        console.error('CATEGORY_DIAG '+JSON.stringify({target:post.category,labels}));
        throw new Error('E_CATEGORY_AMBIGUOUS');
      }
      await matches[0].click();
      const tagInput = page.locator('#tagText');
      await tagInput.waitFor({state:'visible', timeout:10000}).catch(() => { throw new Error('E_TAG_CONTROL'); });
      for (const tag of post.tags) { await tagInput.fill(tag); await tagInput.press('Enter'); }
      stage = 'publish-editor-ready';
      await preparePublishEditor(page, {title:post.title,tags:post.tags});
      stage = 'publish-dialog';
      await openPublishDialog(page, {title:post.title,tags:post.tags});
      if (representativeSource) {
        const panel=page.locator('.publish_editor');
        const thumb=panel.locator('.box_thumb');
        // Publication UI is asynchronous. Wait for its real thumbnail slot before
        // applying the existing fail-closed representative check.
        await thumb.first().waitFor({state:'visible',timeout:15000}).catch(()=>{throw Error('E_REPRESENTATIVE_UNVERIFIED');});
        const diagnostic=async(stageName)=>console.log('REPRESENTATIVE_SLOT_DIAG '+JSON.stringify(await page.evaluate(({stageName})=>{
          const panel=document.querySelector('.publish_editor');
          const boxes=[...(panel?.querySelectorAll('.box_thumb')||[])];
          return {stage:stageName,panelVisible:!!panel?.getClientRects().length,slotCount:boxes.length,
            slots:boxes.map(el=>({visible:!!el.getClientRects().length,hasImage:!!el.querySelector('img,[style*="background-image"]'),
              hasFileInput:!!el.querySelector('input[type="file"]'),addPrompt:(el.textContent||'').includes('대표이미지 추가')}))};
        },{stageName}).catch(()=>({stage:stageName,unavailable:true}))));
        if(await thumb.count()!==1){await diagnostic('slot-count');throw Error('E_REPRESENTATIVE_UNVERIFIED');}
        const text=(await thumb.innerText().catch(()=>''))||'';
        if(text.includes('대표이미지 추가')){
          const repPath=join(imageTempDir,'tistory-representative.bin');
          await downloadImage(representativeSource,repPath);
          const input=thumb.locator('input[type="file"]');
          if(await input.count()!==1){await diagnostic('file-input');throw Error('E_REPRESENTATIVE_UNVERIFIED');}
          await input.setInputFiles(repPath);
          await page.waitForFunction(() => {
            const box=document.querySelector('.publish_editor .box_thumb');
            if (!box) return false;
            const text=(box.textContent||'').trim();
            return !text.includes('대표이미지 추가') || !!box.querySelector('img,[style*="background-image"]');
          }, {timeout:10000});
        }
        const thumbText=(await thumb.innerText().catch(()=>''))||'';
        if (thumbText.includes('대표이미지 추가') && await thumb.locator('img,[style*="background-image"]').count()===0) throw new Error('E_REPRESENTATIVE_UNVERIFIED');
      }
      await page.getByLabel('공개', {exact:true}).check();
      const scheduledAt = post.scheduledAt ? new Date(post.scheduledAt) : null;
      if (scheduledAt) {
        stage = 'schedule-settings';
        if (!(scheduledAt.getTime() > Date.now())) throw new Error('E_SCHEDULE_PAST');
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
          hour:'2-digit', minute:'2-digit', hourCycle:'h23'
        }).formatToParts(scheduledAt).reduce((acc,p)=>{ acc[p.type]=p.value; return acc; }, {});
        const nowParts = new Intl.DateTimeFormat('en-CA', {
          timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'
        }).formatToParts(new Date()).reduce((acc,p)=>{ acc[p.type]=p.value; return acc; }, {});
        if (parts.year!==nowParts.year || parts.month!==nowParts.month || parts.day!==nowParts.day) throw new Error('E_SCHEDULE_DATE_UNSUPPORTED');
        const reserve = page.locator('.publish_editor .btn_date').filter({hasText:'예약'});
        if (await reserve.count() !== 1) throw new Error('E_SCHEDULE_CONTROL');
        await reserve.click();
        const timeInputs = page.locator('.publish_editor .box_date input[type="number"]');
        await timeInputs.first().waitFor({state:'visible',timeout:10000}).catch(()=>{ throw new Error('E_SCHEDULE_TIME_CONTROL'); });
        if (await timeInputs.count() < 2) throw new Error('E_SCHEDULE_TIME_CONTROL');
        await timeInputs.nth(0).fill(String(Number(parts.hour)));
        await timeInputs.nth(1).fill(String(Number(parts.minute)));
        const values = [await timeInputs.nth(0).inputValue(), await timeInputs.nth(1).inputValue()];
        if (Number(values[0]) !== Number(parts.hour) || Number(values[1]) !== Number(parts.minute)) throw new Error('E_SCHEDULE_TIME_MISMATCH');
        console.log('SCHEDULE_SETTINGS '+JSON.stringify({scheduledAt:post.scheduledAt,hour:Number(parts.hour),minute:Number(parts.minute)}));
      }
      const publishButton = page.getByRole('button', {name:'공개 발행',exact:true});
      await publishButton.waitFor({state:'visible'});
      if (!(await publishButton.isEnabled())) throw new Error('E_PUBLISH_BUTTON_DISABLED');
      if (await page.locator('#post-title-inp').inputValue() !== post.title) throw new Error('E_TITLE_MISMATCH');
      // Durable checkpoint BEFORE the irreversible final click. A timeout must never resubmit blindly.
      // Reuse Gate A's source-scoped policy immediately before the checkpoint.
      // A second SHA-equality rule would reject unrelated article/doc changes.
      const sourceCommit = assertCurrentSource();
      await ledger.write(post.id, {phase:'submitting', fingerprint:fingerprint(post), sourceCommit, editorialTemplateVersion:EDITORIAL_TEMPLATE_VERSION, timestamp:new Date().toISOString()}, previousStateSha);
      stage = 'final-submit';
      finalSubmitDialogs = [];
      const submitResponses = [];
      const recordSubmitResponse = response => {
        try {
          if (response.request().method() !== 'POST') return;
          const u = new URL(response.url());
          submitResponses.push({host:u.host,path:u.pathname,status:response.status()});
        } catch {}
      };
      const readSubmitSignals = async () => {
        const notices = await page.locator('[role="alert"],.toast,.alert,.notice').evaluateAll(nodes => nodes
          .map(n => (n.textContent || '').replace(/\s+/g,' ').trim())
          .filter(Boolean).slice(0,8)).catch(()=>[]);
        const layerText = ((await page.locator('.publish_editor').innerText().catch(()=>'')) || '').replace(/\s+/g,' ').trim().slice(0,800);
        return {notices,layerText,dialogs:finalSubmitDialogs.slice(-8)};
      };
      const classifySubmitSignals = signals => {
        const text=[...(signals.notices||[]),...(signals.dialogs||[]).map(x=>x.message),signals.layerText||''].join(' ');
        if (/하루.{0,30}(?:공개|새롭게).{0,30}발행|최대\s*(?:15|30)개|공개\s*발행.{0,30}제한/.test(text)) return 'E_TISTORY_DAILY_PUBLISH_LIMIT';
        if (/자동입력|보안문자|captcha|recaptcha|사람인지|로봇/i.test(text)) return 'E_TISTORY_HUMAN_VERIFICATION_REQUIRED';
        if (hasHumanVerificationFailure(submitResponses)) return 'E_TISTORY_HUMAN_VERIFICATION_REQUIRED';
        return null;
      };
      page.on('response', recordSubmitResponse);
      let navigatedToPostList = false;
      try {
        await publishButton.click({timeout:10000});
        await page.waitForTimeout(1200);
        const immediateSignals = await readSubmitSignals();
        console.log('FINAL_SUBMIT_RESPONSES '+JSON.stringify(submitResponses.slice(-12)));
        console.log('FINAL_SUBMIT_SIGNALS '+JSON.stringify(immediateSignals));
        const immediateCode=classifySubmitSignals(immediateSignals);
        if(immediateCode) throw new Error(immediateCode);
        try {
          await page.waitForURL(url => url.origin === BLOG && /\/manage\/posts\/?$/.test(url.pathname), {timeout:8000});
          navigatedToPostList = true;
        } catch {
          // Tistory may change its post-submit redirect without changing the write result.
          // Navigate read-only to the canonical post list and verify the exact title instead of clicking twice.
          await page.goto(`${BLOG}/manage/posts`, {waitUntil:'domcontentloaded'});
          navigatedToPostList = true;
        }
      } catch (error) {
        const signals = await readSubmitSignals();
        console.log('FINAL_SUBMIT_RESPONSES '+JSON.stringify(submitResponses.slice(-12)));
        console.log('FINAL_SUBMIT_SIGNALS '+JSON.stringify(signals));
        const signalCode=classifySubmitSignals(signals);
        if(signalCode) throw new Error(signalCode);
        if (/^E_[A-Z0-9_]+$/.test(error?.message ?? '')) throw error;
        if (submitResponses.some(x => x.status === 429)) throw new Error('E_PUBLISH_RATE_LIMIT');
        if (submitResponses.some(x => x.status >= 400)) throw new Error('E_PUBLISH_HTTP');
        throw new Error('E_FINAL_SUBMIT_INTERACTION');
      } finally {
        page.off('response', recordSubmitResponse);
      }
      if (!navigatedToPostList) throw new Error('E_PUBLICATION_UNCERTAIN');
      const titleLink = page.locator('a').filter({hasText:post.title}).first();
      if (!(await titleLink.isVisible().catch(()=>false))) {
        const signals = await readSubmitSignals();
        console.log('FINAL_SUBMIT_POSTLIST '+JSON.stringify({urlPath:new URL(page.url()).pathname,signals}));
        const signalCode=classifySubmitSignals(signals);
        if(signalCode) throw new Error(signalCode);
        throw new Error('E_PUBLICATION_NOT_FOUND_AFTER_CLICK');
      }
      if (post.scheduledAt) {
        const scheduleEvidence = await titleLink.evaluate((link,title) => {
          let el=link;
          for(let i=0;i<8&&el;i++,el=el.parentElement){
            const text=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
            if(text.includes(title) && /예약/.test(text)) return text.slice(0,500);
          }
          return '';
        }, post.title).catch(()=> '');
        if (!scheduleEvidence || !/예약/.test(scheduleEvidence)) throw new Error('E_SCHEDULE_NOT_CONFIRMED');
        const state = await ledger.read(post.id);
        if (state?.phase !== 'submitting' || state.fingerprint !== fingerprint(post)) throw new Error('E_LEDGER_CONFLICT');
        await ledger.write(post.id, {
          phase:'scheduled',
          fingerprint:fingerprint(post),
          scheduledAt:post.scheduledAt,
          editorialTemplateVersion:EDITORIAL_TEMPLATE_VERSION,
          timestamp:new Date().toISOString()
        }, state.sha);
        console.log(`SCHEDULED: ${post.id} ${post.scheduledAt}`);
      } else {
      stage = 'public-verification';
      // Verify anonymously, so an owner-only/private page cannot count as published.
      publicBrowser = await openPublicBrowser(browserConfig);
      const publicContext = await verificationContext(publicBrowser);
      const publicPage = await publicContext.newPage();
      let publicUrls = publishedUrls(await page.locator('a').evaluateAll(links => links.map(a => ({text:a.textContent,href:a.href}))), post.title);
      if (publicUrls.length !== 1) {
        // A successful submit can return manager links using slugs instead of IDs.
        // Read the public search once; never repeat the mutation to discover its URL.
        await publicPage.goto(`${BLOG}/search/${encodeURIComponent(post.title)}`, {waitUntil:'domcontentloaded'});
        publicUrls = publishedUrls(await publicPage.locator('a').evaluateAll(links => links.map(a => ({text:a.textContent,href:a.href}))), post.title);
      }
      if (publicUrls.length !== 1) throw new Error(publicUrls.length ? 'E_PUBLIC_URL_AMBIGUOUS' : 'E_PUBLIC_URL_NOT_FOUND');
      const url = assertArticleUrl(publicUrls[0]);
      const checkpoint=await ledger.read(post.id);
      if(checkpoint?.phase!=='submitting'||checkpoint.fingerprint!==fingerprint(post)) throw new Error('E_LEDGER_CONFLICT');
      const {sha:checkpointSha,...record}=checkpoint;
      await ledger.write(post.id,{...record,url,verificationPhase:'public-verification'},checkpointSha);
      await publicPage.goto(url, {waitUntil:'domcontentloaded'});
      await verifyPublishedPublic({publicPage,publicBrowser,post,bodyHtml,sources,representativeSource,editorialExpected,url});
      const state = await ledger.read(post.id);
      if (state?.phase !== 'submitting' || state.fingerprint !== fingerprint(post)) throw new Error('E_LEDGER_CONFLICT');
      await ledger.write(post.id, {phase:'published',fingerprint:fingerprint(post),url,editorialTemplateVersion:editorialVersionFor(post),timestamp:new Date().toISOString(),
        sourceCommit:state.sourceCommit||process.env.GITHUB_SHA||null,
        runUrl:process.env.GITHUB_RUN_ID?`https://github.com/ansqhd5774-Choi/nhunnhun_disease/actions/runs/${process.env.GITHUB_RUN_ID}`:null,
        publicResult:{status:'PUBLIC_VERIFIED',sourceId:post.id,url,checkedAt:new Date().toISOString(),
          checks:['title','body','images','representative','emphasis','desktop','mobile'],semanticVerification:'not-performed'}}, state.sha);
      console.log(`PUBLISHED: ${post.id} ${url}`);
      }
    } else console.log('NO_PENDING_POSTS');
  }
} catch (error) {
  const code = /^(?:E_[A-Z0-9_]+|BLOCKED_SOURCE_DRIFT)$/.test(error?.message ?? '') ? error.message : 'E_RUNTIME';
  console.error(`DIAGNOSTIC: ${stage} ${code}`);
  console.error('RUNTIME_SAFE_DIAG '+JSON.stringify(safeRuntimeDiagnostic(error)));
  if (editorPage && stage === 'mode-menu') try {
    console.log('MODE_MENU_SAFE_DIAG '+JSON.stringify(await editorPage.evaluate(()=>{
      const buttons=[...document.querySelectorAll('#editor-mode-layer-btn-open')];
      return { count:buttons.length, buttons:buttons.map(button=>{
        const rect=button.getBoundingClientRect();
        const x=rect.left+rect.width/2, y=rect.top+rect.height/2;
        const hit=document.elementFromPoint(x,y);
        return {visible:rect.width>0&&rect.height>0,disabled:button.disabled,
          insideViewport:x>=0&&y>=0&&x<innerWidth&&y<innerHeight,
          hitWithinButton:!!hit&&(hit===button||button.contains(hit)),
          hitTag:hit?.tagName??null};
      })};
    })));
  } catch { console.log('MODE_MENU_SAFE_DIAG_UNAVAILABLE'); }
  if (stage === 'local-browser') console.error('LOCAL_BROWSER_SAFE_DIAG '+JSON.stringify({code}));
  if (editorPage && stage !== 'final-submit' && stage !== 'public-verification') try {
    console.log('EDITOR_CONTROLS: '+JSON.stringify(await editorPage.evaluate(()=>({
      codeMirror:document.querySelectorAll('.CodeMirror').length,
      codeMirrorCode:document.querySelectorAll('.CodeMirror-code').length,
      inputs:Array.from(document.querySelectorAll('textarea')).map(e=>({id:e.id,class:e.className})),
      modeText:document.querySelector('#editor-mode-layer-btn-open')?.textContent,
    }))));
  } catch {}
  // Provider exceptions can carry credentials/connect URLs: never log raw exceptions.
  console.error('STOP: 로컬 Chrome·전용 프로필·로그인·발행 증거를 확인해야 합니다. 실패 직후 임의 재발행하지 마세요.');
  process.exitCode = 1;
  fatalExitCode = 1;
} finally {
  try { await publicBrowser?.close(); }
  catch { console.error('E_LOCAL_PUBLIC_BROWSER_CLOSE'); process.exitCode = 1; }
  try { await closeEditorConnection(editorConnection); }
  catch { console.error('E_LOCAL_BROWSER_DISCONNECT'); process.exitCode = 1; }
  if (imageTempDir) try { await rm(imageTempDir, {recursive:true, force:true}); }
  catch { console.error('E_LOCAL_TEMP_CLEANUP'); process.exitCode = 1; fatalExitCode = 1; }
  const finalExitCode = fatalExitCode || process.exitCode || 0;
  setTimeout(() => process.exit(finalExitCode), 0);
}
