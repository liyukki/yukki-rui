import { describe, expect, it } from 'vitest';
import { absolutizeFeedHtml, absolutizeSrcset, absolutizeUrl } from '../src/lib/feed-html';

/**
 * RSS 正文里的地址补全规则。
 * 页面地址带部署 base（GitHub Pages 是 /yukki-rui/），所以期望值也都带前缀，
 * 用来防止「本地好、线上图片 404」的回归。
 *
 * 根路径引用必须显式按站点根解析：Astro 生成的资源地址通常已经带部署 base，
 * 但作者手写的 `/zh/about/` 不会。站点根由 siteUrl 传入，不能只看 origin。
 */
const PAGE = 'https://liyukki.github.io/yukki-rui/zh/posts/hello-world/';
const SITE = 'https://liyukki.github.io/yukki-rui/';

describe('absolutizeUrl', () => {
  it('根路径引用补成带部署 base 的绝对地址', () => {
    expect(absolutizeUrl('/yukki-rui/_astro/pic.webp', PAGE, SITE)).toBe(`${SITE}_astro/pic.webp`);
    expect(absolutizeUrl('/zh/about/', PAGE, SITE)).toBe(`${SITE}zh/about/`);
  });

  it('已经带部署 base 的根路径不会被重复加前缀', () => {
    expect(absolutizeUrl('/yukki-rui/zh/about/', PAGE, SITE)).toBe(`${SITE}zh/about/`);
    expect(absolutizeUrl('/yukki-rui?from=feed', PAGE, SITE)).toBe(
      'https://liyukki.github.io/yukki-rui?from=feed',
    );
    expect(absolutizeUrl('/yukki-rui#top', PAGE, SITE)).toBe(
      'https://liyukki.github.io/yukki-rui#top',
    );
  });

  it('根路径在根部署下仍按 origin 解析', () => {
    const rootPage = 'https://yukki-rui.pages.dev/zh/posts/hello-world/';
    const rootSite = 'https://yukki-rui.pages.dev/';
    expect(absolutizeUrl('/zh/about/', rootPage, rootSite)).toBe('https://yukki-rui.pages.dev/zh/about/');
  });

  it('相对路径以文章地址为基准解析', () => {
    expect(absolutizeUrl('./images/a.jpg', PAGE, SITE)).toBe(`${PAGE}images/a.jpg`);
    expect(absolutizeUrl('../b.png', PAGE, SITE)).toBe(`${SITE}zh/posts/b.png`);
  });

  it('已经是绝对地址、协议相对、锚点和 mailto 保持原样', () => {
    for (const ref of [
      'https://example.com/a.png',
      '//cdn.example.com/a.png',
      '#section-1',
      'mailto:me@example.com',
      'tel:+85212345678',
      'data:image/png;base64,AAAA',
    ]) {
      expect(absolutizeUrl(ref, PAGE, SITE)).toBe(ref);
    }
  });

  it('无法解析的引用原样返回', () => {
    const broken = 'http://[bad';
    expect(absolutizeUrl(broken, PAGE, SITE)).toBe(broken);
  });

  it('中文文件名保持百分号编码后的合法地址', () => {
    expect(absolutizeUrl('/yukki-rui/_astro/%E4%BD%A0.webp', PAGE, SITE)).toBe(
      `${SITE}_astro/%E4%BD%A0.webp`,
    );
  });
});

describe('absolutizeSrcset', () => {
  it('逐项补全并保留 1x / 640w 描述符', () => {
    const result = absolutizeSrcset('./a.jpg 1x, ./b.jpg 2x', PAGE, SITE);
    expect(result).toContain(`${PAGE}a.jpg 1x`);
    expect(result).toContain(`${PAGE}b.jpg 2x`);
  });

  it('单地址 srcset 也能补全', () => {
    expect(absolutizeSrcset('/yukki-rui/_astro/c.webp', PAGE, SITE)).toBe(
      'https://liyukki.github.io/yukki-rui/_astro/c.webp',
    );
  });

  it('data: 地址里的逗号不会被当成候选分隔符', () => {
    const dataUrl = 'data:image/svg+xml,%3Csvg%3E';
    const result = absolutizeSrcset(`${dataUrl} 1x, ./a.png 2x`, PAGE, SITE);
    expect(result).toBe(`${dataUrl} 1x, ${PAGE}a.png 2x`);
  });

  it('只含 data: 地址的 srcset 保持原样', () => {
    const value = 'data:image/png;base64,AAAA 1x';
    expect(absolutizeSrcset(value, PAGE, SITE)).toBe(value);
  });
});

