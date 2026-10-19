#!/usr/bin/env node
/**
 * 分享图与结构化数据的发布门槛。
 *
 * 为什么单独一个脚本:OG 图是构建期渲染出来的二进制产物,单纯“文件存在”挡不住
 * 字体缺失导致的空白卡片;JSON-LD 又是内联在页面里的字符串,拼错了构建也不会报错。
 * 这里直接读 dist(不用浏览器),把这两件事一起验完,好放进 CI 的发布门槛。
 *
 * 期望值按页面类型区分:
 *   post     每篇文章一张 1200×630 的卡片图 + BlogPosting 结构化数据
 *   home     首页继续用默认图 + WebSite 结构化数据
 *   page     关于/标签/归档/搜索页继续用默认图(结构化数据可有可无,有就必须能解析)
 *   redirect 根目录跳转页,这两样都不要求
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { LOCAL_SITE_URL } from '../src/lib/site-config.mjs';

const distDir = process.env.DIST_DIR ?? 'dist';
const problems = [];
const fail = (page, message) => problems.push(`${page}: ${message}`);

/** 分享图尺寸(与 src/lib/og.ts 保持一致)。 */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
/** 文章卡片的配色,同样对齐 src/lib/og.ts 的 COLORS。 */
const BACKGROUND = '#fdf3e3';
const TEXT = '#2c2438';
const ACCENT = '#f5a623';

const toRgb = (hex) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));

/** 8 位 RGB/RGBA 的最小 PNG 解码器:只为数像素,不引第三方依赖。 */
function decodePng(buffer) {
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG 文件');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`只支持 8 位 RGB/RGBA 的 PNG,当前 bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    const line = raw.subarray(cursor + 1, cursor + 1 + stride);
    cursor += 1 + stride;
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous ? previous[x] : 0;
      const upLeft = previous && x >= channels ? previous[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const distanceLeft = Math.abs(estimate - left);
        const distanceUp = Math.abs(estimate - up);
        const distanceUpLeft = Math.abs(estimate - upLeft);
        value += distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft ? left : distanceUp <= distanceUpLeft ? up : upLeft;
      } else if (filter !== 0) throw new Error(`未知的行过滤器 ${filter}`);
      row[x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels, stride };
}

/** 统计卡片配色像素、颜色总数与最高频颜色占比(用来判断“不是一张空白图”)。 */
function measure(png) {
  const wanted = [toRgb(BACKGROUND), toRgb(TEXT), toRgb(ACCENT)];
  const counts = [0, 0, 0];
  const colors = new Map();
  const total = png.width * png.height;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const at = y * png.stride + x * png.channels;
      const rgb = [png.pixels[at], png.pixels[at + 1], png.pixels[at + 2]];
      const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      colors.set(key, (colors.get(key) ?? 0) + 1);
      for (let index = 0; index < wanted.length; index += 1) {
        const target = wanted[index];
        if (Math.abs(rgb[0] - target[0]) <= 8 && Math.abs(rgb[1] - target[1]) <= 8 && Math.abs(rgb[2] - target[2]) <= 8) counts[index] += 1;
      }
    }
  }
  const dominant = Math.max(...colors.values());
  return { background: counts[0], text: counts[1], accent: counts[2], colors: colors.size, dominantShare: dominant / total };
}

const meta = (html, property) => (html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i')) ?? [, ''])[1];
const link = (html, rel) => (html.match(new RegExp(`<link[^>]*rel=["']${rel}["'][^>]*href=["']([^"']*)["']`, 'i')) ?? [, ''])[1];

function readJsonLd(html, page) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  return blocks.map((block) => {
    try {
      return JSON.parse(block);
    } catch (error) {
      fail(page, `JSON-LD 无法解析(${error.message})`);
      return null;
    }
  }).filter(Boolean);
}

