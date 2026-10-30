/**
 * AI 聊天小窗端到端自检（可选，不在 CI，也不在 verify:frontend 里）。
 *
 * 覆盖：打开/关闭、初始欢迎语不发请求、Enter/Shift+Enter、SSE 流式回复、
 * 停止生成、503/429 文案、清空历史、移动端溢出、截图，以及密钥不出现在浏览器。
 *
 * 依赖：
 *   - 先 `npm run build`；
 *   - playwright + Chromium / Edge（可用 CMS_OAUTH_CHROME 指定浏览器）。
 *
 * 用法：node scripts/check-chat.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CHAT_CHECK_PORT ?? 8789);
const MOCK_PORT = Number(process.env.CHAT_MOCK_PORT ?? 8790);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const MOCK_ORIGIN = `http://127.0.0.1:${MOCK_PORT}`;
const PERSIST = join(ROOT, '.tmp-chat-check');
const SCREENS = join(ROOT, '.tmp-chat-screens');
const API_KEY = 'chat-check-secret';
const SALT = 'chat-check-salt';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** 启动器持续浮动，用真实坐标点击，既保留动画又避免 Playwright 的稳定性等待。 */
async function clickLauncher(page) {
  const box = await page.locator('[data-chat-launcher]').boundingBox();
  if (!box) throw new Error('聊天启动器没有可点击区域');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** 等弹出动画结束再断言布局或截图，避免把动画中间帧当成最终设计。 */
async function openChat(page) {
  await clickLauncher(page);
  const panel = page.locator('[data-chat-panel]');
  await panel.waitFor({ state: 'visible' });
  await panel.evaluate((element) => Promise.all(element.getAnimations({ subtree: false }).map((animation) => animation.finished.catch(() => {}))));
}

async function waitForViewTransition(page) {
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute('data-astro-transition'),
    { timeout: 10000 },
  );
}

function resetDir(path) {
  const resolved = resolve(path);
  const root = resolve(ROOT) + sep;
  if (!resolved.startsWith(root)) throw new Error(`Refusing to remove outside workspace: ${resolved}`);
  rmSync(resolved, { recursive: true, force: true });
}

const required = [
  'dist/zh/index.html',
  'dist/chat/yukki-chat.gif',
  'dist/chat/yukki-chat-static.png',
  'dist/ai/zh.json',
  'dist/ai/en.json',
];
const missing = required.filter((file) => !existsSync(join(ROOT, file)));
if (missing.length) {
  console.error(`缺少构建产物：${missing.join(', ')}\n先跑 npm run build。`);
  process.exit(2);
}

const indexes = Object.fromEntries(
  ['zh', 'en'].map((lang) => [lang, JSON.parse(readFileSync(join(ROOT, `dist/ai/${lang}.json`), 'utf8'))]),
);
const draftIds = new Set(['going-live']);
const indexProblems = [];
for (const lang of ['zh', 'en']) {
  const data = indexes[lang];
  if (data?.version !== 1 || data?.lang !== lang) {
    indexProblems.push(`${lang}: version/lang`);
    continue;
  }
  if (!Array.isArray(data.posts) || data.posts.length === 0 || !Array.isArray(data.chunks) || data.chunks.length === 0) {
    indexProblems.push(`${lang}: empty`);
    continue;
  }
  if (data.posts.some((post) => draftIds.has(post.id))) indexProblems.push(`${lang}: draft`);
  if (data.chunks.some((chunk) => [...chunk.text].length > 1200)) indexProblems.push(`${lang}: oversized chunk`);
}
if (indexProblems.length) {
  console.error(`AI 索引产物不合法：\n${indexProblems.map((item) => `  ${item}`).join('\n')}`);
  process.exit(2);
}
console.log(
  `✓ AI 索引就绪：zh ${indexes.zh.posts.length}/${indexes.zh.chunks.length}，en ${indexes.en.posts.length}/${indexes.en.chunks.length}`,
);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('这个自检需要 playwright：npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

// 本地模拟上游：证明 Worker 会从服务端访问 AI_API_BASE，而不是浏览器直接访问。
const mockRequests = [];
const activeTimers = new Set();
const mock = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/chat/completions') {
    response.writeHead(404).end();
    return;
  }

  let raw = '';
  for await (const chunk of request) raw += chunk;
  let payload;
  try {
    payload = JSON.parse(raw);
    mockRequests.push(payload);
  } catch {
    response.writeHead(400).end();
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });
  const send = (text) => {
    if (response.destroyed || response.writableEnded) return;
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
  };
  const later = (delay, task) => {
    const timer = setTimeout(() => {
      activeTimers.delete(timer);
      if (!response.destroyed && !response.writableEnded) task();
    }, delay);
    activeTimers.add(timer);
  };
  const userText = payload.messages?.at(-1)?.content ?? '';

  if (userText === '写作语法有哪些？') {
    send('写作先确定主题，再整理结构。');
    later(140, () => response.end('data: [DONE]\n\n'));
  } else if (userText === '这个站点是什么') {
    send('这是一个');
    later(900, () => send('用 Markdown 写的个人博客。'));
    later(1050, () => response.end('data: [DONE]\n\n'));
  } else if (userText === 'What runs this site?') {
    send('It runs on Markdown and static hosting.');
    later(140, () => response.end('data: [DONE]\n\n'));
  } else if (userText === 'What is quantum entanglement?') {
    send('I could not find that in the site posts.');
    later(140, () => response.end('data: [DONE]\n\n'));
  } else if (userText === '停止测试') {
    send('片段一');
    later(1600, () => {
      send('片段二');
      response.end('data: [DONE]\n\n');
    });
  } else {
    send('你');
    later(90, () => send('好'));
    later(180, () => {
      send('！');
      response.end('data: [DONE]\n\n');
    });
  }
});
mock.on('clientError', (_error, socket) => socket.destroy());
await new Promise((done, fail) => {
  mock.once('error', fail);
  mock.listen(MOCK_PORT, '127.0.0.1', done);
});

