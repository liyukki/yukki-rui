/**
 * 评论区的纯逻辑助手（构建期 + 运行期共用）。
 *
 * 为什么需要 thread：站点有两条部署链路 —— Cloudflare Pages（base 为 "/"）
 * 与 GitHub Pages 镜像（base 为 "/yukki-rui/"）。同一篇文章在两边
 * 的 Astro.url.pathname 不同，但评论区必须认为它们是同一篇文章，
 * 所以统一去掉 base 存成站内路径。
 */
import type { Lang } from '../consts';

/** 允许直接调用评论 API 的来源（跨域部署时用）。 */
export const COMMENTS_ALLOWED_ORIGINS = [
  'https://yukki-rui.pages.dev',
  'https://liyukki.github.io',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
] as const;

/** thread：站内绝对路径，只允许 URL 安全字符（含百分号编码）。 */
export const THREAD_PATTERN = /^\/[A-Za-z0-9._~%/-]{1,200}$/;

/** 把当前页面路径规整成评论 thread；非法输入退化为根路径。 */
export function commentThread(pathname: string, base: string): string {
  // 去掉查询串与锚点：RSS / 分享链接带来的 ?from=... 不应产生另一个 thread。
  let path = String(pathname ?? '')
    .split('#')[0]
    .split('?')[0];

  // 去掉部署 base，且只去掉完整的路径段（避免误伤 /yukki-rui-other）。
  const root = base.endsWith('/') ? base : `${base}/`;
  if (root !== '/') {
    const prefix = root.endsWith('/') ? root.slice(0, -1) : root;
    if (path === prefix) path = '/';
    else if (path.startsWith(`${prefix}/`)) path = path.slice(prefix.length);
  }

  path = `/${path}`.replace(/\/{2,}/g, '/');
  if (!path.endsWith('/')) path = `${path}/`;
  return THREAD_PATTERN.test(path) ? path : '/';
}

/**
 * 构建期决定评论 API 的地址：
 * - 与主站同源（Cloudflare 部署）→ 空串，前端走相对路径 `/api/comments`；
 * - 镜像部署（GitHub Pages）→ 主站绝对地址，前端跨域调用（CORS 白名单）。
 */
export function commentsEndpoint(siteOrigin: string, productionOrigin: string): string {
  const site = normalizeOrigin(siteOrigin);
  const production = normalizeOrigin(productionOrigin);
  if (!production || site === production) return '';
  return `${production}/api/comments`;
}

/**
 * 运行期决定请求落到哪里。
 *
 * 同源页面（Cloudflare 域名）与本机预览（wrangler pages dev）用相对路径；
 * 其余（GitHub Pages 镜像）用构建期算好的绝对地址。
 */
export function commentsApiUrl(pageOrigin: string, buildEndpoint: string): string {
  const endpoint = String(buildEndpoint ?? '').trim();
  const origin = normalizeOrigin(pageOrigin);
  if (!endpoint || isLocalOrigin(origin)) return '/api/comments';
  try {
    if (new URL(endpoint).origin === origin) return '/api/comments';
  } catch {
    return '/api/comments';
  }
  return endpoint;
}

/** 评论时间文案；非法输入返回空串（UI 会跳过时间不显示）。 */
export function formatCommentTime(iso: string, lang: Lang): string {
  const date = new Date(String(iso ?? ''));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function normalizeOrigin(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function isLocalOrigin(origin: string): boolean {
  const host = origin
    .replace(/^[a-z]+:\/\//i, '')
    .split('/')[0]
    .split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
