import { BLOG } from './core.mjs';

// Discovery only: the caller still verifies the complete public body and images.
export function publishedUrls(links, title) {
  const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
  const expected = normalize(title);
  if (!expected) return [];
  return [...new Set(links.flatMap(link => {
    if (!normalize(link.text).includes(expected)) return [];
    try {
      const url = new URL(link.href);
      if (url.origin !== BLOG || !/^\/\d+$/.test(url.pathname)) return [];
      return [url.origin + url.pathname];
    } catch { return []; }
  }))];
}
