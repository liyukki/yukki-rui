/**
 * RSS 正文 HTML 的收尾处理：把所有站内相对地址补成绝对地址。
 *
 * 为什么必须做：正文由 Astro 的渲染管线产出，图片是 `/_astro/xx.webp`、
 * 站内链接是 `/zh/posts/yy/` 这类相对路径。网页里它们相对当前页面解析，
 * 但订阅器只知道 feed 的 XML，没有「当前页面」概念 —— 不补绝对地址，
 * 绝大多数阅读器里的图片会 404，链接会跳到错误站点。
 *
 * 这里刻意不依赖 Astro 虚拟模块：纯函数，交给 vitest 覆盖；
 * 路径与部署 base 的组合仍由调用方传入的 siteUrl 负责。
 */

/** 这些值不需要补全：已有 scheme（https:、mailto:、data:）、协议相对（//）或纯锚点。 */
const ALREADY_ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** 需要补全的普通地址属性；srcset 单独处理。 */
const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'poster',
  'cite',
  'action',
  'formaction',
  'data',
  'xlink:href',
]);

/** img/source 的响应式地址属性。 */
const SRCSET_ATTRIBUTES = new Set(['srcset', 'imagesrcset']);

/** 内容按 HTML 原始文本处理、不能当标签扫描的元素。 */
const RAW_TEXT_ELEMENTS = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'plaintext',
  'pre',
]);

const ATTRIBUTE_PATTERN = /(\s+)([^\s=/>]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
const TAG_NAME_PATTERN = /^<\s*([a-zA-Z][^\s/>]*)/;

/** 还原属性值里的 HTML 实体，避免把 `&amp;` 当成 URL 的一部分再编码一次。 */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      } catch {
        return _match;
      }
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(decimal, 10));
      } catch {
        return _match;
      }
    })
    .replace(/&amp;/g, '&');
}

/** 反过来：写回 HTML 属性时必须再转义，否则 `&`/`"` 会破坏标记。 */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** 部署站点的根路径。根部署返回 `/`，子路径部署返回带首尾斜杠的路径。 */
function siteRootPath(siteUrl: string | undefined): string | undefined {
  if (!siteUrl) return undefined;
  try {
    const path = new URL(siteUrl).pathname || '/';
    return path.endsWith('/') ? path : `${path}/`;
  } catch {
    return undefined;
  }
}

/**
 * 把单个引用补成绝对地址；不能解析的（`#anchor`、`mailto:`、非法串）原样返回，
 * 保证正文不会因为一条怪链接整段坏掉。
 *
 * siteUrl 是可选的部署站点地址。传入时，`/zh/about/` 这类作者手写的根路径
 * 会补上部署 base；已经带 base 的 `/yukki-rui/...` 不会重复添加。
 */
