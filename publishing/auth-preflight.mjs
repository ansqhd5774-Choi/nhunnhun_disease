import { pathToFileURL } from 'node:url';
import { BLOG } from './core.mjs';
import { localBrowserConfig, openEditorConnection, closeEditorConnection } from './local-browser.mjs';

export async function assertTistoryAuthenticated(page) {
  let current;
  try { current = new URL(page.url()); }
  catch { throw new Error('E_TISTORY_AUTH_REQUIRED_PRECHECK'); }
  if (current.origin !== BLOG || !/^\/manage\/posts\/?$/.test(current.pathname)) {
    throw new Error('E_TISTORY_AUTH_REQUIRED_PRECHECK');
  }
  try {
    await page.getByRole('link', {name:'글쓰기', exact:true}).first()
      .waitFor({state:'visible', timeout:8000});
  } catch {
    throw new Error('E_TISTORY_AUTH_REQUIRED_PRECHECK');
  }
}

// Read-only session checks retry transient CDP/navigation faults only; never bypass authentication.
export async function runTistoryAuthPreflight() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let connection;
    let page;
    let stage = 'CONFIG';
    try {
      const config = await localBrowserConfig();
      stage = 'CDP_CONNECT';
      connection = await openEditorConnection(config);
      stage = 'PAGE_CREATE';
      page = await connection.context.newPage();
      stage = 'FIRST_NAVIGATION';
      await page.goto(`${BLOG}/manage/posts`, {waitUntil:'domcontentloaded', timeout:30000});
      stage = 'FIRST_AUTH';
      await assertTistoryAuthenticated(page);
      stage = 'RELOAD';
      await page.reload({waitUntil:'domcontentloaded', timeout:30000});
      stage = 'SECOND_AUTH';
      await assertTistoryAuthenticated(page);
      console.log('TISTORY_AUTH_READY');
      return;
    } catch (error) {
      const authRequired = error?.message === 'E_TISTORY_AUTH_REQUIRED_PRECHECK';
      const code = authRequired ? error.message : 'E_TISTORY_AUTH_PRECHECK_RUNTIME';
      console.error(`TISTORY_AUTH_PREFLIGHT ${code} stage=${stage} attempt=${attempt}`);
      if (authRequired || attempt === 2) { process.exitCode = 1; return; }
    } finally {
      try { await page?.close({runBeforeUnload:false}); } catch {}
      try { if (connection) await closeEditorConnection(connection); } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const watchdog = setTimeout(() => {
    console.error('TISTORY_AUTH_PREFLIGHT E_TISTORY_AUTH_PRECHECK_TIMEOUT');
    process.exit(1);
  }, 120000);
  try {
    await runTistoryAuthPreflight();
  } finally {
    clearTimeout(watchdog);
  }
  // A completed read-only auth check must not keep the CDP client or Node event loop alive.
  setTimeout(() => process.exit(process.exitCode ?? 0), 0);
}
