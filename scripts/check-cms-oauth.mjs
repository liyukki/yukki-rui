/**
 * 可选的登录链路自检（不属于 CI，也不在 verify:frontend 里）。
 *
 * 为什么需要它：/api/auth 与 /api/callback 只有在真实浏览器里、由真实的
 * Sveltia CMS 客户端（/admin 页面 window.open + postMessage 握手）调用才算验证过。
 * 这个脚本把两个函数跑在本地 HTTP 服务上，用 Playwright 打开真实的后台页面，
 * 把 github.com 的授权页与令牌端点用拦截模拟掉，最后断言令牌真的进了后台的
 * localStorage（sveltia-cms.user）且后台带着它去调了 GitHub API。
 *
 * 依赖：playwright（不在 package.json 里；需要时 npm i -D playwright 并准备浏览器内核）。
 * 用法：node scripts/check-cms-oauth.mjs
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CMS_OAUTH_PORT ?? 4399);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ENV = { GITHUB_CLIENT_ID: 'e2e-client-id', GITHUB_CLIENT_SECRET: 'e2e-client-secret' };
const TOKEN = 'gho_e2e_handshake_token';
const CODE = 'e2e-code-123';
const DEBUG = process.env.CMS_OAUTH_DEBUG === '1';
/** /api/auth 实际发出的 302 Location，由本地服务在转发响应时记录。 */
let authRedirect = null;

const { onRequestGet: authEndpoint } = await import('../functions/api/auth.js');
const { onRequestGet: callbackEndpoint } = await import('../functions/api/callback.js');

