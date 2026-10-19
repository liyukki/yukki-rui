import { describe, expect, it } from 'vitest';
import { absolutizeFeedHtml, absolutizeSrcset, absolutizeUrl } from '../src/lib/feed-html';

/**
 * RSS 正文里的地址补全规则。
 * 页面地址带部署 base（GitHub Pages 是 /yukki-rui/），所以期望值也都带前缀，
 * 用来防止「本地好、线上图片 404」的回归。
 *
 * 注意：以 `/` 开头的引用按 URL 标准补到站点根（origin root）。Astro 渲染 HTML 时
 * 已经把部署 base 写进资源地址（子路径部署下是 `/yukki-rui/_astro/...`），
 * 所以 feed 这边只需要补 origin，不能也不该替它再猜一次 base。
 */
const PAGE = 'https://liyukki.github.io/yukki-rui/zh/posts/hello-world/';
const SITE = 'https://liyukki.github.io/yukki-rui/';

describe('absolutizeUrl', () => {
  it('站内根路径补成带 origin 的绝对地址', () => {
    expect(absolutizeUrl('/yukki-rui/_astro/pic.webp', PAGE)).toBe(`${SITE}_astro/pic.webp`);
    expect(absolutizeUrl('/zh/about/', PAGE)).toBe('https://liyukki.github.io/zh/about/');
  });

  it('相对路径以文章地址为基准解析', () => {
    expect(absolutizeUrl('./images/a.jpg', PAGE)).toBe(`${PAGE}images/a.jpg`);
    expect(absolutizeUrl('../b.png', PAGE)).toBe(`${SITE}zh/posts/b.png`);
  });

  it('已经是绝对地址、协议相对、锚点和 mailto 保持原样', () => {
    for (const ref of [
      'https://example.com/a.png',
      '//cdn.example.com/a.png',
      '#section-1',
      'mailto:me@example.com',
      'data:image/png;base64,AAAA',
    ]) {
      expect(absolutizeUrl(ref, PAGE)).toBe(ref);
    }
  });

  it('无法解析的引用原样返回', () => {
    const broken = 'http://[bad';
    expect(absolutizeUrl(broken, PAGE)).toBe(broken);
  });

  it('中文文件名保持百分号编码后的合法地址', () => {
    expect(absolutizeUrl('/yukki-rui/_astro/%E4%BD%A0.webp', PAGE)).toBe(
      `${SITE}_astro/%E4%BD%A0.webp`,
    );
  });
});

describe('absolutizeSrcset', () => {
  it('逐项补全并保留 1x / 640w 描述符', () => {
    const result = absolutizeSrcset('./a.jpg 1x, ./b.jpg 2x', PAGE);
    expect(result).toContain(`${PAGE}a.jpg 1x`);
    expect(result).toContain(`${PAGE}b.jpg 2x`);
  });

  it('单地址 srcset 也能补全', () => {
    expect(absolutizeSrcset('/yukki-rui/_astro/c.webp', PAGE)).toBe(
      'https://liyukki.github.io/yukki-rui/_astro/c.webp',
    );
  });
});

describe('absolutizeFeedHtml', () => {
  it('img 的 src 与 a 的 href 都补成绝对地址，其余标记原样保留', () => {
    const html =
      '<p>正文</p><img src="/yukki-rui/_astro/pic.webp" alt="图"><a href="./about/">关于</a>';
    expect(absolutizeFeedHtml(html, PAGE)).toBe(
      `<p>正文</p><img src="${SITE}_astro/pic.webp" alt="图"><a href="${PAGE}about/">关于</a>`,
    );
  });

  it('单引号属性统一成双引号，且不破坏引号内的 URL', () => {
    const html = "<a href='./x/'>x</a>";
    expect(absolutizeFeedHtml(html, PAGE)).toBe(`<a href="${PAGE}x/">x</a>`);
  });

  it('query 里的 & 回写时保持 HTML 实体，避免出现裸 &', () => {
    const html = '<a href="/yukki-rui/zh/search/?q=a&amp;b=1">搜索</a>';
    expect(absolutizeFeedHtml(html, PAGE)).toContain(
      'href="https://liyukki.github.io/yukki-rui/zh/search/?q=a&amp;b=1"',
    );
  });

  it('只动地址属性，不碰正文文本和普通属性', () => {
    const html = '<p class="note">a &lt; b 且 <code>href="x"</code></p>';
    expect(absolutizeFeedHtml(html, PAGE)).toBe(html);
  });

  it('重复处理不会二次改写（幂等）', () => {
    const once = absolutizeFeedHtml('<img src="./a.png"><a href="/zh/">首页</a>', PAGE);
    expect(absolutizeFeedHtml(once, PAGE)).toBe(once);
  });

  it('srcset 也补全', () => {
    const result = absolutizeFeedHtml('<img src="./a.png" srcset="./a.png 1x, ./b.png 2x">', PAGE);
    expect(result).toContain(`srcset="${PAGE}a.png 1x,`);
    expect(result).toContain(`${PAGE}b.png 2x`);
  });
});
