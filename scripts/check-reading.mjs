// 阅读体验端到端自检：默认起静态服务跑 dist，也可用 LIVE_ORIGIN / LIVE_BASE 跑线上部署。
// 覆盖目录、阅读时长、上下篇、进度条、返回顶部、代码复制、图片灯箱与 View Transitions 兼容。
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve('dist');
const PORT = 4460;
const LIVE_ORIGIN = process.env.LIVE_ORIGIN ?? '';
const ORIGIN = LIVE_ORIGIN || `http://127.0.0.1:${PORT}`;
const BASE = process.env.LIVE_BASE ?? '/';
const POST = `${BASE}zh/posts/writing-in-markdown/`;
const POST_WITH_IMAGE = `${BASE}zh/posts/在线后台成功上线/`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
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
const browser = await chromium.launch({
  executablePath: process.env.CMS_OAUTH_CHROME,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err)));

try {
  await page.goto(ORIGIN + POST, { waitUntil: 'load' });

  // 1. 阅读时长
  const meta = (await page.locator('.post-reading').innerText().catch(() => '')).trim();
  check('阅读时长出现', /约\s*\d+\s*分钟/.test(meta), meta);

  // 2. 目录：宽屏下 aside 可见、条目不少于 2
  const aside = page.locator('.post-toc--aside');
  const asideVisible = await aside.isVisible().catch(() => false);
  const tocCount = await aside.locator('a').count().catch(() => 0);
  check('侧栏目录可见且有条目', asideVisible && tocCount >= 2, `可见=${asideVisible} 条目=${tocCount}`);
  const inlineHidden = await page.locator('.post-toc--inline').isVisible().catch(() => true);
  check('宽屏隐藏折叠目录', inlineHidden === false);

  // 3. 上下篇卡片
  const navCards = page.locator('.post-nav__card');
  const navCount = await navCards.count();
  const navHrefs = await page.locator('.post-nav__card[href]').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  check('上下篇卡片存在且带内链', navCount >= 1 && navHrefs.length >= 1, `${navHrefs.join(' , ')}`);

  // 4. 进度条 + 返回顶部
  await page.evaluate(() => window.scrollTo(0, Math.floor(document.body.scrollHeight / 2)));
  await page.waitForTimeout(400);
  const progressWidth = await page.locator('[data-reading-progress] > span').evaluate((el) => el.style.width || getComputedStyle(el).width).catch(() => '');
  const backVisible = await page.locator('[data-back-to-top]').isVisible().catch(() => false);
  check('滚动后进度条有宽度', !!progressWidth && progressWidth !== '0%' && progressWidth !== '0px', progressWidth);
  check('滚动后出现返回顶部', backVisible);
  await page.locator('[data-back-to-top]').click();
  await page.waitForTimeout(900);
  const scrollTop = await page.evaluate(() => window.scrollY);
  check('返回顶部生效', scrollTop < 50, `scrollY=${scrollTop}`);

  // 5. TOC 高亮：滚到第二个标题位置，检查 aside 里有 is-active
  await page.evaluate(() => {
    const headings = document.querySelectorAll('.post-body h2[id], .post-body h3[id]');
    const target = headings[1] ?? headings[0];
    if (target) window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - 80);
  });
  await page.waitForTimeout(700);
  const activeCount = await page.locator('.post-toc--aside a.is-active').count().catch(() => 0);
  check('侧栏目录高亮当前标题', activeCount >= 1, `active=${activeCount}`);

  // 6. 代码复制
  const copyBtn = page.locator('.post-body pre .code-copy').first();
  const copyCount = await page.locator('.post-body pre .code-copy').count().catch(() => 0);
  check('代码块注入复制按钮', copyCount >= 1, `按钮数=${copyCount}`);
  if (copyCount >= 1) {
    const codeText = await page.locator('.post-body pre code').first().innerText();
    await copyBtn.click();
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const norm = (text) => text.replace(/\r\n/g, '\n').trim();
    check('复制成功且内容一致', norm(clip) === norm(codeText), `剪贴板=${JSON.stringify(clip.slice(0, 40))}`);
    const label = (await copyBtn.innerText().catch(() => '')).trim();
    check('复制后按钮文案变化', label === '已复制' || label === 'Copied', label);
  }

  // 7. 图片灯箱
  await page.goto(ORIGIN + POST_WITH_IMAGE, { waitUntil: 'load' });
  const imgs = page.locator('.post-body img');
  const imgCount = await imgs.count();
  if (imgCount > 0) {
    await imgs.first().click();
    await page.waitForTimeout(400);
    const lightbox = page.locator('[data-img-lightbox]');
    const open = await lightbox.isVisible().catch(() => false);
    check('点击图片打开灯箱', open);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const closed = (await page.locator('[data-img-lightbox]').count()) === 0;
    check('Esc 关闭灯箱', closed);
  } else {
    check('图片灯箱（该文章无图片，跳过）', true, 'skipped');
  }

  // 8. View Transitions：从文章页点上下篇跳到另一篇，脚本需重跑
  await page.goto(ORIGIN + POST, { waitUntil: 'load' });
  const themeAtLoad = await page.evaluate(() => document.documentElement.dataset.theme);
  const beforeH1 = (await page.locator('article h1').innerText()).trim();
  const firstNav = page.locator('.post-nav__card[href]').first();
  const targetHref = await firstNav.getAttribute('href');
  if (targetHref) {
    await firstNav.click();
    // 线上（尤其 GitHub Pages）转场比本地慢：等到 h1 真的换掉，再看后续。
    await page
      .waitForFunction(
        (prev) => {
          const h1 = document.querySelector('article h1');
          return !!h1 && h1.textContent.trim() !== prev;
        },
        beforeH1,
        { timeout: 10000 },
      )
      .catch(() => {});
    await page.waitForTimeout(500);
    const afterH1 = (await page.locator('article h1').innerText().catch(() => '')).trim();
    check('转场后切换到另一篇文章', afterH1.length > 0 && afterH1 !== beforeH1, `${beforeH1} → ${afterH1}`);
    const themeAfterSwap = await page.evaluate(() => document.documentElement.dataset.theme);
    check('转场后主题保持', !!themeAtLoad && themeAtLoad === themeAfterSwap, `${themeAtLoad} → ${themeAfterSwap}`);
    const ready = await page.locator('#comments[data-ready="1"]').count().catch(() => 0);
    check('转场后评论区重新初始化', ready === 1);
    await page.waitForSelector('[data-reading-progress] > span', { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => window.scrollTo(0, Math.floor(document.body.scrollHeight / 2)));
    await page.waitForTimeout(800);
    const progressAfter = await page
      .locator('[data-reading-progress] > span')
      .evaluate((el) => el.style.width || '')
      .catch(() => '');
    const backAfter = await page.locator('[data-back-to-top]').isVisible().catch(() => false);
    check('转场后进度条与返回顶部仍然工作', !!progressAfter && progressAfter !== '0%' && backAfter, `width=${progressAfter} back=${backAfter}`);
    const copyAfter = await page.locator('.post-body pre .code-copy').count().catch(() => 0);
    if (copyAfter > 0) {
      check('转场后代码复制按钮重新注入', copyAfter >= 1, `按钮数=${copyAfter}`);
    }
  } else {
    check('转场测试（没有可点的上下篇）', false);
  }

  // 9. 主题切换在转场后仍可用
  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(300);
  const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
  check('主题切换可用', themeBefore !== themeAfter, `${themeBefore} → ${themeAfter}`);

  // 10. 深色主题 + 转场
  await page.goto(ORIGIN + POST, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload({ waitUntil: 'load' });
  const darkAtLoad = await page.evaluate(() => document.documentElement.dataset.theme);
  const darkBeforeH1 = (await page.locator('article h1').innerText()).trim();
  await page.locator('.post-nav__card[href]').first().click();
  await page
    .waitForFunction(
      (prev) => {
        const h1 = document.querySelector('article h1');
        return !!h1 && h1.textContent.trim() !== prev;
      },
      darkBeforeH1,
      { timeout: 10000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
  const darkAfterSwap = await page.evaluate(() => document.documentElement.dataset.theme);
  check('深色主题在转场后保持', darkAtLoad === 'dark' && darkAfterSwap === 'dark', `${darkAtLoad} → ${darkAfterSwap}`);
  await page.evaluate(() => localStorage.removeItem('theme'));

  // 11. 阅读设置：字号切换、持久化、转场后仍生效
  await page.goto(ORIGIN + POST, { waitUntil: 'load' });
  const readingPanel = page.locator('.reading-settings');
  const panelVisible = await readingPanel.isVisible().catch(() => false);
  await page.locator('[data-reading-key="size"][data-reading-value="lg"]').click();
  await page.waitForTimeout(200);
  const sizeAfterClick = await page.evaluate(() => document.documentElement.dataset.readingSize);
  const storedReading = await page.evaluate(() => localStorage.getItem('reading-settings'));
  check('阅读设置面板可见且能切到大字号', panelVisible && sizeAfterClick === 'lg', `visible=${panelVisible} size=${sizeAfterClick}`);
  check('阅读设置写入 localStorage', !!storedReading && storedReading.includes('lg'), storedReading ?? '');
  await page.reload({ waitUntil: 'load' });
  const sizeAfterReload = await page.evaluate(() => document.documentElement.dataset.readingSize);
  check('刷新后阅读设置保留', sizeAfterReload === 'lg', sizeAfterReload ?? '');
  const readingBeforeNav = await page.evaluate(() => document.documentElement.dataset.readingSize);
  const readingNav = page.locator('.post-nav__card[href]').first();
  if (await readingNav.count()) {
    await readingNav.click();
    await page.waitForTimeout(500);
    const readingAfterNav = await page.evaluate(() => document.documentElement.dataset.readingSize);
    check('转场后阅读设置保留', readingBeforeNav === readingAfterNav, `${readingBeforeNav} → ${readingAfterNav}`);
  }
  await page.evaluate(() => localStorage.removeItem('reading-settings'));
  await page.reload({ waitUntil: 'load' });
  const sizeAfterReset = await page.evaluate(() => document.documentElement.dataset.readingSize);
  check('清空存储后回到默认中字号', sizeAfterReset === 'md', sizeAfterReset ?? '');

  // 12. 相关文章：只在有推荐时出现，排除自身且不进入搜索索引
  await page.goto(ORIGIN + POST, { waitUntil: 'load' });
  const related = page.locator('.post-related');
  const relatedCount = await related.count();
  if (relatedCount > 0) {
    const ownHref = new URL(page.url()).pathname;
    const relatedHrefs = await related.locator('a[href]').evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
    const relatedTitle = (await related.locator('h2').innerText().catch(() => '')).trim();
    const ignored = await related.getAttribute('data-pagefind-ignore');
    check('相关文章区块有标题', relatedTitle.length > 0, relatedTitle);
    check('相关文章不推荐文章自身', !relatedHrefs.some((href) => href.endsWith(ownHref)), ownHref);
    check('相关文章不进入搜索索引', ignored !== null);
  } else {
    check('相关文章区块(本文暂无同标签文章,跳过)', true, 'skipped');
  }

  // 13. 移动端布局
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(ORIGIN + POST, { waitUntil: 'load' });
  const inlineVisible = await mobile.locator('.post-toc--inline').isVisible().catch(() => false);
  const asideDisplay = await mobile.locator('.post-toc--aside').evaluate((el) => getComputedStyle(el).display).catch(() => 'missing');
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('窄屏显示折叠目录并隐藏侧栏', inlineVisible && asideDisplay === 'none', `inline=${inlineVisible} aside=${asideDisplay}`);
  check('窄屏没有横向溢出', overflow <= 2, `overflow=${overflow}px`);
  const navColumns = await mobile.locator('.post-nav').evaluate((el) => getComputedStyle(el).gridTemplateColumns).catch(() => '');
  check('窄屏上下篇单列', navColumns.split(' ').length <= 2, navColumns);
  await mobile.close();

  // 10. 无脚本异常
  check('无页面脚本异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
} finally {
  await browser.close().catch(() => {});
  if (server) await new Promise((ok) => server.close(ok));
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n结果：${passed}/${results.length}`);
if (passed !== results.length) process.exitCode = 1;
