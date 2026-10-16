/**
 * 可选的「后台配置体检」（不属于 CI，也不在 verify:frontend 里）。
 *
 * 为什么需要它：Sveltia CMS 遇到不认识的配置会直接停在「CMS 配置中存在错误」屏，
 * 整个后台都不能用。这类错误在浏览器里才会暴露（构建、类型检查、单元测试都看不到），
 * 而 config.yml 又是手改的。这个脚本把 public/admin/ 用本地 HTTP 服务起起来，
 * 用真实浏览器加载真实的 config.yml，断言没有配置错误、且登录入口正常出现。
 *
 * 依赖：playwright（不在 package.json 里；需要时 npm i -D playwright 并准备浏览器内核）。
 * 用法：node scripts/check-cms-config.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = join(ROOT, 'public/admin');
const PORT = Number(process.env.CMS_CONFIG_PORT ?? 4398);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** 只服务 public/admin/ 下的真实文件：不补丁、不改写，测的就是线上那一份。 */
const server = createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  // url.pathname 一定用 / 分隔：/admin/、/admin/index.html、/admin/config.yml
  const name = decodeURIComponent(url.pathname).replace(/^\/+/, '').replace(/^admin\/?/, '') || 'index.html';
  const file = join(ADMIN, name);
  if (!file.startsWith(ADMIN)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let body;
  try {
    body = readFileSync(file);
  } catch {
    res.writeHead(404).end('missing');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'text/plain; charset=utf-8' });
  res.end(body);
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
console.log(`本地服务已启动：${ORIGIN}/admin/`);
console.log(`后台目录内容：${readdirSync(ADMIN).join(', ')}`);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('这个体检需要 playwright：npm i -D playwright && npx playwright install chromium');
  server.close();
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: process.env.CMS_OAUTH_CHROME || undefined, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));

try {
  await page.goto(`${ORIGIN}/admin/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 加载完的判据：出现登录入口（欢迎屏）。配置有错时这一屏不会出现。
  const loginButton = page.getByRole('button', { name: /GitHub/ }).first();
  await loginButton.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});

  const text = await page.locator('body').innerText();
  const configError = /配置中存在错误|Configuration error|must be (an )?absolute path|is invalid\. It must not contain/i.test(text);
  check('config.yml 通过 Sveltia 校验（没有配置错误屏）', !configError,
    configError ? text.replace(/\s+/g, ' ').slice(0, 200) : '');

  const loginVisible = await loginButton.isVisible().catch(() => false);
  const buttons = loginVisible
    ? ''
    : await page.evaluate(() => [...document.querySelectorAll('button, a[role="button"]')].map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 24)).filter(Boolean).join(' | '));
  check('后台加载出登录入口', loginVisible,
    loginVisible ? '' : `页面按钮：${buttons.slice(0, 200)} ｜ 正文：${text.replace(/\s+/g, ' ').slice(0, 160)}`);

  // config.yml 里的关键约定：登录入口必须指向 Cloudflare 那份部署，
  // 否则在任何域名下打开都登不进去（见 public/admin/index.html 的提示条）。
  const config = readFileSync(join(ADMIN, 'config.yml'), 'utf8');
  check('backend 指向 liyukki/yukki-rui@master', /repo:\s*liyukki\/yukki-rui/.test(config) && /branch:\s*master/.test(config));
  check('base_url 与 auth_endpoint 已配置', /base_url:\s*https:\/\/yukki-rui\.pages\.dev/.test(config) && /auth_endpoint:\s*\/api\/auth/.test(config));
  check('登录脚本指向 Sveltia（含版本号）', /@sveltia\/cms@\d+\.\d+\.\d+\/dist\/sveltia-cms\.js/.test(readFileSync(join(ADMIN, 'index.html'), 'utf8')));

  check('加载期间无脚本异常', errors.length === 0, errors.join(' | ').slice(0, 200));
} catch (error) {
  check('后台配置体检执行完成', false, String(error).split('\n')[0].slice(0, 200));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exitCode = failed.length ? 1 : 0;
