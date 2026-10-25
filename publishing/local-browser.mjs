import { access, mkdir, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

export function assertDedicatedProfile(profileDir) {
  if (!profileDir || !isAbsolute(profileDir)) throw new Error('E_LOCAL_PROFILE_REQUIRED');
  if (/[\\/]Google[\\/]Chrome[\\/]User Data(?:[\\/]|$)/i.test(profileDir)) throw new Error('E_LOCAL_PROFILE_REQUIRED');
}
export function assertLocalCdpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('E_LOCAL_CDP_REQUIRED'); }
  if (url.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('E_LOCAL_CDP_REQUIRED');
  if (!url.port) throw new Error('E_LOCAL_CDP_REQUIRED');
  return url.toString().replace(/\/$/,'');
}
export async function localBrowserConfig(env = process.env) {
  const chromePath = env.TISTORY_CHROME_PATH;
  const profileDir = env.TISTORY_PROFILE_DIR;
  const cdpUrl = assertLocalCdpUrl(env.TISTORY_CDP_URL || 'http://127.0.0.1:9223');
  if (!chromePath || !isAbsolute(chromePath)) throw new Error('E_LOCAL_CHROME_REQUIRED');
  try {
    await access(chromePath, constants.R_OK);
    if (!(await stat(chromePath)).isFile()) throw new Error();
  } catch { throw new Error('E_LOCAL_CHROME_REQUIRED'); }
  assertDedicatedProfile(profileDir);
  try {
    await mkdir(profileDir, { recursive:true });
    assertDedicatedProfile(await realpath(profileDir));
    await access(profileDir, constants.R_OK | constants.W_OK);
    if (!(await stat(profileDir)).isDirectory()) throw new Error();
  } catch (error) {
    if (error.message === 'E_LOCAL_PROFILE_REQUIRED') throw error;
    throw new Error('E_LOCAL_PROFILE_ACCESS');
  }
  return { chromePath:resolve(chromePath), profileDir:resolve(profileDir), cdpUrl };
}
export function assertLocalGit(run = execFileSync) {
  try { run('git', ['--version'], { encoding:'utf8', stdio:'pipe', windowsHide:true }); }
  catch { throw new Error('E_LOCAL_GIT_REQUIRED'); }
}
async function discoverLocalCdpWebSocket(cdpUrl, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl(cdpUrl + '/json/version', { signal:controller.signal });
    if (!response?.ok) throw new Error('E_LOCAL_CDP_DISCOVERY');
    const data = await response.json();
    const ws = new URL(data?.webSocketDebuggerUrl || '');
    if (ws.protocol !== 'ws:') throw new Error('E_LOCAL_CDP_DISCOVERY');
    const base = new URL(cdpUrl);
    if (!['127.0.0.1','localhost'].includes(ws.hostname)) ws.hostname = base.hostname;
    if (!ws.port) ws.port = base.port;
    return ws.toString();
  } catch {
    throw new Error('E_LOCAL_CDP_DISCOVERY');
  } finally {
    clearTimeout(timer);
  }
}
async function activateLocalCdpTargets(wsUrl, WebSocketImpl = WebSocket) {
  return await new Promise((resolve, reject) => {
    let settled = false;
    const socket = new WebSocketImpl(wsUrl);
    const pending = new Set();
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => finish(new Error('E_LOCAL_CDP_ACTIVATE')), 8000);
    socket.addEventListener('error', () => finish(new Error('E_LOCAL_CDP_ACTIVATE')), {once:true});
    socket.addEventListener('open', () => {
      pending.add(1);
      socket.send(JSON.stringify({id:1,method:'Target.getTargets'}));
    }, {once:true});
    socket.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data)); }
      catch { return; }
      if (!pending.has(message.id)) return;
      pending.delete(message.id);
      if (message.id === 1) {
        const targets = (message.result?.targetInfos || []).filter(target =>
          target?.targetId && ['page','webview'].includes(target.type));
        if (!targets.length) return finish();
        let id = 1;
        for (const target of targets) {
          id += 1;
          pending.add(id);
          socket.send(JSON.stringify({id,method:'Target.activateTarget',params:{targetId:target.targetId}}));
        }
        return;
      }
      if (!pending.size) finish();
    });
  });
}