const origin = new URL(process.env.SITE_URL ?? LOCAL_SITE_URL).origin;
const base = (process.env.SITE_BASE ?? '/').replace(/\/*$/, '/');

/** 把 og:image 的绝对地址换算成 dist 内的文件路径。 */
function imageToFile(url, page) {
  let parsed;
  try {
    parsed = new URL(url, origin);
  } catch {
    fail(page, `og:image 不是合法地址:${url}`);
    return null;
  }
  if (parsed.origin !== origin) {
    fail(page, `og:image 指向外部域名:${url}`);
    return null;
  }
  const withoutBase = parsed.pathname.startsWith(base) ? parsed.pathname.slice(base.length) : parsed.pathname.replace(/^\//, '');
  return decodeURIComponent(withoutBase);
}

function checkImage(file, page, kind) {
  if (!file) return;
  const target = join(distDir, file);
  if (!existsSync(target)) {
    fail(page, `og:image 指向的文件不存在:${file}`);
    return;
  }
  let png;
  try {
    png = decodePng(readFileSync(target));
  } catch (error) {
    fail(page, `og:image 不是可读的 PNG(${error.message})`);
    return;
  }
  if (png.width !== OG_WIDTH || png.height !== OG_HEIGHT) {
    fail(page, `分享图尺寸是 ${png.width}×${png.height},应为 ${OG_WIDTH}×${OG_HEIGHT}`);
    return;
  }
  const ink = measure(png);
  if (kind !== 'card') {
    // 默认图沿用旧的深色设计,只要求“不是纯色空白”。
    if (ink.colors < 20) fail(page, `分享图颜色过于单一(仅 ${ink.colors} 种),疑似渲染失败`);
    if (ink.dominantShare > 0.995) fail(page, `分享图${(ink.dominantShare * 100).toFixed(1)}% 是同一个颜色,疑似空白图`);
    return;
  }
  if (ink.background < png.width * png.height * 0.4) fail(page, `分享图背景占比过低(${ink.background} 像素)`);
  // 空卡片(字体没加载、渲染失败)时下面这些像素会几乎为零。
  if (ink.text < 200) fail(page, `分享图上看不到正文色像素(仅 ${ink.text} 个),疑似渲染成空白卡片`);
  if (ink.accent < 100) fail(page, `分享图缺少强调色装饰(仅 ${ink.accent} 个像素)`);
  if (ink.colors < 20) fail(page, `分享图颜色过于单一(仅 ${ink.colors} 种),疑似渲染失败`);
}

function listPages() {
  const pages = [];
  for (const lang of ['zh', 'en']) {
    const posts = join(distDir, lang, 'posts');
    if (existsSync(posts)) {
      for (const entry of readdirSync(posts)) {
        const file = join(posts, entry, 'index.html');
        if (existsSync(file)) pages.push({ file, page: `${lang}/posts/${entry}/`, lang, kind: 'post' });
      }
    }
    const home = join(distDir, lang, 'index.html');
    if (existsSync(home)) pages.push({ file: home, page: `${lang}/`, lang, kind: 'home' });
    for (const name of ['about', 'tags', 'archive', 'search']) {
      const file = join(distDir, lang, name, 'index.html');
      if (existsSync(file)) pages.push({ file, page: `${lang}/${name}/`, lang, kind: 'page' });
    }
  }
  const root = join(distDir, 'index.html');
  if (existsSync(root)) pages.push({ file: root, page: 'index.html', lang: 'zh', kind: 'redirect' });
  return pages;
}

const pages = listPages();
if (pages.length === 0) {
  console.error('没有找到 dist 页面,先运行 npm run build。');
  process.exitCode = 1;
} else {
  let cards = 0;
  let structured = 0;
  for (const { file, page, lang, kind } of pages) {
    const html = readFileSync(file, 'utf8');
    const expectedLanguage = lang === 'zh' ? 'zh-CN' : 'en';

    if (kind !== 'redirect') {
      const image = meta(html, 'og:image');
      const resolved = image ? imageToFile(image, page) : null;
      if (!image) fail(page, '缺少 og:image');
      else if (kind === 'post' && resolved === 'og-default.png') fail(page, '文章页仍在使用默认分享图');
      else if (kind !== 'post' && resolved !== 'og-default.png') fail(page, `非文章页应继续使用默认分享图,现在是 ${resolved}`);
      checkImage(resolved, page, kind === 'post' ? 'card' : 'default');
      if (kind === 'post') cards += 1;
    }

    const blocks = readJsonLd(html, page);
    structured += blocks.length;
    if (kind === 'post' && blocks.length === 0) fail(page, '缺少 JSON-LD 结构化数据');
    for (const data of blocks) {
      if (data['@context'] !== 'https://schema.org') fail(page, '@context 不是 https://schema.org');
      if (kind === 'post') {
        if (data['@type'] !== 'BlogPosting') fail(page, `文章页 JSON-LD 类型是 ${data['@type']},应为 BlogPosting`);
        const title = meta(html, 'og:title');
        if (!data.headline) fail(page, 'JSON-LD 缺少 headline');
        else if (title && data.headline !== title) fail(page, `JSON-LD headline 与 og:title 不一致:${data.headline} / ${title}`);
        if (!data.description) fail(page, 'JSON-LD 缺少 description');
        if (Number.isNaN(Date.parse(data.datePublished ?? ''))) fail(page, `datePublished 不是合法时间:${data.datePublished}`);
        if (Number.isNaN(Date.parse(data.dateModified ?? ''))) fail(page, `dateModified 不是合法时间:${data.dateModified}`);
        if (data.image !== meta(html, 'og:image')) fail(page, 'JSON-LD image 与 og:image 不一致');
        if (data.mainEntityOfPage !== link(html, 'canonical')) fail(page, 'JSON-LD mainEntityOfPage 与 canonical 不一致');
        if (data.inLanguage !== expectedLanguage) fail(page, `JSON-LD inLanguage 是 ${data.inLanguage},与页面语言不一致`);
        if (!data.keywords) fail(page, 'JSON-LD 缺少 keywords');
        if (data.author?.['@type'] !== 'Person' || !data.author.name) fail(page, 'JSON-LD 缺少 author');
        if (data.publisher?.['@type'] !== 'Organization' || !data.publisher.name) fail(page, 'JSON-LD 缺少 publisher');
      }
      if (data['@type'] === 'WebSite') {
        if (data.url !== link(html, 'canonical')) fail(page, 'WebSite JSON-LD 的 url 与 canonical 不一致');
        if (data.inLanguage !== expectedLanguage) fail(page, `WebSite inLanguage 是 ${data.inLanguage},与页面语言不一致`);
      }
    }
    if (kind === 'home' && !blocks.some((data) => data['@type'] === 'WebSite')) fail(page, '首页缺少 WebSite JSON-LD');
    if ([...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].some((match) => match[1].includes('<'))) {
      fail(page, 'JSON-LD 里出现了未转义的 <,有提前闭合 script 的风险');
    }
  }

  if (problems.length) {
    console.error(`分享图/结构化数据检查未通过(${problems.length} 项):
${problems.map((problem) => `  ${problem}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${pages.length} 个页面:og:image 与 JSON-LD(${structured} 块)自洽;${cards} 张文章分享图均为 ${OG_WIDTH}×${OG_HEIGHT} 且确有渲染内容`);
  }
}

