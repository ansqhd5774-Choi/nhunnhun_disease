import test from 'node:test';
import assert from 'node:assert/strict';
import { openHtmlMode } from '../publishing/html-mode.mjs';
import { preparePublishEditor, openPublishDialog } from '../publishing/publish-dialog.mjs';

const readyState = {titlePresent:true,titleMatches:true,titleEmpty:false,titleInvalid:false,
  tagsMatch:true,tagInputEmpty:true,buttonVisible:true,buttonEnabled:true,buttonCovered:false};
function publishFixture(states = [readyState], {panelOpen=false,dialogFails=false} = {}) {
  const events=[]; const reports=[]; let time=0; let index=0;
  const panel={isVisible:async()=>panelOpen,waitFor:async opts=>{
    events.push(['wait-dialog',opts.timeout]);if(dialogFails)throw Error('timeout');
  }};
  const page={evaluate:async()=>states[Math.min(index++,states.length-1)],
    waitForTimeout:async ms=>{time+=ms;events.push(['wait',ms]);},
    locator:s=>s==='.publish_editor'?panel:s==='#post-title-inp'?{
      fill:async()=>events.push(['fill-title']),press:async key=>events.push(['blur',key]),
    }:{click:async()=>events.push(['open-dialog'])}};
  return {page,events,reports,report:s=>reports.push(s),options:{now:()=>time,timeoutMs:2000}};
}
test('late title input is committed and readiness remains stable for one second before opening',async()=>{
  const f=publishFixture([{...readyState,tagsMatch:false},readyState]);
  await preparePublishEditor(f.page,{title:'title',tags:['tag']},f.report,f.options);
  await openPublishDialog(f.page,{title:'title'},f.report);
  assert.deepEqual(f.events.slice(0,2),[['fill-title'],['blur','Tab']]);
  assert.equal(f.events.filter(e=>e[0]==='wait').length,5);
  assert.equal(f.events.filter(e=>e[0]==='open-dialog').length,1);
  assert.match(f.reports[0],/PUBLISH_EDITOR_READY/);
});
test('a rerender clearing the title resets the stabilization period',async()=>{
  const f=publishFixture([readyState,readyState,{...readyState,titleMatches:false,titleEmpty:true},readyState]);
  await preparePublishEditor(f.page,{title:'title'},f.report,f.options);
  assert.equal(f.events.filter(e=>e[0]==='wait').length,7);
});
test('invalid title or an uncommitted tag stops before any opening click',async()=>{
  for(const broken of [{titleEmpty:true,titleMatches:false},{tagInputEmpty:false},{buttonCovered:true}]){
    const f=publishFixture([{...readyState,...broken}]);
    await assert.rejects(preparePublishEditor(f.page,{title:'title'},f.report,f.options),/E_PUBLISH_EDITOR_NOT_READY/);
    assert.equal(f.events.some(e=>e[0]==='open-dialog'),false);
  }
});
test('readiness lost between stabilization and click is rejected',async()=>{
  const f=publishFixture([{...readyState,titleMatches:false}]);
  await assert.rejects(openPublishDialog(f.page,{title:'title'},f.report),/E_PUBLISH_EDITOR_NOT_READY/);
  assert.equal(f.events.length,0);
});
test('dialog timeout logs safe state and never repeats opening or final submission',async()=>{
  const f=publishFixture([readyState],{dialogFails:true});
  await assert.rejects(openPublishDialog(f.page,{title:'private-title'},f.report),/E_PUBLISH_DIALOG_UNAVAILABLE/);
  assert.deepEqual(f.events,[['open-dialog'],['wait-dialog',30000]]);
  assert.match(f.reports[0],/PUBLISH_DIALOG_SAFE_DIAG/);
  assert.equal(f.reports.join('').includes('private-title'),false);
});
test('already visible publication panel is not toggled closed',async()=>{
  const f=publishFixture([],{panelOpen:true});
  await openPublishDialog(f.page,{title:'title'},f.report);
  assert.equal(f.events.length,0);
});

function fixture({menuOpen=false,alreadyHtml=false,menuFails=false,modeFails=false}={}) {
  const events=[];
  let ready=false;
  const menu={click:async()=>{events.push('menu-click');}};
  const html={isVisible:async()=>menuOpen,waitFor:async()=>{
    events.push('menu-visible'); if(menuFails)throw Error('timeout'); ready=true;
  },click:async()=>{assert.equal(ready,true);events.push('html-click');}};
  const editor={isVisible:async()=>alreadyHtml,waitFor:async()=>{
    events.push('editor-visible');if(modeFails)throw Error('timeout');
  }};
  return {events,page:{locator:s=>({'#editor-mode-layer-btn-open':menu,'#editor-mode-html':html,'.CodeMirror:visible':editor})[s]}};
}
test('closed menu is clicked once, then waits for dropdown and HTML editor',async()=>{
  const f=fixture();await openHtmlMode(f.page,()=>{},()=>{});
  assert.deepEqual(f.events,['menu-click','menu-visible','html-click','editor-visible']);
});
test('open menu is never toggled closed and existing HTML mode is preserved',async()=>{
  const f=fixture({menuOpen:true});await openHtmlMode(f.page,()=>{},()=>{});
  assert.deepEqual(f.events,['menu-visible','html-click','editor-visible']);
  const ready=fixture({alreadyHtml:true});await openHtmlMode(ready.page,()=>{},()=>{});
  assert.deepEqual(ready.events,[]);
});
test('menu timeout does not cause a second click or body editing',async()=>{
  const f=fixture({menuFails:true});await assert.rejects(openHtmlMode(f.page,()=>{},()=>{}));
  assert.deepEqual(f.events,['menu-click','menu-visible']);
});
test('unconfirmed mode switch stops before body editing with a specific error',async()=>{
  const f=fixture({modeFails:true});await assert.rejects(openHtmlMode(f.page,()=>{},()=>{}),/^Error: E_HTML_MODE_NOT_ACTIVATED$/);
});
