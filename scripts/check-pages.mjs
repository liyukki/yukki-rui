// 现在 / 作品 / 最近在听三页的端到端自检:默认起静态服务跑 dist,也可用 LIVE_ORIGIN / LIVE_BASE 跑线上。
// 覆盖导航入口、内容渲染(标题/条目/状态/外链)、双语对应页、description 与窄屏布局。
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve('dist');
const PORT = 4463;
const LIVE_ORIGIN = process.env.LIVE_ORIGIN ?? '';
const ORIGIN = LIVE_ORIGIN || `http://127.0.0.1:${PORT}`;
const BASE = process.env.LIVE_BASE ?? '/';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', ORIGIN);
    let pathname = decodeURIComponent(url.pathname);
    if (BASE !== '/' && pathname.startsWith(BASE)) pathname = `/${pathname.slice(BASE.length)}`;
    let file = join(ROOT, pathname);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(PORT, '127.0.0.1', () => ok(server)));
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const server = LIVE_ORIGIN ? null : await serve();
const browser = await chromium.launch({ executablePath: process.env.CMS_OAUTH_CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const failedResponses = [];
page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('response', (res) => {
  if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`);
});

const heading = () => page.locator('.subpage-heading h1').innerText().then((text) => text.trim()).catch(() => '');
const origin = ORIGIN.replace(/\/$/, '');

try {
  // 1. 中文导航:8 项,含三张新页面且链接带 base
  await page.goto(`${origin}${BASE}zh/now/`, { waitUntil: 'load' });
  const zhNav = await page.locator('.nav-link').evaluateAll((els) => els.map((el) => el.textContent.trim()));
  check('中文导航含现在/作品/在听', zhNav.length === 8 && ['现在', '作品', '在听'].every((label) => zhNav.includes(label)), zhNav.join('/'));
  const zhHrefs = await page.locator('.nav-link').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  check(
    '导航链接指向带 base 的新页面',
    ['now', 'works', 'listening'].every((slug) => zhHrefs.some((href) => href === `${BASE}zh/${slug}/`)),
    zhHrefs.filter((href) => /now|works|listening/.test(href ?? '')).join(' '),
  );

  // 2. 现在页:标题、前言、更新于、条目
  check('现在页标题正确', (await heading()) === '现在', await heading());
  const nowIntro = (await page.locator('.subpage-heading p').first().innerText()).trim();
  check('现在页显示引言', nowIntro.length > 8, nowIntro.slice(0, 40));
  const nowUpdated = (await page.locator('.page-updated').innerText()).trim();
  check('现在页显示更新日期', /更新于\s*2026/.test(nowUpdated), nowUpdated);
  const nowItems = await page.locator('.info-item').count();
  const nowTitles = await page.locator('.info-item h2').allInnerTexts();
  check('现在页渲染条目', nowItems >= 3 && nowTitles.some((title) => title.includes('把博客做完并上线')), nowTitles.join(' / '));

  // 3. 作品页:状态徽章、外链
  await page.goto(`${origin}${BASE}zh/works/`, { waitUntil: 'load' });
  check('作品页标题正确', (await heading()) === '作品', await heading());
  const worksTitles = await page.locator('.info-item h2').allInnerTexts();
  check('作品页含这个站', worksTitles.some((title) => title.includes('yukki rui')), worksTitles.join(' / '));
  const badges = await page.locator('.info-item .status-badge').allInnerTexts();
  check('作品页显示状态徽章', badges.length >= 2 && badges.every((text) => text.trim() === 'LIVE'), badges.join(','));
  const links = await page.locator('.info-item .text-link').evaluateAll((els) => els.map((el) => ({ href: el.getAttribute('href'), target: el.getAttribute('target'), text: el.textContent.trim() })));
  const siteLink = links.find((item) => item.text.includes('线上地址'));
  const repoLink = links.find((item) => item.text.includes('GitHub'));
  check(
    '作品页有站内线上地址与仓库外链',
    links.length === 2 &&
      !!siteLink &&
      !!repoLink &&
      (siteLink.href ?? '').startsWith(BASE) &&
      siteLink.target !== '_blank' &&
      repoLink.target === '_blank' &&
      (repoLink.href ?? '').startsWith('https://github.com/'),
    links.map((item) => `${item.text}→${item.href}(${item.target ?? 'same'})`).join(' '),
  );

  // 4. 最近在听:序号、乐队名
  await page.goto(`${origin}${BASE}zh/listening/`, { waitUntil: 'load' });
  check('最近在听标题正确', (await heading()) === '最近在听', await heading());
  const indexes = await page.locator('.info-index').allInnerTexts();
  check('听歌页渲染序号', indexes.slice(0, 3).join(',') === '01,02,03', indexes.join(','));
  const trackTitles = await page.locator('.info-item h2').allInnerTexts();
  check('听歌页含 hitorie 的曲子', trackTitles.includes('loveless') && trackTitles.includes('monocolour'), trackTitles.join(' / '));
  const artistChips = await page.locator('.info-item .tech-chip').allInnerTexts();
  check('听歌页标注艺人', artistChips.some((text) => text.trim() === 'hitorie'), artistChips.join(','));

  // 5. 英文三页标题
  for (const [slug, title] of [['now', 'Now'], ['works', 'Works'], ['listening', 'Listening']]) {
    await page.goto(`${origin}${BASE}en/${slug}/`, { waitUntil: 'load' });
    check(`英文 ${slug} 页标题正确`, (await heading()) === title, await heading());
  }

  // 6. 双语对应页(hreflang)与 description
  await page.goto(`${origin}${BASE}zh/now/`, { waitUntil: 'load' });
  const alternate = await page.locator('link[rel="alternate"][hreflang="en"]').getAttribute('href').catch(() => '');
  check('现在页有英文对应页', (alternate ?? '').endsWith('/en/now/'), String(alternate));
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  check('新页面有 description', (description ?? '').trim().length > 10, String(description).slice(0, 40));

  // 7. 窄屏:三页都不横向溢出
  const mobile = await context.newPage();
  // 每个页面最少几条:作品页目前只有 2 条(本站 + 源码),所以按页面给下限。
  for (const [slug, minimum] of [['now', 3], ['works', 2], ['listening', 3]]) {
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(`${origin}${BASE}zh/${slug}/`, { waitUntil: 'load' });
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const items = await mobile.locator('.info-item').count();
    check(`窄屏 ${slug} 页无横向溢出`, overflow <= 2 && items >= minimum, `overflow=${overflow}px items=${items}`);
  }
  await mobile.close();

  // 8. 资源与脚本异常
  const failures = failedResponses.filter((item) => !item.includes('favicon'));
  check('新页面没有加载失败的资源', failures.length === 0, failures.join(' | ').slice(0, 300));
  check('无页面脚本异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
} finally {
  await browser.close().catch(() => {});
  if (server) await new Promise((ok) => server.close(ok));
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n结果:${passed}/${results.length}`);
if (passed !== results.length) process.exitCode = 1;

