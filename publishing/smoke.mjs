import { BLOG } from './core.mjs';
import { localBrowserConfig, assertLocalGit, openEditorConnection, closeEditorConnection, freshEditorPage } from './local-browser.mjs';
let connection;
try {
  assertLocalGit();
  connection = await openEditorConnection(await localBrowserConfig());
  const page = await freshEditorPage(connection.context);
  await page.goto(`${BLOG}/manage/posts`, {waitUntil:'domcontentloaded', timeout:45000});
  try {
    await page.getByRole('link', {name:'글쓰기', exact:true}).first().waitFor({state:'visible', timeout:15000});
  } catch { throw new Error('E_LOGIN_REQUIRED'); }
  const url = new URL(page.url());
  if (url.origin !== BLOG || url.pathname !== '/manage/posts'
    || await page.getByRole('link', {name:'글쓰기', exact:true}).count() < 1) throw new Error('E_LOGIN_REQUIRED');
  console.log('LOCAL_BROWSER_PASS / TISTORY_LOGIN_PASS / PUBLICATION_NOT_ATTEMPTED');
} catch (error) {
  console.error(/^E_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'E_LOCAL_SMOKE');
  process.exitCode = 1;
} finally {
  try { await closeEditorConnection(connection); }
  catch { console.error('E_LOCAL_BROWSER_DISCONNECT'); process.exitCode = 1; }
  // A completed check must not retain a CDP client that handles future dialogs.
  setTimeout(() => process.exit(process.exitCode ?? 0), 0);
}
