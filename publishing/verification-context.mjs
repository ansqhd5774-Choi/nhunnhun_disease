// 자동 공개 검증에만 적용한다. 관리자 로그인 및 실제 방문자에는 적용하지 않는다.
const blockedHosts = ['google-analytics.com', 'googletagmanager.com', 'googlesyndication.com', 'doubleclick.net', 'adservice.google.com', 'wcs.naver.net'];
export function isMeasurementRequest(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return blockedHosts.some(domain => host === domain || host.endsWith('.' + domain));
  } catch { return false; }
}
export async function verificationContext(browser, options = {}) {
  // Service Worker의 우회 요청을 막고 새 익명 컨텍스트를 사용한다.
  const context = await browser.newContext({...options, serviceWorkers: 'block'});
  try {
    await context.route('**/*', route =>
      isMeasurementRequest(route.request().url()) ? route.abort('blockedbyclient') : route.continue());
    return context;
  } catch (error) {
    await context.close();
    throw error;
  }
}
