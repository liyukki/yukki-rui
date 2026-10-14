/** 本地构建的默认地址；正式部署通过 SITE_URL 指定公开地址。 */
export const LOCAL_SITE_URL = 'http://localhost:4321/';

/** @param {string} base */
export function normalizeSiteBase(base) {
  if (!base.startsWith('/') || /[?#\\]/.test(base) || base.includes('..') || base.includes('//')) {
    throw new Error('SITE_BASE 必须是 / 或 /仓库名/ 这样的站内路径');
  }
  return base === '/' ? '/' : `${base.replace(/\/+$/, '')}/`;
}

/**
 * SITE_URL 可以是 origin 或包含正确部署子路径的完整站点地址。
 * @param {string} siteUrl
 * @param {string} base
 */
export function resolveSiteUrl(siteUrl, base) {
  const url = new URL(siteUrl);
  const normalizedBase = normalizeSiteBase(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('SITE_URL 必须是无凭据、查询参数或锚点的 HTTP(S) 网站地址');
  }
  const pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  if (pathname !== '/' && pathname !== normalizedBase) {
    throw new Error(`SITE_URL 的路径 ${pathname} 与 SITE_BASE ${normalizedBase} 不一致`);
  }
  return new URL(normalizedBase, url.origin).href;
}
