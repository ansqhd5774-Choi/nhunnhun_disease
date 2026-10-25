// Safe UI signals only: never log article text, image URLs or editor HTML.
export async function editorReadiness(page, {title, tags = null}) {
  return page.evaluate(({title, tags}) => {
    const input = document.querySelector('#post-title-inp');
    const button = document.querySelector('#publish-layer-btn');
    const rect = button?.getBoundingClientRect();
    const tagLabels = [...document.querySelectorAll('.txt_tag a[aria-label$=" 태그 수정"]')]
      .map(a => a.getAttribute('aria-label').replace(/ 태그 수정$/, ''));
    const panels = [...document.querySelectorAll('.publish_editor')];
    const x = rect ? rect.left + rect.width / 2 : -1;
    const y = rect ? rect.top + rect.height / 2 : -1;
    const hit = document.elementFromPoint(x, y);
    return {
      titlePresent: !!input, titleMatches: input?.value === title,
      titleEmpty: !(input?.value || '').trim(), titleInvalid: !!input?.classList.contains('red'),
      tagCount: tagLabels.length,
      tagsMatch: tags === null || (tagLabels.length === tags.length && tags.every(t => tagLabels.includes(t))),
      tagInputEmpty: tags === null || !(document.querySelector('#tagText')?.value || '').trim(),
      buttonVisible: !!rect && rect.width > 0 && rect.height > 0,
      buttonEnabled: !!button && !button.disabled && button.getAttribute('aria-disabled') !== 'true',
      buttonCovered: !!button && !!hit && hit !== button && !button.contains(hit),
      panelCount: panels.length,
      panelVisible: panels.some(p => p.getClientRects().length && getComputedStyle(p).visibility !== 'hidden'),
    };
  }, {title, tags});
}
export function isEditorReady(state) {
  return state.titlePresent && state.titleMatches && !state.titleEmpty && !state.titleInvalid &&
    state.tagsMatch && state.tagInputEmpty && state.buttonVisible && state.buttonEnabled && !state.buttonCovered;
}
export async function preparePublishEditor(page, expected, report = console.log,
  {settleMs = 1000, timeoutMs = 15000, pollMs = 250, now = Date.now} = {}) {
  // Set title after uploads/body/mode changes, then commit input with blur.
  await page.locator('#post-title-inp').fill(expected.title);
  await page.locator('#post-title-inp').press('Tab');
  const deadline = now() + timeoutMs;
  let stableSince = null;
  let state;
  do {
    state = await editorReadiness(page, expected);
    const time = now();
    if (isEditorReady(state)) {
      stableSince ??= time;
      if (time - stableSince >= settleMs) {
        report('PUBLISH_EDITOR_READY ' + JSON.stringify({...state, settleMs}));
        return;
      }
    } else stableSince = null;
    if (time >= deadline) break;
    await page.waitForTimeout(pollMs);
  } while (true);
  report('PUBLISH_EDITOR_NOT_READY ' + JSON.stringify(state));
  throw new Error('E_PUBLISH_EDITOR_NOT_READY');
}
export async function openPublishDialog(page, expected, report = console.log,
  errorCode = 'E_PUBLISH_DIALOG_UNAVAILABLE', {observe = async (_,action)=>action(),clickTimeoutMs=null} = {}) {
  const panel = page.locator('.publish_editor');
  if (await observe('dialog-existing-visible',()=>panel.isVisible(),{safeReadOnly:true,timeoutMs:15000})) return;
  const state = await observe('dialog-readiness',()=>editorReadiness(page,expected),{safeReadOnly:true,timeoutMs:15000});
  if (!isEditorReady(state)) {
    report('PUBLISH_EDITOR_NOT_READY ' + JSON.stringify(state));
    throw new Error('E_PUBLISH_EDITOR_NOT_READY');
  }
  await observe('dialog-open-click',()=>page.locator('#publish-layer-btn').click(clickTimeoutMs===null?{}:{timeout:clickTimeoutMs}));
  try { await observe('dialog-visible-wait',()=>panel.waitFor({state:'visible',timeout:30000}),{safeReadOnly:true,timeoutMs:35000}); }
  catch {
    report('PUBLISH_DIALOG_SAFE_DIAG ' + JSON.stringify(await observe('dialog-failure-readiness',()=>editorReadiness(page,expected),{safeReadOnly:true,timeoutMs:15000}).catch(()=>({unavailable:true}))));
    // No blind reopening, and never retry the irreversible final publish click.
    throw new Error(errorCode);
  }
}
