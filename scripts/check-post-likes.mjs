#!/usr/bin/env node
/**
 * 文章点赞端到端自检：本地 Pages Functions + D1 + 真实浏览器。
 *
 * 覆盖：GET 初始状态、点赞、刷新持久化、中英文共享计数、取消点赞、
 * 请求锁、无脚本异常，以及跨域镜像所需的 CORS 头。
 *
 * 依赖：先 `npm run build`；playwright 与可用的 Chromium/Edge。
 * 用法：npm run check:post-likes
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.POST_LIKES_CHECK_PORT ?? 8789);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PERSIST = join(ROOT, '.tmp-post-likes-check');
const SALT = 'post-likes-check-salt';
const ZH_PATH = '/zh/posts/hello-world/';
const EN_PATH = '/en/posts/hello-worlden/';
const MIRROR_ORIGIN = 'https://liyukki.github.io';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const required = ['dist/zh/posts/hello-world/index.html', 'dist/en/posts/hello-worlden/index.html'];
const missing = required.filter((file) => !existsSync(join(ROOT, file)));
if (missing.length) {
  console.error(`缺少构建产物：${missing.join(', ')}\n先跑 npm run build。`);
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('这个自检需要 playwright：npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const logs = [];
const wranglerCommand = [
  'npx --yes wrangler@4.151.1 pages dev dist',
  `--port ${PORT}`,
  '--ip 127.0.0.1',
  '--d1=DB=post_likes_check',
  '--persist-to .tmp-post-likes-check',
  `--binding COMMENTS_SALT=${SALT}`,
].join(' ');
const wrangler = spawn(wranglerCommand, {
  cwd: ROOT,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, CI: '1', BROWSER: 'none', WRANGLER_SEND_METRICS: 'false' },
});
const record = (chunk) => {
  for (const line of String(chunk).split('\n')) {
    if (!line.trim()) continue;
    logs.push(line);
    if (logs.length > 200) logs.shift();
  }
};
wrangler.stdout.on('data', record);
wrangler.stderr.on('data', record);

function stopWrangler() {
  if (!wrangler || wrangler.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(wrangler.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    wrangler.kill('SIGTERM');
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (wrangler.exitCode !== null) return false;
    try {
      const response = await fetch(`${ORIGIN}${ZH_PATH}`);
      if (response.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await sleep(1500);
  }
  return false;
}

rmSync(PERSIST, { recursive: true, force: true });
const ready = await waitForServer();
if (!ready) {
  console.error('wrangler pages dev 没有起来，最近日志：\n' + logs.slice(-40).join('\n'));
  stopWrangler();
  process.exit(1);
}
console.log(`本地 Pages 运行时已启动：${ORIGIN}（D1 数据目录 ${PERSIST}）\n`);

let browser;
try {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  browser = await chromium.launch({
    executablePath: process.env.CMS_OAUTH_CHROME || (existsSync(edgePath) ? edgePath : undefined),
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 240)));

  const likeButton = page.locator('[data-like-button]');
  const likeCount = page.locator('[data-like-count]');
  const waitForState = (pressed, count) =>
    page.waitForFunction(
      ({ expectedPressed, expectedCount }) => {
        const button = document.querySelector('[data-like-button]');
        const countNode = document.querySelector('[data-like-count]');
        return (
          button instanceof HTMLButtonElement &&
          !button.disabled &&
          button.getAttribute('aria-pressed') === expectedPressed &&
          countNode?.textContent?.trim() === expectedCount
        );
      },
      { expectedPressed: pressed, expectedCount: count },
      { timeout: 20000 },
    );

  await page.goto(`${ORIGIN}${ZH_PATH}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForState('false', '0');

  const rootCount = await page.locator('[data-post-likes]').count();
  const zhPost = await page.locator('[data-post-likes]').getAttribute('data-post');
  const apiPath = await page.locator('[data-post-likes]').getAttribute('data-api');
  check('文章页只渲染一个点赞区', rootCount === 1, String(rootCount));
  check('中英文共享文章键', zhPost === 'translation:hello-world', zhPost ?? '');
  check('点赞接口地址正确', apiPath?.endsWith('/api/post-likes') === true, apiPath ?? '');
  check('初始未赞且计数为 0', (await likeButton.getAttribute('aria-pressed')) === 'false' && (await likeCount.innerText()) === '0');

  // 模拟一次写入失败：界面应先乐观更新，再回滚到原状态并显示错误。
  await page.route('**/api/post-likes', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test"}' });
      return;
    }
    await route.continue();
  });
  await likeButton.click();
  await waitForState('false', '0');
  const rollbackStatus = (await page.locator('[data-like-status]').innerText()).trim();
  check('写入失败时回滚计数并恢复按钮', rollbackStatus.length > 0, rollbackStatus);
  await page.unroute('**/api/post-likes');

  await likeButton.click();
  await waitForState('true', '1');
  check('点击后计数为 1 且已赞', true);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForState('true', '1');
  check('刷新后点赞状态持久化', true);

  await page.goto(`${ORIGIN}${EN_PATH}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForState('true', '1');
  const enPost = await page.locator('[data-post-likes]').getAttribute('data-post');
  check('英文页共享同一计数', enPost === zhPost && (await likeCount.innerText()) === '1');

  await likeButton.click();
  await waitForState('false', '0');
  check('在英文页取消后归零', true);

  await page.goto(`${ORIGIN}${ZH_PATH}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForState('false', '0');
  check('取消状态同步回中文页', true);

  const allowed = await fetch(`${ORIGIN}/api/post-likes?post=translation%3Ahello-world`, {
    headers: { Origin: MIRROR_ORIGIN },
  });
  check(
    'GitHub Pages 镜像跨域被放行',
    allowed.status === 200 && allowed.headers.get('access-control-allow-origin') === MIRROR_ORIGIN,
    `status=${allowed.status}`,
  );
  check('接口响应禁用缓存', (allowed.headers.get('cache-control') ?? '').includes('no-store'));

  const denied = await fetch(`${ORIGIN}/api/post-likes?post=translation%3Ahello-world`, {
    headers: { Origin: 'https://evil.example' },
  });
  check('陌生来源被拒绝', denied.status === 403 && !denied.headers.get('access-control-allow-origin'), `status=${denied.status}`);

  const options = await fetch(`${ORIGIN}/api/post-likes`, {
    method: 'OPTIONS',
    headers: {
      Origin: MIRROR_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  check(
    '镜像站 POST 预检通过',
    options.status === 204 &&
      options.headers.get('access-control-allow-origin') === MIRROR_ORIGIN &&
      (options.headers.get('access-control-allow-headers') ?? '').toLowerCase().includes('content-type'),
    `status=${options.status}`,
  );

  check('页面没有脚本异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 240));
} catch (error) {
  check('文章点赞端到端自检执行完成', false, String(error).split('\n')[0].slice(0, 240));
  console.error('\n最近 wrangler 日志：\n' + logs.slice(-30).join('\n'));
} finally {
  if (browser) await browser.close().catch(() => {});
  stopWrangler();
  await sleep(500);
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exitCode = failed.length ? 1 : 0;
