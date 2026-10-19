/**
 * RSS 正文 HTML 的收尾处理：把所有站内相对地址补成绝对地址。
 *
 * 为什么必须做：正文由 Astro 的渲染管线产出，图片是 `/_astro/xx.webp`、
 * 站内链接是 `/zh/posts/yy/` 这类相对路径。网页里它们相对当前页面解析，
 * 但订阅器只知道 feed 的 XML，没有「当前页面」概念 —— 不补绝对地址，
 * 绝大多数阅读器里的图片会 404，链接会跳到错误站点。
 *
 * 这里刻意不依赖 Astro 虚拟模块：纯函数，交给 vitest 覆盖；
 * 路径与部署 base 的组合仍由 url.ts 负责。
 */

/** 这些值不需要补全：已有 scheme（https:、mailto:、data:）、协议相对（//）或纯锚点。 */
const ALREADY_ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** 需要补全的地址属性；srcset 单独处理。 */
const URL_ATTRIBUTES = 'href|src|poster|cite';
const ATTRIBUTE_PATTERN = new RegExp(`(\\s(?:${URL_ATTRIBUTES})\\s*=\\s*)("([^"]*)"|'([^']*)')`, 'gi');
const SRCSET_PATTERN = /(\ssrcset\s*=\s*)("([^"]*)"|'([^']*)')/gi;

/** 还原属性值里的 HTML 实体，避免把 `&amp;` 当成 URL 的一部分再编码一次。 */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** 反过来：写回 HTML 属性时必须再转义，否则 `&`/`"` 会破坏标记。 */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * 把单个引用补成绝对地址；不能解析的（`#anchor`、`mailto:`、非法串）原样返回，
 * 保证正文不会因为一条怪链接整段坏掉。
 */
export function absolutizeUrl(ref: string, baseUrl: string): string {
  const value = ref.trim();
  if (!value || ALREADY_ABSOLUTE.test(value)) return ref;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return ref;
  }
}

/** `srcset` 是「地址 + 描述符」的逗号列表，逐个补全，保留 `1x`/`640w` 等描述符。 */
export function absolutizeSrcset(value: string, baseUrl: string): string {
  return value
    .split(',')
    .map((part) => {
      const match = /^(\s*)(\S+)(.*)$/.exec(part);
      if (!match) return part;
      const [, leading, ref, descriptor] = match;
      return `${leading}${absolutizeUrl(decodeEntities(ref), baseUrl)}${descriptor}`;
    })
    .join(',');
}

/**
 * 补全正文 HTML 里所有相对地址。
 *
 * @param html Astro 渲染出的正文 HTML
 * @param pageUrl 该文章的绝对地址（含部署 base），相对地址以它为基准解析
 */
export function absolutizeFeedHtml(html: string, pageUrl: string): string {
  return html
    .replace(ATTRIBUTE_PATTERN, (_match, prefix: string, _quoted: string, doubleQuoted: string, singleQuoted: string) => {
      const value = doubleQuoted ?? singleQuoted ?? '';
      return `${prefix}"${escapeAttribute(absolutizeUrl(decodeEntities(value), pageUrl))}"`;
    })
    .replace(SRCSET_PATTERN, (_match, prefix: string, _quoted: string, doubleQuoted: string, singleQuoted: string) => {
      const value = doubleQuoted ?? singleQuoted ?? '';
      return `${prefix}"${escapeAttribute(absolutizeSrcset(value, pageUrl))}"`;
    });
}