export async function openEditorConnection(config, { engine = chromium, fetchImpl = fetch, recoverTargets = activateLocalCdpTargets } = {}) {
  try {
    let endpoint = config.cdpUrl;
    try { endpoint = await discoverLocalCdpWebSocket(config.cdpUrl, fetchImpl); }
    catch { /* Safe fallback for older Chrome endpoints. */ }
    const connect = () => engine.connectOverCDP(endpoint, { timeout:15000, isLocal:true, noDefaults:true });
    let browser;
    try { browser = await connect(); }
    catch (firstError) {
      if (!endpoint.startsWith('ws:')) throw firstError;
      await recoverTargets(endpoint);
      browser = await connect();
    }
    const contexts = browser.contexts();
    if (contexts.length !== 1) {
      // Real Playwright connectOverCDP must keep its default close path so the
      // server-side CDP WebSocket is closed. Injected test engines have no
      // Playwright connection and retain the legacy disconnect-only flag.
      if (!browser._connection?.close) browser._shouldCloseConnectionOnClose = true;
      await browser.close();
      throw new Error('E_LOCAL_BROWSER_CONTEXT');
    }
    if (!browser._connection?.close) browser._shouldCloseConnectionOnClose = true;
    return { browser, context:contexts[0] };
  } catch (error) {
    if (error?.message === 'E_LOCAL_BROWSER_CONTEXT') throw error;
    throw new Error('E_LOCAL_BROWSER_CONNECT');
  }
}
export async function closeEditorConnection(connection) {
  const browser = connection?.browser;
  if (!browser) return;
  let timer=null;
  try {
    // Do not close browser._connection directly. With in-process Playwright it
    // only tears down the client side and can leave the server CDP transport alive.
    // browser.close() follows connectOverCDP's server browserProcess.close(),
    // which closes the CDP WebSocket while leaving the persistent Chrome process running.
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => {timer=setTimeout(() => reject(new Error('disconnect-timeout')), 3000);})
    ]);
  } catch { throw new Error('E_LOCAL_BROWSER_DISCONNECT'); }
  finally {if(timer)clearTimeout(timer);}
}
export async function freshEditorPage(context) {
  const pages = context.pages();
  const anchor = pages.find(page => {
    try {
      const url = new URL(page.url());
      return url.origin === 'https://nhunnhun.tistory.com'
        && url.pathname.startsWith('/manage')
        && !/^\/manage\/(?:post|newpost)(?:[/?#]|$)/.test(url.pathname);
    } catch {
      return false;
    }
  }) || null;

  for (const page of pages) {
    if (page === anchor) continue;
    const url = page.url();
    if (!/^https:\/\/nhunnhun\.tistory\.com\/manage\/post(?:[/?#]|$)/.test(url)) continue;
    try { await page.close({runBeforeUnload:false}); } catch {}
  }

  return anchor || context.newPage();
}
export async function installLightweightRouting(page){
  const tracker=/^(?:www\.)?(?:google-analytics\.com|googletagmanager\.com|doubleclick\.net|googlesyndication\.com)$/i;
  try{
    await page.route('**/*',async route=>{
      const request=route.request();
      let host='';try{host=new URL(request.url()).hostname;}catch{}
      if(request.resourceType()==='font'||tracker.test(host))return route.abort();
      return route.continue();
    });
  }catch{throw new Error('E_EDITOR_ROUTING');}
}

export async function ensureEditorRendering(context, page) {
  // noDefaults preserves the user's Chrome settings but skips Playwright's
  // focus emulation. Hidden tabs can suspend the animation-frame polling
  // used by locator actions. Restore only this override for the editor tab.
  try {
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setFocusEmulationEnabled', { enabled:true });
    return session;
  } catch { throw new Error('E_EDITOR_RENDERING'); }
}
export async function openPublicBrowser(config, engine = chromium) {
  try { return await engine.launch({headless:true, executablePath:config.chromePath}); }
  catch { throw new Error('E_LOCAL_PUBLIC_BROWSER_LAUNCH'); }
}