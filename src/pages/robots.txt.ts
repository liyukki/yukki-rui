import { absoluteHref, withBase } from '../lib/url';

export function GET(): Response {
  // /admin/ 是 CMS 后台，对访客无意义，也不该进搜索结果。
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${absoluteHref(withBase('sitemap-index.xml'))}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
