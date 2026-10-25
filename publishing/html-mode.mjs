export async function openHtmlMode(page, setStage, report = console.log) {
  const html = page.locator('#editor-mode-html');
  const editor = page.locator('.CodeMirror:visible');
  const clicks = { menu:0, html:0 };
  if (await editor.isVisible()) {
    report('HTML_MODE_CLICKS '+JSON.stringify(clicks));
    return;
  }
  try {
    setStage('mode-menu');
    if (!await html.isVisible()) {
      clicks.menu++;
      await page.locator('#editor-mode-layer-btn-open').click();
    }
    await html.waitFor({state:'visible',timeout:15000});
    setStage('html-mode');
    clicks.html++;
    await html.click();
    setStage('html-mode-ready');
    try { await editor.waitFor({state:'visible',timeout:15000}); }
    catch { throw new Error('E_HTML_MODE_NOT_ACTIVATED'); }
  } finally {
    report('HTML_MODE_CLICKS '+JSON.stringify(clicks));
  }
}
