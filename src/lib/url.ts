/**
 * 站内链接助手。
 *
 * 为什么必须用它：`import.meta.env.BASE_URL` 的值在两种部署下分别是
 *   Cloudflare Pages → "/"
 *   GitHub Pages     → "/yukki-rui"      ← 注意：没有结尾斜杠
 * 实测直接拼接会得到 "/yukki-ruizh/"，线上必然 404。
 *
 * 本文件把两种 base 的差异收敛在一处，其余代码只写相对路径。
 */

/**
 * 纯字符串逻辑，base 通过参数注入 —— 因此可以被单元测试覆盖。
 * （withBase 依赖 import.meta.env，在 vitest 下无法切换两种 base。）
 */
export function joinBase(base: string, path: string): string {
  const clean = path.replace(/^\/+/, '');
  const root = base.endsWith('/') ? base : `${base}/`;
  return clean === '' ? root : root + clean;
}

const BASE = import.meta.env.BASE_URL;

/** 把站内相对路径补上部署 base。所有内链都必须经过它。 */
export function withBase(path: string): string {
  return joinBase(BASE, path);
}

/** 语言首页链接：langHref('zh') -> '/zh/'，子路径部署下 -> '/yukki-rui/zh/' */
export function langHref(lang: 'zh' | 'en'): string {
  return withBase(`${lang}/`);
}

/** 文章链接：postHref('zh', 'hello-world') -> '/zh/posts/hello-world/' */
export function postHref(lang: 'zh' | 'en', id: string): string {
  return withBase(`${lang}/posts/${id}/`);
}

/** 标签页链接：tagHref('zh', '随笔') -> '/zh/tags/随笔/' */
export function tagHref(lang: 'zh' | 'en', tag: string): string {
  return withBase(`${lang}/tags/${tag}/`);
}
