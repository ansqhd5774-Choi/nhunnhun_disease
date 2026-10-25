// Classify provider exceptions without exposing messages, URLs, or credentials.
export function hasHumanVerificationFailure(responses) {
  return responses.some(response =>
    (/\/manage\/dkaptcha\//.test(response.path) && response.status >= 400)
    || (response.path === '/manage/post.json' && response.status === 403));
}
export function safeRuntimeDiagnostic(error) {
  const message = String(error?.message ?? '');
  return {
    type: error?.name === 'TimeoutError' ? 'TIMEOUT' : 'ERROR',
    timeout: /Timeout.*exceeded/i.test(message),
    pointerIntercepted: /intercepts pointer events/i.test(message),
    outsideViewport: /outside.*viewport/i.test(message),
    notVisible: /not visible/i.test(message),
    notStable: /not stable/i.test(message),
    detached: /detached from the DOM/i.test(message),
    closed: /(?:page|context|browser).*closed/i.test(message),
    protocolError: /Protocol error/i.test(message),
    strictMode: /strict mode violation/i.test(message),
  };
}
