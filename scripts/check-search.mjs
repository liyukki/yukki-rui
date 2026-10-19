// 搜索与归档端到端自检：默认起静态服务跑 dist，也可用 LIVE_ORIGIN / LIVE_BASE 跑线上部署。
// 覆盖导航入口、归档分组、Pagefind 索引与检索、i18n 文案、索引隔离与移动端布局。
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve('dist');
const PORT = 4461;
const LIVE_ORIGIN = process.env.LIVE_ORIGIN ?? '';
const ORIGIN = LIVE_ORIGIN || `http://127.0.0.1:${PORT}`;
const BASE = process.env.LIVE_BASE ?? '/';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
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
      const fallback = join(ROOT, '404.html');
      if (existsSync(fallback)) {
        res.writeHead(404, { 'Content-Type': MIME['.html'] });
        createReadStream(fallback).pipe(res);
        return;
      }
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

// 线上首次检索要下载 wasm 与索引，不能只等固定时长；
// 等到「出现结果」或「出现无结果提示」这两个确定信号之一，再断言。
async function searchFor(term, expectResults = true) {
  const input = page.locator('.pagefind-ui__search-input');
  await input.waitFor({ timeout: 15000 });
  await input.fill('');
  await input.fill(term);
  await input.press('Enter').catch(() => {});
  await page
    .waitForFunction(
      (wantResults) => {
        const results = document.querySelectorAll('.pagefind-ui__result').length;
        const message = document.querySelector('.pagefind-ui__message')?.textContent ?? '';
        return wantResults ? results > 0 : /没有找到|No results/i.test(message);
      },
      expectResults,
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForTimeout(300);
}

try {
  // 1. 导航入口（中英各 5 项，含归档与搜索）
  await page.goto(ORIGIN + BASE, { waitUntil: 'load' });
  const zhNav = await page.locator('.nav-link').evaluateAll((els) => els.map((el) => el.textContent.trim()));
  check('中文导航 8 项且含归档与搜索', zhNav.length === 8 && zhNav.includes('归档') && zhNav.includes('搜索'), zhNav.join('/'));
  const zhNavHrefs = await page.locator('.nav-link').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  check(
    '导航链接指向带 base 的归档与搜索页',
    zhNavHrefs.some((href) => href === `${BASE}zh/archive/`) && zhNavHrefs.some((href) => href === `${BASE}zh/search/`),
    zhNavHrefs.join(' , '),
  );

  // 2. 归档页：年份分组、条目、倒序
  await page.goto(`${ORIGIN}${BASE}zh/archive/`, { waitUntil: 'load' });
  const years = await page.locator('.archive-year__title').evaluateAll((els) => els.map((el) => el.textContent.trim().slice(0, 4)));
  check('归档按年份分组', years.length >= 1 && years.every((year) => /^\d{4}$/.test(year)), years.join(','));
  const items = await page
    .locator('.archive-item')
    .evaluateAll((els) =>
      els.map((el) => ({
        date: el.querySelector('.archive-item__date')?.textContent?.trim() ?? '',
        href: el.querySelector('.archive-item__link')?.getAttribute('href') ?? '',
        title: el.querySelector('.archive-item__link')?.textContent?.trim() ?? '',
      })),
    );
  check('归档条目带日期、标题与内链', items.length >= 1 && items.every((item) => item.date && item.title && item.href.startsWith(BASE)), `${items.length} 条`);
  const counts = await page.locator('.archive-year__count').evaluateAll((els) => els.map((el) => el.textContent.trim()));
  check('每个年份标注篇数', counts.length === years.length && counts.every((text) => /\d+/.test(text)), counts.join(','));
  const dates = items.map((item) => item.date);
  const sorted = [...dates].sort((a, b) => (a < b ? 1 : -1));
  check('归档条目按日期倒序', dates.length <= 1 || dates.join() === sorted.join(), dates.join(','));

  // 3. 英文归档
  await page.goto(`${ORIGIN}${BASE}en/archive/`, { waitUntil: 'load' });
  const enItems = await page.locator('.archive-item').count();
  const enNav = await page.locator('.nav-link').evaluateAll((els) => els.map((el) => el.textContent.trim()));
  check('英文归档可用且导航为英文', enItems >= 1 && enNav.includes('Archive') && enNav.includes('Search'), `条目=${enItems}`);

  // 4. 搜索页（中文）：输入框出现、占位文案本地化
  await page.goto(`${ORIGIN}${BASE}zh/search/`, { waitUntil: 'load' });
  const placeholder = await page.locator('.pagefind-ui__search-input').getAttribute('placeholder', { timeout: 15000 });
  check('搜索框渲染且占位文案本地化', placeholder === '搜点什么…', String(placeholder));

  // 5. 中文检索命中
  await searchFor('Markdown');
  const zhResults = await page.locator('.pagefind-ui__result').count();
  const zhFirstHref = await page.locator('.pagefind-ui__result-link').first().getAttribute('href').catch(() => '');
  check('中文搜索能命中结果', zhResults >= 1, `结果=${zhResults}`);
  check('搜索结果链接指向站内文章', !!zhFirstHref && zhFirstHref.includes('/zh/posts/'), String(zhFirstHref));

  // 6. 无结果文案
  await searchFor('zzzznotfoundzzzz', false);
  const zeroText = (await page.locator('.pagefind-ui__message').innerText().catch(() => '')).trim();
  const zeroResults = await page.locator('.pagefind-ui__result').count();
  check('无结果时显示本地化提示', zeroResults === 0 && zeroText.includes('没有找到相关内容'), zeroText.slice(0, 40));

  // 7. 搜索页自身不会被索引（只索引 data-pagefind-body 的文章正文）
  await searchFor('ARCHIVE LEDGER', false);
  const selfResults = await page.locator('.pagefind-ui__result').count();
  check('搜索页与归档页自身不进索引', selfResults === 0, `结果=${selfResults}`);

  // 8. 英文检索命中
  await page.goto(`${ORIGIN}${BASE}en/search/`, { waitUntil: 'load' });
  await searchFor('Experiment');
  const enFirstHref = await page.locator('.pagefind-ui__result-link').first().getAttribute('href').catch(() => '');
  check('英文搜索能命中结果', !!enFirstHref && enFirstHref.includes('/en/posts/'), String(enFirstHref));

  // 9. 点结果能进入文章页（转场后搜索脚本可重跑）
  await page.locator('.pagefind-ui__result-link').first().click();
  await page.waitForTimeout(1500);
  const h1 = (await page.locator('article h1').innerText().catch(() => '')).trim();
  check('点击搜索结果进入文章页', h1.length > 0, h1);

  // 10. 从文章页经页头导航进入搜索页（View Transitions 后内联脚本重跑）
  await page.locator('.nav-link').filter({ hasText: /搜索|Search/ }).first().click();
  await page.locator('.pagefind-ui__search-input').waitFor({ timeout: 15000 }).catch(() => {});
  await searchFor('Markdown');
  const retryResults = await page.locator('.pagefind-ui__result').count();
  check('转场进入搜索页后仍可检索', retryResults >= 1, `结果=${retryResults}`);

  // 11. 移动端：导航与归档不横向溢出
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${ORIGIN}${BASE}zh/archive/`, { waitUntil: 'load' });
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('窄屏归档无横向溢出', mobileOverflow <= 2, `overflow=${mobileOverflow}px`);
  await mobile.goto(`${ORIGIN}${BASE}zh/search/`, { waitUntil: 'load' });
  await mobile.locator('.pagefind-ui__search-input').waitFor({ timeout: 15000 }).catch(() => {});
  const searchOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const mobileInput = await mobile.locator('.pagefind-ui__search-input').isVisible().catch(() => false);
  check('窄屏搜索页可用且无横向溢出', mobileInput && searchOverflow <= 2, `input=${mobileInput} overflow=${searchOverflow}px`);
  await mobile.close();

  // 12. 资源请求与脚本异常
  const pagefindFailures = failedResponses.filter((item) => item.includes('/pagefind/'));
  check('Pagefind 资源全部加载成功', pagefindFailures.length === 0, pagefindFailures.join(' | ').slice(0, 300));
  check('无页面脚本异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
} finally {
  await browser.close().catch(() => {});
  if (server) await new Promise((ok) => server.close(ok));
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n结果：${passed}/${results.length}`);
if (passed !== results.length) process.exitCode = 1;
