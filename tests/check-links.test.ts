import { describe, expect, it } from 'vitest';
import { extractRefs, resolveRef } from '../scripts/check-links.mjs';

describe('extractRefs', () => {
  it('抽出 a[href] 与 link[href]', () => {
    const html = '<a href="/zh/">首页</a><link rel="stylesheet" href="/_astro/x.css">';
    expect(extractRefs(html)).toEqual(['/zh/', '/_astro/x.css']);
  });

  it('忽略外部链接、mailto 与纯锚点', () => {
    const html =
      '<a href="https://x.com">x</a><a href="mailto:a@b.c">m</a><a href="#top">t</a>';
    expect(extractRefs(html)).toEqual([]);
  });

  it('抽出 img[src] 与 script[src]', () => {
    const html = '<img src="/og-default.png" alt=""><script src="/a.js"></script>';
    expect(extractRefs(html)).toEqual(['/og-default.png', '/a.js']);
  });

  it('只认双引号属性（Astro 产物统一是双引号）', () => {
    const html = "<a href='/zh/'>单引号</a>";
    expect(extractRefs(html)).toEqual([]);
  });
});

describe('resolveRef', () => {
  const existing = ['zh/index.html', 'en/index.html', '_astro/x.css', 'og-default.png'];
  const fileExists = (p) => existing.includes(p);

  it('根部署下解析目录链接', () => {
    expect(resolveRef('/zh/', '/', fileExists)).toBe('ok');
  });

  it('子路径部署下先剥掉 base 前缀再解析', () => {
    expect(resolveRef('/yukki-rui/zh/', '/yukki-rui', fileExists)).toBe('ok');
  });

  it('子路径 base 带结尾斜杠时也能剥掉', () => {
    expect(resolveRef('/yukki-rui/zh/', '/yukki-rui/', fileExists)).toBe('ok');
  });

  it('解析静态资源文件', () => {
    expect(resolveRef('/og-default.png', '/', fileExists)).toBe('ok');
  });

  it('缺失文件报 missing', () => {
    expect(resolveRef('/nope/', '/', fileExists)).toBe('missing');
  });

  it('外部链接不参与检查', () => {
    expect(resolveRef('https://example.com', '/', fileExists)).toBe('external');
  });

  it('引用的路径不在 dist 里就报 missing', () => {
    expect(resolveRef('/yukki-rui/nope/', '/yukki-rui', fileExists)).toBe('missing');
  });
});

/**
 * 重要限制：本检查器**无法**发现「内链漏写 base 前缀」这类 bug。
 *
 * 原因：dist 里同时存在 index.html 和 zh/index.html，而检查器会把
 * 引用的 base 前缀剥掉（或不剥）后直接在磁盘上找文件 —— 两种写法都能找到。
 *
 * 因此抓这类 bug 只能靠「双 base 并行构建 + 产物 diff」：
 * 见 scripts/check-base-parity.mjs。
 */
describe('已知限制的显式记录', () => {
  const existing = ['zh/index.html'];
  const fileExists = (p) => existing.includes(p);

  it('漏写 base 的链接在子路径部署下也会被判为 ok（所以需要 base-parity 检查）', () => {
    expect(resolveRef('/zh/', '/yukki-rui', fileExists)).toBe('ok');
  });
});