export function absolutizeUrl(ref: string, baseUrl: string, siteUrl?: string): string {
  const value = ref.trim();
  if (!value || ALREADY_ABSOLUTE.test(value)) return ref;
  try {
    if (value.startsWith('/')) {
      const site = siteUrl ? new URL(siteUrl) : null;
      const rootPath = siteRootPath(siteUrl);
      if (site && rootPath && rootPath !== '/') {
        const rootWithoutSlash = rootPath.slice(0, -1);
        const pathnameEnd = value.search(/[?#]/);
        const pathname = pathnameEnd === -1 ? value : value.slice(0, pathnameEnd);
        const absolutePath =
          pathname === rootWithoutSlash || pathname.startsWith(rootPath)
            ? value
            : `${rootPath}${value.slice(1)}`;
        return new URL(absolutePath, site.origin).href;
      }
    }
    return new URL(value, baseUrl).href;
  } catch {
    return ref;
  }
}

/**
 * `srcset` 是「地址 + 描述符」的候选列表。不能直接按逗号 split：
 * `data:image/svg+xml,%3Csvg%3E` 里的逗号属于 URL 本身。
 * 这里按 srcset 的候选语法扫描：URL 读到空白为止，描述符读到逗号为止。
 */
export function absolutizeSrcset(value: string, baseUrl: string, siteUrl?: string): string {
  const source = value;
  const output: string[] = [];
  let index = 0;

  while (index < source.length) {
    while (index < source.length && /[\s,]/.test(source[index])) index += 1;
    if (index >= source.length) break;

    let ref = '';
    const quote = source[index] === '"' || source[index] === "'" ? source[index] : '';
    if (quote) {
      index += 1;
      const start = index;
      while (index < source.length && source[index] !== quote) index += 1;
      ref = source.slice(start, index);
      if (source[index] === quote) index += 1;
    } else {
      const start = index;
      while (index < source.length && !/\s/.test(source[index])) index += 1;
      ref = source.slice(start, index);
    }

    let separatorConsumed = false;
    if (!quote && ref.endsWith(',')) {
      ref = ref.replace(/,+$/, '');
      separatorConsumed = true;
    }

    let descriptor = '';
    if (!separatorConsumed) {
      while (index < source.length && /\s/.test(source[index])) index += 1;
      const descriptorStart = index;
      while (index < source.length && source[index] !== ',') index += 1;
      descriptor = source.slice(descriptorStart, index).trim();
    }

    const absolute = absolutizeUrl(decodeEntities(ref), baseUrl, siteUrl);
    output.push(descriptor ? `${absolute} ${descriptor}` : absolute);

    if (index < source.length && source[index] === ',') index += 1;
  }

  return output.join(', ');
}

/** 找到真正结束当前标签的 `>`，跳过引号内的 `>`。 */
function findTagEnd(html: string, start: number): number {
  let quote = '';
  for (let index = start + 1; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return index;
  }
  return -1;
}

/** 只改真实标签里的地址属性；文本节点、注释和原始文本元素保持原样。 */
function rewriteTagAttributes(tag: string, baseUrl: string, siteUrl?: string): string {
  return tag.replace(
    ATTRIBUTE_PATTERN,
    (_match, leading: string, name: string, equals: string, doubleQuoted?: string, singleQuoted?: string, unquoted?: string) => {
      const lowerName = name.toLowerCase();
      const value = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
      if (URL_ATTRIBUTES.has(lowerName)) {
        const absolute = absolutizeUrl(decodeEntities(value), baseUrl, siteUrl);
        return `${leading}${name}${equals}"${escapeAttribute(absolute)}"`;
      }
      if (SRCSET_ATTRIBUTES.has(lowerName)) {
        const absolute = absolutizeSrcset(value, baseUrl, siteUrl);
        return `${leading}${name}${equals}"${escapeAttribute(absolute)}"`;
      }
      return _match;
    },
  );
}

/**
 * 补全正文 HTML 里所有相对地址。
 *
 * @param html Astro 渲染出的正文 HTML
 * @param pageUrl 该文章的绝对地址（含部署 base），相对地址以它为基准解析
 * @param siteUrl 部署站点根地址；用于给作者手写的 `/...` 链接补部署 base
 */
export function absolutizeFeedHtml(html: string, pageUrl: string, siteUrl?: string): string {
  let output = '';
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf('<', index);
    if (tagStart === -1) {
      output += html.slice(index);
      break;
    }
    output += html.slice(index, tagStart);

    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = html.indexOf('-->', tagStart + 4);
      if (commentEnd === -1) {
        output += html.slice(tagStart);
        break;
      }
      output += html.slice(tagStart, commentEnd + 3);
      index = commentEnd + 3;
      continue;
    }

    const next = html[tagStart + 1] ?? '';
    if (!/[a-zA-Z/!?]/.test(next)) {
      output += '<';
      index = tagStart + 1;
      continue;
    }

    const tagEnd = findTagEnd(html, tagStart);
    if (tagEnd === -1) {
      output += html.slice(tagStart);
      break;
    }

    const tag = html.slice(tagStart, tagEnd + 1);
    const closing = /^<\s*\//.test(tag);
    const declaration = /^<\s*[!?]/.test(tag);
    const nameMatch = closing || declaration ? null : TAG_NAME_PATTERN.exec(tag);
    const tagName = nameMatch?.[1]?.toLowerCase() ?? '';

    output += closing || declaration ? tag : rewriteTagAttributes(tag, pageUrl, siteUrl);
    index = tagEnd + 1;

    if (tagName && RAW_TEXT_ELEMENTS.has(tagName) && !/\/\s*>$/.test(tag)) {
      if (tagName === 'plaintext') {
        output += html.slice(index);
        break;
      }
      const closingStart = html.toLowerCase().indexOf(`</${tagName}`, index);
      if (closingStart === -1) {
        output += html.slice(index);
        break;
      }
      output += html.slice(index, closingStart);
      index = closingStart;
    }
  }

  return output;
}