resetDir(PERSIST);
resetDir(SCREENS);
mkdirSync(SCREENS, { recursive: true });

const logs = [];
const wranglerCommand = [
  'npx --yes wrangler@4.151.1 pages dev dist',
  `--port ${PORT}`,
  '--ip 127.0.0.1',
  '--d1=DB=chat_check',
  `--persist-to ${JSON.stringify(PERSIST)}`,
  `--binding AI_API_KEY=${API_KEY}`,
  `--binding COMMENTS_SALT=${SALT}`,
  `--binding AI_API_BASE=${MOCK_ORIGIN}`,
  '--binding AI_MODEL=gemma-4-26b-a4b-it',
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

function stopProcesses() {
  if (wrangler && wrangler.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(wrangler.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      wrangler.kill('SIGTERM');
    }
  }
  for (const timer of activeTimers) clearTimeout(timer);
  activeTimers.clear();
  mock.close();
}

async function waitForServer(timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (wrangler.exitCode !== null) return false;
    try {
      const response = await fetch(`${ORIGIN}/zh/`);
      if (response.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await sleep(1000);
  }
  return false;
}

const ready = await waitForServer();
if (!ready) {
  console.error('wrangler pages dev 没有起来，最近日志：\n' + logs.slice(-40).join('\n'));
  stopProcesses();
  process.exit(1);
}
console.log(`本地 Pages 运行时已启动：${ORIGIN}（D1 ${PERSIST}）`);
console.log(`模拟上游已启动：${MOCK_ORIGIN}\n`);

let browser;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.CMS_OAUTH_CHROME ||
      (existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
        ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
        : undefined),
    headless: true,
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  const pageErrors = [];
  const browserRequests = [];
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 240)));
  context.on('request', (request) => {
    browserRequests.push({
      url: request.url(),
      headers: request.headers(),
      postData: request.postData() ?? '',
    });
  });

  await page.goto(`${ORIGIN}/zh/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const launcher = page.locator('[data-chat-launcher]');
  const panel = page.locator('[data-chat-panel]');
  const input = page.locator('[data-chat-input]');
  const send = page.locator('[data-chat-send]');
  const log = page.locator('[data-chat-log]');
  await launcher.waitFor({ state: 'visible', timeout: 30000 });

  const apiRequestCount = () => browserRequests.filter((item) => item.url.endsWith('/api/chat')).length;
  check('聊天启动器已渲染', (await launcher.count()) === 1);
  const visibleLauncherImages = await launcher.locator('img').evaluateAll(
    (images) => images.filter((image) => getComputedStyle(image).display !== 'none' && image.getBoundingClientRect().width > 0).length,
  );
  check('启动器只显示一张角色图', visibleLauncherImages === 1, String(visibleLauncherImages));
  check('初始欢迎语没有请求 AI 接口', apiRequestCount() === 0 && mockRequests.length === 0);

  await openChat(page);
  check('点击角色打开聊天窗', await panel.isVisible());
  check('打开后启动器隐藏并同步 aria-expanded', (await launcher.isHidden()) && (await launcher.getAttribute('aria-expanded')) === 'true');
  check('初始欢迎语可见', /今天想聊点什么/.test(await log.innerText()));
  await page.screenshot({ path: join(SCREENS, 'desktop-light.png') });

  await page.locator('[data-chat-close]').click();
  check('关闭按钮收起聊天窗', (await panel.isHidden()) && (await launcher.isVisible()));
  await openChat(page);

  await input.fill('换行测试');
  await input.press('Shift+Enter');
  await sleep(250);
  check('Shift+Enter 只换行、不发送', (await input.inputValue()).includes('\n') && apiRequestCount() === 0);

  await input.fill('写作语法有哪些？');
  await input.press('Enter');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-chat-log] .ai-chat-message.is-assistant .ai-chat-bubble')].some(
        (node) => node.textContent === '写作先确定主题，再整理结构。',
      ),
    { timeout: 20000 },
  );
  await log.locator('.ai-chat-sources a').first().waitFor({ state: 'visible', timeout: 20000 });
  const homeSourceHrefs = await log.locator('.ai-chat-sources a').evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  );
  check('首页检索全站并显示来源卡片', homeSourceHrefs.some((href) => href?.includes('/zh/posts/writing-in-markdown/')));
  check('Enter 发送并拼接完整 SSE 流', /写作先确定主题/.test(await log.innerText()) && apiRequestCount() === 1);
  check('生成完成后按钮恢复发送', (await send.innerText()).trim() === '发送');
  const homePrompt = mockRequests.at(-1)?.messages?.[0]?.content ?? '';
  check(
    '首页请求带全站资料且模型由服务端固定',
    mockRequests.at(-1)?.model === 'gemma-4-26b-a4b-it' && homePrompt.includes('SITE_CONTEXT_JSON='),
  );
  const homeContext = JSON.parse(/SITE_CONTEXT_JSON=([\s\S]*)$/.exec(homePrompt)?.[1] ?? '[]');
  check(
    '首页来源跨文章且语言隔离',
    homeContext.some((source) => source.postId === 'writing-in-markdown' && source.url.startsWith('/zh/posts/')) &&
      homeContext.every((source) => source.url.startsWith('/zh/posts/')),
  );

  await input.fill('停止测试');
  await input.press('Enter');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-chat-log] .ai-chat-message.is-assistant .ai-chat-bubble')].some(
        (node) => node.textContent === '片段一',
      ),
    { timeout: 20000 },
  );
  check('生成中按钮切换为停止', (await send.innerText()).trim() === '停止');
  await send.click();
  await page.waitForFunction(
    () => document.querySelector('[data-chat-send]')?.textContent?.trim() === '发送',
    { timeout: 10000 },
  );
  check('停止生成保留已收到的片段且不显示错误', /片段一/.test(await log.innerText()) && !/出了点问题|没有收到回复/.test(await log.innerText()));

  await page.locator('[data-chat-clear]').click();
  check('清空后恢复欢迎语并移除历史', (await log.locator('.ai-chat-message').count()) === 1 && (await input.inputValue()) === '');

  await input.fill('清空后');
  await input.press('Enter');
  await page.waitForFunction(
    () => {
      const log = document.querySelector('[data-chat-log]');
      const replies = [...document.querySelectorAll('[data-chat-log] .ai-chat-message.is-assistant .ai-chat-bubble')];
      return log?.textContent?.includes('清空后') && replies.at(-1)?.textContent === '你好！';
    },
    { timeout: 20000 },
  );
  check('清空后请求历史确实重置', mockRequests.at(-1)?.messages?.length === 2 && mockRequests.at(-1)?.messages?.[1]?.content === '清空后');

  await page.locator('[data-chat-clear]').click();
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'ai-not-configured', message: 'AI 服务尚未配置' }),
    }),
  );
  await input.fill('503 测试');
  await input.press('Enter');
  await page.waitForFunction(
    () => /尚未配置/.test(document.querySelector('[data-chat-log]')?.textContent ?? ''),
    { timeout: 10000 },
  );
  check('503 显示未配置文案', /尚未配置/.test(await log.innerText()));
  await page.unroute('**/api/chat');

  await page.locator('[data-chat-clear]').click();
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'rate-limited', message: '请求太频繁' }),
    }),
  );
  await input.fill('429 测试');
  await input.press('Enter');
  await page.waitForFunction(
    () => /请求太频繁/.test(document.querySelector('[data-chat-log]')?.textContent ?? ''),
    { timeout: 10000 },
  );
  check('429 显示限流文案', /请求太频繁/.test(await log.innerText()));
  await page.unroute('**/api/chat');

  const noEvidencePage = await context.newPage();
  noEvidencePage.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 240)));
  await noEvidencePage.goto(`${ORIGIN}/en/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await openChat(noEvidencePage);
  await noEvidencePage.locator('[data-chat-input]').fill('What is quantum entanglement?');
  await noEvidencePage.locator('[data-chat-input]').press('Enter');
  await noEvidencePage.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-chat-log] .ai-chat-message.is-assistant .ai-chat-bubble')].some(
        (node) => node.textContent === 'I could not find that in the site posts.',
      ),
    { timeout: 20000 },
  );
  const noEvidencePrompt = mockRequests.at(-1)?.messages?.[0]?.content ?? '';
  check(
    '无站内依据时不发送 context 且明确不编造',
    !noEvidencePrompt.includes('SITE_CONTEXT_JSON=') && (await noEvidencePage.locator('.ai-chat-sources').count()) === 0,
  );
  await noEvidencePage.close();

  const fallbackPage = await context.newPage();
  fallbackPage.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 240)));
  await fallbackPage.route('**/ai/zh.json', (route) => route.fulfill({ status: 404, body: 'not found' }));
  await fallbackPage.goto(`${ORIGIN}/zh/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await openChat(fallbackPage);
  await fallbackPage.locator('[data-chat-input]').fill('索引坏了还能聊天吗？');
  await fallbackPage.locator('[data-chat-input]').press('Enter');
  await fallbackPage.waitForFunction(
    () => /站内参考资料暂不可用/.test(document.querySelector('[data-chat-log]')?.textContent ?? ''),
    { timeout: 20000 },
  );
  const fallbackText = await fallbackPage.locator('[data-chat-log]').innerText();
  const fallbackPrompt = mockRequests.at(-1)?.messages?.[0]?.content ?? '';
  check(
    '索引 404 时普通聊天继续且只提示一次',
    /你好！/.test(fallbackText) &&
      !fallbackPrompt.includes('SITE_CONTEXT_JSON=') &&
      (fallbackText.match(/站内参考资料暂不可用/g) ?? []).length === 1,
  );
  await fallbackPage.close();

  const articlePage = await context.newPage();
  articlePage.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 240)));
  await articlePage.goto(`${ORIGIN}/zh/posts/hello-world/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await openChat(articlePage);
  const articleInput = articlePage.locator('[data-chat-input]');
  const articleLog = articlePage.locator('[data-chat-log]');
  const articlePanel = articlePage.locator('[data-chat-panel]');
  check('文章页显示四个快捷问题', (await articlePage.locator('[data-chat-quick] button:visible').count()) === 4);

  await articleInput.fill('这个站点是什么');
  await articleInput.press('Enter');
  await articlePage.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-chat-log] .ai-chat-message.is-assistant .ai-chat-bubble')].some(
        (node) => node.textContent === '这是一个',
      ),
    { timeout: 20000 },
  );

  await articlePage.locator('.site-nav a[href$="/zh/about/"]').click();
  await articlePage.waitForURL('**/zh/about/', { timeout: 20000 });
  await waitForViewTransition(articlePage);
  await articlePage.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-chat-log] .ai-chat-message.is-assistant .ai-chat-bubble')].some(
        (node) => node.textContent === '这是一个用 Markdown 写的个人博客。',
      ),
    { timeout: 10000 },
  );
  await articleLog.locator('.ai-chat-sources a').first().waitFor({ state: 'visible', timeout: 20000 });
  const articleSourceLinks = await articleLog.locator('.ai-chat-sources a').evaluateAll((links) =>
    links.map((link) => ({ href: link.getAttribute('href'), text: link.textContent ?? '' })),
  );
  check(
    '切换页面后来源卡片和流式回复保持',
    articlePage.url().endsWith('/zh/about/') &&
      articleSourceLinks.some((link) => link.href?.startsWith('/zh/posts/hello-world/')) &&
      (await articlePanel.isVisible()),
  );

  const anchorLink = articleLog.locator('.ai-chat-sources a[href*="#"]').first();
  const anchorHref = await anchorLink.getAttribute('href');
  await anchorLink.scrollIntoViewIfNeeded();
  const anchorBox = await anchorLink.boundingBox();
  if (!anchorBox) throw new Error('来源锚点链接没有可点击区域');
  await Promise.all([
    articlePage.waitForURL(
      (url) => url.pathname === '/zh/posts/hello-world/' && url.hash.length > 1,
      { timeout: 20000 },
    ),
    articlePage.mouse.click(anchorBox.x + anchorBox.width / 2, anchorBox.y + anchorBox.height / 2),
  ]);
  check('点击来源跳到文章真实锚点', anchorHref?.startsWith('/zh/posts/hello-world/#') === true && articlePage.url().includes('#'));

  const articlePrompt = mockRequests.at(-1)?.messages?.[0]?.content ?? '';
  const articleContext = JSON.parse(/SITE_CONTEXT_JSON=([\s\S]*)$/.exec(articlePrompt)?.[1] ?? '[]');
  check(
    '文章页优先发送当前文章片段',
    articleContext.some((source) => source.postId === 'hello-world' && source.anchor === '这个站点是什么'),
  );

  await articlePage.locator('.site-nav a[href$="/en/posts/hello-worlden/"]').click();
  await articlePage.waitForURL('**/en/posts/hello-worlden/', { timeout: 20000 });
  await waitForViewTransition(articlePage);
  await articleInput.fill('What runs this site?');
  await articleInput.press('Enter');
  await articlePage.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-chat-log] .ai-chat-message.is-assistant .ai-chat-bubble')].some(
        (node) => node.textContent === 'It runs on Markdown and static hosting.',
      ),
    { timeout: 20000 },
  );
  await articleLog.locator('.ai-chat-sources a').first().waitFor({ state: 'visible', timeout: 20000 });
  const langSwitchPrompt = mockRequests.at(-1)?.messages?.[0]?.content ?? '';
  const langSwitchContext = JSON.parse(/SITE_CONTEXT_JSON=([\s\S]*)$/.exec(langSwitchPrompt)?.[1] ?? '[]');
  check(
    '跨语言导航后复用聊天窗并切换 en 索引',
    langSwitchContext.some((source) => source.postId === 'hello-worlden' && source.url.startsWith('/en/posts/')) &&
      langSwitchContext.every((source) => source.url.startsWith('/en/posts/')),
  );

  await articleLog.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await articlePage.locator('#theme-toggle').click();
  await articlePage.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await sleep(250);
  await articlePage.screenshot({ path: join(SCREENS, 'desktop-dark.png') });
  await articlePage.locator('#theme-toggle').click();
  await articlePage.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await sleep(250);
  await articlePage.setViewportSize({ width: 390, height: 844 });
  const mobileSourceMetrics = await articlePage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    sourceRight: document.querySelector('.ai-chat-sources')?.getBoundingClientRect().right ?? 0,
  }));
  check(
    '390px 下来源卡片不造成横向溢出',
    mobileSourceMetrics.scrollWidth <= mobileSourceMetrics.innerWidth &&
      mobileSourceMetrics.sourceRight <= mobileSourceMetrics.innerWidth + 1,
    JSON.stringify(mobileSourceMetrics),
  );
  await articlePage.screenshot({ path: join(SCREENS, 'mobile-390.png') });
  await articlePage.setViewportSize({ width: 1280, height: 900 });
  await articlePage.close();

  const pageHtml = await page.content();
  check(
    '索引和源码均不含密钥',
    ![API_KEY, 'sk-', MOCK_ORIGIN].some((value) => JSON.stringify(indexes).includes(value)) &&
      ![API_KEY, 'token.astrumflow.com', MOCK_ORIGIN].some((value) => pageHtml.includes(value)),
  );
  check(
    '浏览器只请求本站 /api/chat，且不带 Authorization',
    browserRequests
      .filter((item) => item.url.includes('/api/chat'))
      .every((item) => item.url.startsWith(`${ORIGIN}/api/chat`) && !item.headers.authorization),
  );

  check('页面没有脚本异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 240));
  check('三张审核截图已生成', ['desktop-light.png', 'desktop-dark.png', 'mobile-390.png'].every((name) => existsSync(join(SCREENS, name))));
} catch (error) {
  check('AI 聊天端到端自检执行完成', false, String(error).split('\n')[0].slice(0, 300));
  console.error('\n最近 wrangler 日志：\n' + logs.slice(-30).join('\n'));
} finally {
  if (browser) await browser.close().catch(() => {});
  stopProcesses();
  await sleep(400);
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
console.log(`截图目录：${SCREENS}`);
process.exitCode = failed.length ? 1 : 0;
