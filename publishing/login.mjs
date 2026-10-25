import { BLOG } from './core.mjs';
import { localBrowserConfig, openEditorConnection, closeEditorConnection, freshEditorPage } from './local-browser.mjs';
let connection;
try {
  const config = await localBrowserConfig();
  connection = await openEditorConnection(config);
  const page = await freshEditorPage(connection.context);
  await page.goto(`${BLOG}/manage/posts`, {waitUntil:'domcontentloaded'});
  console.log('WAITING_FOR_USER_LOGIN: 열린 전용 Chrome에서 직접 로그인하세요. 글은 발행하지 않습니다.');
  const deadline = Date.now() + 240000;
  let authenticated = false;
  while (Date.now() < deadline) {
    if (page.isClosed()) break;
    const url = new URL(page.url());
    if (url.origin === BLOG && url.pathname === '/manage/posts'
      && await page.getByRole('link', {name:'글쓰기', exact:true}).count() > 0) {
      authenticated = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!authenticated) throw new Error('E_LOGIN_REQUIRED');
  await page.waitForTimeout(3000);
  await page.reload({waitUntil:'domcontentloaded'});
  try {
    await page.getByRole('link', {name:'글쓰기', exact:true}).first().waitFor({state:'visible', timeout:15000});
  } catch { throw new Error('E_LOGIN_SESSION_UNSTABLE'); }
  const settledUrl = new URL(page.url());
  if (settledUrl.origin !== BLOG || settledUrl.pathname !== '/manage/posts') throw new Error('E_LOGIN_SESSION_UNSTABLE');
  console.log('LOGIN_CURRENT_SESSION_PASS');
  console.log('LOGIN_SAVED');
} catch (error) {
  console.error(/^E_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'E_LOGIN_SETUP');
  process.exitCode = 1;
} finally {
  try { await closeEditorConnection(connection); }
  catch { console.error('E_LOCAL_BROWSER_DISCONNECT'); process.exitCode = 1; }
  // Exit after disconnect; keep the dedicated Chrome and its session alive.
  setTimeout(() => process.exit(process.exitCode ?? 0), 0);
}
