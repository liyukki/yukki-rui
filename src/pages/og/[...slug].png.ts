/**
 * 构建期生成每篇文章的分享图：/og/<文章 id>.png（1200×630）。
 *
 * 为什么用这个方案：站点是纯静态的，Cloudflare Pages 与 GitHub Pages 都能直接
 * 拿到同一份 PNG；不需要运行时函数、不需要浏览器截图（CI 里也装不了浏览器）。
 *
 * 字体是 OFL 授权的 Ark Pixel 像素字体（src/assets/fonts/），
 * 不放 public 是因为它只在构建时用，不进产物、不占访客带宽。
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { SITE } from '../../consts';
import { buildOgCard, OG_HEIGHT, OG_WIDTH } from '../../lib/og';
import { getPosts } from '../../lib/posts';

export async function getStaticPaths() {
  const groups = await Promise.all(SITE.langs.map(async (lang) => (await getPosts(lang)).map((post) => ({
    params: { slug: post.id },
    props: { post },
  }))));
  return groups.flat();
}

const FONT_PATH = join(process.cwd(), 'src/assets/fonts/ark-pixel-12px-proportional-zh_hans.ttf');

/** 字体只读一次：7 张图共用一个 buffer。 */
let fontPromise: Promise<Buffer> | undefined;
function loadFont(): Promise<Buffer> {
  fontPromise ??= readFile(FONT_PATH);
  return fontPromise;
}

export async function GET({ props }: { props: { post: Awaited<ReturnType<typeof getPosts>>[number] } }) {
  const { post } = props;
  const font = await loadFont();
  const lang = post.data.lang;
  const dateLabel = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
    dateStyle: 'long',
  }).format(post.data.pubDate);

  const svg = await satori(
    buildOgCard({
      title: post.data.title,
      description: post.data.description,
      lang,
      tags: post.data.tags,
      dateLabel,
      siteName: SITE.name,
      siteUrl: new URL(SITE.url).host,
    }) as Parameters<typeof satori>[0],
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: [{ name: 'Ark Pixel', data: font, weight: 400, style: 'normal' }],
    },
  );

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  return new Response(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
