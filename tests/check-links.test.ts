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

  it('也检查单引号属性与相对链接', () => {
    const html = "<a href='/zh/'>单引号</a>";
    expect(extractRefs(html)).toEqual(['/zh/']);
    expect(extractRefs('<a href="../about/">关于</a>')).toEqual(['../about/']);
  });
});

describe('resolveRef', () => {
  const existing = ['zh/index.html', 'en/index.html', '_astro/x.css', 'og-default.png'];
  const fileExists = (p: string) => existing.includes(p);

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

describe('部署路径与实际页面引用', () => {
  const existing = ['zh/index.html'];
  const fileExists = (p: string) => existing.includes(p);

  it('目标文件存在也必须拒绝漏写部署前缀的链接', () => {
    expect(resolveRef('/zh/', '/yukki-rui', fileExists)).toBe('missing');
  });

  it('前缀必须在完整路径段边界匹配', () => {
    expect(resolveRef('/yukki-ruizh/', '/yukki-rui', fileExists)).toBe('missing');
  });

  it('根据引用所在页面解析相对路径', () => {
    expect(resolveRef('../../', '/yukki-rui', fileExists, 'zh/posts/hello/index.html')).toBe('ok');
    expect(resolveRef('../missing/', '/yukki-rui', fileExists, 'zh/index.html')).toBe('missing');
  });

  it('去掉查询参数和锚点后检查目标文件', () => {
    expect(resolveRef('/yukki-rui/zh/?view=list#top', '/yukki-rui', fileExists)).toBe('ok');
  });

  it('中文路径先解码再对应磁盘文件', () => {
    expect(resolveRef('/yukki-rui/zh/tags/%E9%9A%8F%E7%AC%94/', '/yukki-rui', p => p === 'zh/tags/随笔/index.html')).toBe('ok');
  });

  it('同站绝对链接也检查部署前缀和目标文件', () => {
    const site = 'https://owner.github.io/yukki-rui/';
    expect(resolveRef('https://owner.github.io/zh/', '/yukki-rui', fileExists, 'index.html', site)).toBe('missing');
    expect(resolveRef('https://owner.github.io/yukki-rui/zh/', '/yukki-rui', fileExists, 'index.html', site)).toBe('ok');
    expect(resolveRef('https://other.test/zh/', '/yukki-rui', fileExists, 'index.html', site)).toBe('external');
  });

  it('非法百分号编码作为坏链接报告而不崩溃', () => {
    expect(resolveRef('/yukki-rui/%broken/', '/yukki-rui', fileExists)).toBe('missing');
  });
});