describe('absolutizeFeedHtml', () => {
  it('img 的 src 与 a 的 href 都补成绝对地址，其余标记原样保留', () => {
    const html =
      '<p>正文</p><img src="/yukki-rui/_astro/pic.webp" alt="图"><a href="./about/">关于</a>';
    expect(absolutizeFeedHtml(html, PAGE, SITE)).toBe(
      `<p>正文</p><img src="${SITE}_astro/pic.webp" alt="图"><a href="${PAGE}about/">关于</a>`,
    );
  });

  it('作者手写的根路径链接补上部署 base', () => {
    const html = '<a href="/zh/about/">关于</a>';
    expect(absolutizeFeedHtml(html, PAGE, SITE)).toBe(`<a href="${SITE}zh/about/">关于</a>`);
  });

  it('单引号属性统一成双引号，且不破坏引号内的 URL', () => {
    const html = "<a href='./x/'>x</a>";
    expect(absolutizeFeedHtml(html, PAGE, SITE)).toBe(`<a href="${PAGE}x/">x</a>`);
  });

  it('query 里的 & 回写时保持 HTML 实体，避免出现裸 &', () => {
    const html = '<a href="/yukki-rui/zh/search/?q=a&amp;b=1">搜索</a>';
    expect(absolutizeFeedHtml(html, PAGE, SITE)).toContain(
      'href="https://liyukki.github.io/yukki-rui/zh/search/?q=a&amp;b=1"',
    );
  });

  it('只动真实标签属性，不碰正文文本和普通属性', () => {
    const html = '<p class="note">Set href="./x" as the value. a &lt; b</p>';
    expect(absolutizeFeedHtml(html, PAGE, SITE)).toBe(html);
  });

  it('不碰注释、script、style、textarea 和 pre 里的文本', () => {
    const html =
      '<!-- <a href="./comment">x</a> --><script>let href = "./x";</script><style>.x{background:url(./a.png)}</style><textarea>href="./x"</textarea><pre><code>href="./x"</code></pre>';
    expect(absolutizeFeedHtml(html, PAGE, SITE)).toBe(html);
  });

  it('支持不带引号的地址属性与 xlink:href', () => {
    const html = '<img src=./a.png><svg><use xlink:href="./sprite.svg#icon"></use></svg>';
    expect(absolutizeFeedHtml(html, PAGE, SITE)).toBe(
      `<img src="${PAGE}a.png"><svg><use xlink:href="${PAGE}sprite.svg#icon"></use></svg>`,
    );
  });

  it('重复处理不会二次改写（幂等）', () => {
    const once = absolutizeFeedHtml('<img src="./a.png"><a href="/zh/">首页</a>', PAGE, SITE);
    expect(absolutizeFeedHtml(once, PAGE, SITE)).toBe(once);
  });

  it('srcset 也补全', () => {
    const result = absolutizeFeedHtml(
      '<img src="./a.png" srcset="./a.png 1x, ./b.png 2x">',
      PAGE,
      SITE,
    );
    expect(result).toContain(`srcset="${PAGE}a.png 1x,`);
    expect(result).toContain(`${PAGE}b.png 2x`);
  });

  it('srcset 里的 data: 地址保持完整', () => {
    const dataUrl = 'data:image/svg+xml,%3Csvg%3E';
    const result = absolutizeFeedHtml(
      `<img srcset="${dataUrl} 1x, ./b.png 2x">`,
      PAGE,
      SITE,
    );
    expect(result).toBe(`<img srcset="${dataUrl} 1x, ${PAGE}b.png 2x">`);
  });
});
