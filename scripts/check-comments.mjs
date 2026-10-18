/**
 * 评论功能端到端自检（可选，不在 CI，也不在 verify:frontend 里）。
 *
 * 为什么需要它：评论链路横跨「构建出来的页面 → 浏览器脚本 → Pages Functions → D1」，
 * 类型检查、单元测试、构建都覆盖不到「真的能在页面上发一条评论并被管理页删掉」。
 * 这里用 wrangler 的本地 Pages 运行时跑真实 functions/ 代码（本地 D1 模拟），
 * 再用真实浏览器走完：空状态 → 发评论（含 XSS 载荷）→ 刷新仍在 → 限流提示 →
 * 管理页查列表 → 删除 → 前台消失，另外补几条接口级断言（CORS、401、200）。
 *
 * 依赖：
 *   - 先 `npm run build`（脚本会检查 dist 是否是最新的构建产物）；
 *   - playwright + 浏览器内核（不在 package.json 里；可用 CMS_OAUTH_CHROME 指定 chromium 可执行文件）；
 *   - npx 能取到 wrangler（首次会下载）。
 *
 * 用法：node scripts/check-comments.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.COMMENTS_CHECK_PORT ?? 8788);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PERSIST = join(ROOT, '.tmp-comments-check');

const TOKEN = 'comments-check-token';
const SALT = 'comments-check-salt';
const POST_PATH = '/zh/posts/hello-world/';
const ADMIN_PATH = '/admin/comments/';
const AUTHOR = '自动验收';
const XSS_BODY = '第一行\n<img src=x onerror="window.__xss=1">\n最后一行';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const required = ['dist/index.html', 'dist/zh/posts/hello-world/index.html', 'dist/admin/comments/index.html'];
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
// 用一条命令字符串 + shell:true：Windows 下 npx 是 .cmd，必须过 shell；
// 直接传参数数组会触发 DEP0190（参数不转义只拼接）的告警。
const wranglerCommand = [
  'npx --yes wrangler@4.151.1 pages dev dist',
  `--port ${PORT}`,
  '--ip 127.0.0.1',
  '--d1=DB=comments_dev',
  '--persist-to .tmp-comments-check',
  `--binding COMMENTS_ADMIN_TOKEN=${TOKEN}`,
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
      const response = await fetch(`${ORIGIN}${POST_PATH}`);
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
  browser = await chromium.launch({
    executablePath: process.env.CMS_OAUTH_CHROME || undefined,
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 200)));

  await page.goto(`${ORIGIN}${POST_PATH}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#comments').waitFor({ state: 'visible', timeout: 30000 });

  check('文章页渲染了评论区', (await page.locator('#comments').count()) === 1);
  const apiAttr = (await page.locator('#comments').getAttribute('data-api')) ?? '';
  check(
    'Cloudflare 构建里评论接口为空（同源）或指向主站 /api/comments',
    apiAttr === '' || apiAttr.endsWith('/api/comments'),
    apiAttr === '' ? '（空 = 同源）' : apiAttr,
  );
  check(
    '评论线程是去掉 base 的站内路径',
    (await page.locator('#comments').getAttribute('data-thread')) === POST_PATH,
    await page.locator('#comments').getAttribute('data-thread'),
  );

  await page.waitForFunction(
    () => (document.querySelector('[data-comments-status]')?.textContent ?? '').trim().length > 0,
    { timeout: 15000 },
  ).catch(() => {});
  check(
    '空列表显示空状态文案',
    (await page.locator('[data-comments-list] li').count()) === 0 &&
      /还没有评论/.test(await page.locator('[data-comments-status]').first().innerText()),
  );

  // 发一条带 XSS 载荷的评论：正文必须按纯文本渲染，onerror 不能执行。
  await page.locator('input[name="author"]').fill(AUTHOR);
  await page.locator('textarea[name="body"]').fill(XSS_BODY);
  await page.waitForTimeout(1700); // 服务端要求 elapsed ≥ 1500ms
  await page.locator('[data-submit]').click();
  await page.locator('[data-comments-list] li').first().waitFor({ timeout: 20000 });

  check('提交成功后立即出现在列表', (await page.locator('[data-comments-list] li').count()) === 1);
  const rendered = await page.locator('[data-comments-list] li').first().innerText();
  check('正文按纯文本渲染（XSS 载荷原样显示）', rendered.includes('<img src=x onerror='), rendered.replace(/\s+/g, ' ').slice(0, 120));
  check('列表里没有插入真实 img 元素', (await page.locator('[data-comments-list] img').count()) === 0);
  check('onerror 没有执行', await page.evaluate(() => window.__xss === undefined));
  check(
    '表单显示发表成功',
    /发表成功/.test(await page.locator('[data-form-status]').innerText()),
    await page.locator('[data-form-status]').innerText(),
  );

  // 刷新后仍在 = 真的写进了 D1 而不是只存在于前端状态里。
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('[data-comments-list] li').first().waitFor({ timeout: 20000 });
  check('刷新后评论仍在（已写入 D1）', (await page.locator('[data-comments-list] li').count()) === 1);

  // 同一 IP 60 秒内再发一条必须被限流。
  await page.locator('input[name="author"]').fill(AUTHOR);
  await page.locator('textarea[name="body"]').fill('再来一条');
  await page.waitForTimeout(1700);
  await page.locator('[data-submit]').click();
  await page.waitForFunction(
    () => /歇一分钟|太快/.test(document.querySelector('[data-form-status]')?.textContent ?? ''),
    { timeout: 20000 },
  ).catch(() => {});
  check(
    '60 秒内重复提交被限流并给出提示',
    /歇一分钟/.test(await page.locator('[data-form-status]').innerText()),
    await page.locator('[data-form-status]').innerText(),
  );
  check('限流期间没有多出一条评论', (await page.locator('[data-comments-list] li').count()) === 1);

  // 管理页：未填令牌 → 令牌错误 → 正确令牌 → 删除。
  const admin = await context.newPage();
  const adminErrors = [];
  admin.on('pageerror', (error) => adminErrors.push(String(error).slice(0, 200)));
  await admin.goto(`${ORIGIN}${ADMIN_PATH}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  check('管理页可访问且有标题', /评论管理/.test(await admin.title()), await admin.title());
  check(
    '管理页从后台入口可点进来',
    existsSync(join(ROOT, 'dist/admin/index.html')) &&
      /评论管理/.test(await (await fetch(`${ORIGIN}/admin/`)).text()),
  );
  check('未保存令牌时提示先填令牌', /令牌/.test(await admin.locator('#status').innerText()));

  await admin.locator('#token').fill('wrong-token');
  await admin.locator('#auth-form button[type="submit"]').click();
  await admin.waitForFunction(
    () => /不正确/.test(document.querySelector('#status')?.textContent ?? ''),
    { timeout: 15000 },
  ).catch(() => {});
  check('错误令牌被拒绝', /不正确/.test(await admin.locator('#status').innerText()));

  await admin.locator('#token').fill(TOKEN);
  await admin.locator('#auth-form button[type="submit"]').click();
  await admin.locator('.comment').first().waitFor({ timeout: 20000 });
  check('管理页用正确令牌列出评论', (await admin.locator('.comment').count()) === 1);
  check(
    '管理页显示评论所在路径',
    (await admin.locator('.comment-thread').first().innerText()) === POST_PATH,
    await admin.locator('.comment-thread').first().innerText(),
  );
  check('管理页把正文当纯文本渲染', (await admin.locator('.comment img').count()) === 0);

  admin.on('dialog', (dialog) => dialog.accept());
  await admin.locator('.comment-actions button').first().click();
  await admin.waitForFunction(
    () => document.querySelectorAll('.comment').length === 0,
    { timeout: 20000 },
  ).catch(() => {});
  check('删除后管理页列表为空', (await admin.locator('.comment').count()) === 0);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => (document.querySelector('[data-comments-status]')?.textContent ?? '').trim().length > 0,
    { timeout: 20000 },
  ).catch(() => {});
  check('删除后前台回到空状态', (await page.locator('[data-comments-list] li').count()) === 0);

  // 接口级断言：CORS 白名单、拒绝未知来源、管理接口鉴权。
  const getAllowed = await fetch(`${ORIGIN}/api/comments?thread=${encodeURIComponent(POST_PATH)}&limit=20`, {
    headers: { Origin: 'https://liukki.github.io' },
  });
  check('公开接口允许 GitHub Pages 镜像跨域', getAllowed.headers.get('access-control-allow-origin') === 'https://liukki.github.io',
    String(getAllowed.headers.get('access-control-allow-origin')));
  const getDenied = await fetch(`${ORIGIN}/api/comments?thread=${encodeURIComponent(POST_PATH)}&limit=20`, {
    headers: { Origin: 'https://evil.example' },
  });
  check('公开接口拒绝未知来源跨域', !getDenied.headers.get('access-control-allow-origin'));
  check('公开接口不允许缓存', (getAllowed.headers.get('cache-control') ?? '').includes('no-store'));
  check('管理接口没令牌返回 401', (await fetch(`${ORIGIN}/api/comments-admin`)).status === 401);
  check(
    '管理接口错误令牌返回 401',
    (await fetch(`${ORIGIN}/api/comments-admin`, { headers: { Authorization: 'Bearer wrong' } })).status === 401,
  );
  check(
    '管理接口正确令牌返回 200',
    (await fetch(`${ORIGIN}/api/comments-admin`, { headers: { Authorization: `Bearer ${TOKEN}` } })).status === 200,
  );

  check('页面没有脚本异常', pageErrors.length === 0 && adminErrors.length === 0,
    [...pageErrors, ...adminErrors].join(' | ').slice(0, 200));
} catch (error) {
  check('评论端到端自检执行完成', false, String(error).split('\n')[0].slice(0, 240));
  console.error('\n最近 wrangler 日志：\n' + logs.slice(-30).join('\n'));
} finally {
  if (browser) await browser.close().catch(() => {});
  stopWrangler();
  await sleep(500);
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exitCode = failed.length ? 1 : 0;