/**
 * callback.js 里的 fetch 跑在「服务端」（真实环境是 Cloudflare Worker，这里是本进程），
 * 所以要用 Node 层的替身来模拟 GitHub 的令牌端点 —— 浏览器层的路由拦不到它。
 */
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === 'https://github.com/login/oauth/access_token') {
    if (DEBUG) console.log('[node fetch] 已替身：令牌端点');
    return new Response(JSON.stringify({ access_token: TOKEN, token_type: 'bearer', scope: 'repo' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return realFetch(input, init);
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** 后台用的 config：指向本地服务，并关掉 local_backend 以强制走 OAuth 流程。 */
function localConfig() {
  // 注意：config.yml 里这两行是缩进（或在 backend: 下）的，正则必须允许前导空格。
  return readFileSync(join(ROOT, 'public/admin/config.yml'), 'utf8')
    .replace(/^(\s*)base_url:.*$/m, `$1base_url: ${ORIGIN}`)
    .replace(/^(\s*)local_backend:.*$/m, '$1local_backend: false');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  const send = (status, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type });
    res.end(body);
  };
  if (DEBUG) console.log(`[server] ${req.method} ${url.pathname}${url.search}`);

  // /mismatch/... 提供一份「base_url 仍指向线上域名」的后台副本，
  // 用来验证「从非登录域名打开后台」时的提示条（见 public/admin/index.html）。
  const mismatch = url.pathname.startsWith('/mismatch/');
  const pathname = mismatch ? url.pathname.slice('/mismatch'.length) : url.pathname;

  try {
    if (pathname === '/admin/' || pathname === '/admin/index.html') {
      return send(200, readFileSync(join(ROOT, 'public/admin/index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (pathname === '/admin/config.yml') {
      const config = mismatch ? readFileSync(join(ROOT, 'public/admin/config.yml'), 'utf8') : localConfig();
      return send(200, config, 'text/yaml; charset=utf-8');
    }
    if (pathname === '/admin/upload-helper.js') {
      return send(200, readFileSync(join(ROOT, 'public/admin/upload-helper.js'), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname === '/api/auth' || pathname === '/api/callback') {
      const handler = pathname === '/api/auth' ? authEndpoint : callbackEndpoint;
      const response = await handler({ request: new Request(url.href), env: ENV });
      const body = await response.text();
      const headers = Object.fromEntries(response.headers);
      if (pathname === '/api/auth') {
        authRedirect = headers.location ?? null;
        // /api/auth 真实返回的 302 指向 github.com（上面已断言其参数）。
        // 浏览器这一侧不能真去 GitHub：未登录会落到 GitHub 登录页，而它带
        // COOP 头，会把弹窗和后台的 opener 关系切断，握手就永远回不来。
        // 所以这里由测试服务等价模拟「GitHub 接受授权后带 code 回跳」那一跳。
        if (response.status >= 300 && response.status < 400) {
          res.writeHead(302, { Location: `${ORIGIN}/api/callback?code=${CODE}` });
          return res.end();
        }
      }
      res.writeHead(response.status, headers);
      return res.end(body);
    }
    return send(404, 'not found');
  } catch (error) {
    return send(500, String(error));
  }
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
console.log(`本地服务已启动：${ORIGIN}/admin/`);

// playwright 不在 package.json 里（否则 npm ci 会给云端构建拖进浏览器内核），
// 缺了就给一句人话，而不是 ERR_MODULE_NOT_FOUND。
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('这个自检需要 playwright：npm i -D playwright && npx playwright install chromium');
  server.close();
  process.exit(2);
}

const executablePath = process.env.CMS_OAUTH_CHROME || undefined;
const browser = await chromium.launch({
  executablePath,
  headless: true,
  // 造一个「非本机」的域名指向本服务，用来验证后台的登录地址提示条
  // （提示条在本机域名下会主动静默，见 public/admin/index.html）。
  args: ['--host-resolver-rules=MAP cms-check.test 127.0.0.1'],
});
const context = await browser.newContext();

// 模拟 GitHub：授权页直接回跳，令牌端点返回固定令牌。
if (DEBUG) {
  await context.route('**/*', (route) => {
    const target = route.request().url();
    if (!target.startsWith(ORIGIN)) console.log(`[route] ${route.request().method()} ${target.slice(0, 160)}`);
    return route.fallback();
  });
}
// 登录后 Sveltia 会去读用户、仓库与文件树；给最小可用响应，让后台能走到「已登录」界面。
// 这里不是要复刻 GitHub API，只是把登录后的加载路径垫平，避免与登录无关的报错混进来。
// 顺带记录每次请求带的 Authorization 头 —— 「后台拿着令牌调用了 API」是「令牌被接受」
// 最硬的证据，比截图或界面文案都可靠。
const usedTokens = [];
await context.route('https://api.github.com/**', (route) => {
  const { pathname } = new URL(route.request().url());
  const authorization = route.request().headers().authorization ?? '';
  if (authorization) usedTokens.push({ pathname, authorization });
  const repo = {
    id: 1,
    name: 'yukki-rui',
    full_name: 'liyukki/yukki-rui',
    private: false,
    default_branch: 'master',
    permissions: { admin: true, push: true, pull: true },
    owner: { login: 'liyukki' },
  };
  let body = repo;
  if (pathname === '/user') body = { login: 'e2e-user', name: 'E2E', avatar_url: '', email: '' };
  else if (pathname.includes('/git/trees')) body = { sha: 'e2e', tree: [], truncated: false };
  else if (pathname.includes('/contents')) body = [];
  else if (pathname.includes('/pulls')) body = [];
  else if (pathname.includes('/branches')) body = { name: 'master', commit: { sha: 'e2e' } };
  return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
});

const page = await context.newPage();
const errors = [];
/** 只有握手期间的脚本异常才算问题；登录成功后加载空仓库的报错与 OAuth 无关。 */
let handshakeDone = false;
page.on('pageerror', (error) => {
  const text = error?.message ? `${error.name ?? 'Error'}: ${error.message}` : String(error?.stack ?? error);
  if (!handshakeDone) errors.push(text.slice(0, 200));
  if (DEBUG) console.log(`[admin error]${handshakeDone ? '(登录后)' : ''} ${text.slice(0, 200)}`);
});

if (DEBUG) {
  context.on('page', (popup) => {
    console.log(`[popup] 打开 ${popup.url()}`);
    popup.on('framenavigated', (frame) => {
      if (frame === popup.mainFrame()) console.log(`[popup] 跳转到 ${frame.url()}`);
    });
    popup.on('console', (msg) => console.log(`[popup console] ${msg.type()}: ${msg.text().slice(0, 200)}`));
    popup.on('pageerror', (error) => console.log(`[popup error] ${String(error).slice(0, 200)}`));
  });
  page.on('console', (msg) => console.log(`[admin console] ${msg.type()}: ${msg.text().slice(0, 200)}`));
}

try {
  await page.goto(`${ORIGIN}/admin/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 后台是 CDN 加载的 Sveltia，等登录按钮出现（中文界面下按钮文案是「使用 GitHub 登录」）。
  const loginButton = page.getByRole('button', { name: /GitHub/ }).first();
  await loginButton.waitFor({ state: 'visible', timeout: 60000 });
  check('后台加载出「使用 GitHub 登录」按钮', true);

  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 30000 }),
    loginButton.click(),
  ]);
  check('点击登录后打开了授权弹窗', true, popup.url().slice(0, 90));

  if (DEBUG) {
    popup.on('console', (msg) => console.log(`[popup console] ${msg.type()}: ${msg.text().slice(0, 160)}`));
    popup.on('pageerror', (error) => console.log(`[popup error] ${String(error).slice(0, 160)}`));
    await page.evaluate(() => {
      window.__msgs = [];
      window.addEventListener('message', (event) => {
        window.__msgs.push({ data: String(event.data).slice(0, 70), origin: event.origin });
      });
    });
  }

  // /api/auth 是弹窗的第一个请求，等服务端记录到 302 再断言。
  for (let i = 0; i < 20 && !authRedirect; i += 1) await page.waitForTimeout(250);
  const authorize = authRedirect ? new URL(authRedirect) : null;
  check(
    '/api/auth 把弹窗送去 GitHub 授权页',
    Boolean(authorize) && `${authorize.origin}${authorize.pathname}` === 'https://github.com/login/oauth/authorize',
    String(authRedirect).slice(0, 120),
  );
  check(
    '授权页参数与后台约定一致（client_id / redirect_uri / scope）',
    authorize?.searchParams.get('client_id') === ENV.GITHUB_CLIENT_ID &&
      authorize?.searchParams.get('redirect_uri') === `${ORIGIN}/api/callback` &&
      authorize?.searchParams.get('scope') === 'repo',
    String(authRedirect).slice(0, 160),
  );

  // 真实 GitHub 那一跳（授权页 → 带 code 回跳）由测试服务等价模拟，见上面的注释。
  // 这里等的是「弹窗跟着 302 自己走到 /api/callback 并把令牌送进后台」。

  let stored = null;
  for (let i = 0; i < 30; i += 1) {
    stored = await page.evaluate(() => window.localStorage.getItem('sveltia-cms.user'));
    if (stored && stored.includes(TOKEN)) break;
    await page.waitForTimeout(1000);
  }
  handshakeDone = true;

  check('令牌经 /api/auth → GitHub → /api/callback 回到后台', Boolean(stored && stored.includes(TOKEN)),
    stored ? stored.slice(0, 140) : 'localStorage 里没有 sveltia-cms.user');

  const parsed = stored ? JSON.parse(stored) : {};
  check('后台保存的正是 access_token 字段', parsed.token === TOKEN, String(parsed.token));
  check('后台收到令牌后关掉了授权弹窗（说明握手被接受）', popup.isClosed(), popup.isClosed() ? '' : '弹窗仍开着');

  // 令牌被真正的客户端接受：它会带着令牌去调 GitHub API 取自己的账号信息。
  // 注意 Sveltia 用的是 GitHub 的 `token <...>` 方案（不是 Bearer），这里只认「头里含令牌」。
  let used = null;
  for (let i = 0; i < 20 && !used; i += 1) {
    used = usedTokens.find((r) => r.authorization.includes(TOKEN)) ?? null;
    if (!used) await page.waitForTimeout(500);
  }
  check(
    '后台带着令牌调用 GitHub API（令牌确实生效）',
    Boolean(used),
    used
      ? `${used.pathname} — ${used.authorization.replace(TOKEN, '<令牌>')}`
      : `未观察到带令牌的请求：${usedTokens.map((r) => r.pathname).join(', ').slice(0, 120)}`,
  );
  check('后台读到了账号资料（用令牌换回了用户名）', parsed.login === 'e2e-user' && Boolean(parsed.name), JSON.stringify(parsed).slice(0, 140));

  // 登录域名下不该出现「地址不对」的提示条。
  check('登录域名下不显示地址提示条', (await page.locator('#admin-origin-notice').count()) === 0);

  // 换成非登录域名时（config.yml 的 base_url 仍是线上域名），必须提前说清楚。
  // 用 cms-check.test（DNS 映射到本服务）模拟「在别的域名打开后台」。
  const mismatchPage = await context.newPage();
  await mismatchPage.goto(`http://cms-check.test:${PORT}/mismatch/admin/`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const notice = mismatchPage.locator('#admin-origin-notice');
  const noticeShown = await notice
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check(
    '从非登录域名打开后台时给出明确提示',
    noticeShown,
    noticeShown ? (await notice.textContent()).slice(0, 140) : '提示条没出现',
  );
  await mismatchPage.close();

  if (DEBUG) {
    const popupState = await popup
      .evaluate(() => ({
        opener: Boolean(window.opener),
        origin: window.location.origin,
        hint: document.getElementById('hint')?.textContent ?? '',
        body: document.body.innerText.slice(0, 120),
        isClosed: window.closed,
      }))
      .catch((error) => ({ error: String(error).slice(0, 160) }));
    console.log('[popup state]', JSON.stringify(popupState));
    console.log('[admin 收到的消息]', JSON.stringify(await page.evaluate(() => window.__msgs ?? [])));
  }

  // 令牌页不可缓存 + 不允许被第三方 opener 拿走，这两条在单元测试里断言过，
  // 这里再确认浏览器实际收到的响应头。
  const probe = await fetch(`${ORIGIN}/api/callback?code=${CODE}`);
  check('回调响应带 no-store', probe.headers.get('cache-control') === 'no-store');
  check('登录握手期间后台无脚本异常', errors.length === 0, errors.join(' | ').slice(0, 200));
} catch (error) {
  check('登录链路执行完成', false, String(error).split('\n')[0].slice(0, 200));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exitCode = failed.length ? 1 : 0;
