#!/usr/bin/env node
/** 两种 base 下构建并检查全部真实产物；不创建源代码探针，不覆盖 dist。 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanBuild } from './check-links.mjs';
import { LOCAL_SITE_URL, resolveSiteUrl } from '../src/lib/site-config.mjs';

/**
 * Windows 上临时目录常位于另一盘符，Astro 构建时 rename 产物会因
 * EXDEV 跨设备错误失败。将临时构建目录放到项目内，构建后删除。
 */
function makeBuildRoot() {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  return mkdtempSync(join(projectRoot, '.tmp-base-check-'));
}

/** @param {string} base @param {string} directory @param {string=} project */
export function buildForBase(base, directory, project = fileURLToPath(new URL('../', import.meta.url))) {
  // 两次部署共享 origin，但各自的公共路径由 base 决定。
  const origin = new URL(process.env.SITE_URL ?? LOCAL_SITE_URL).origin;
  const site = resolveSiteUrl(origin, base);
  const cli = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
  try {
    execFileSync(process.execPath, [cli, 'build', '--outDir', directory], {
      cwd: project,
      encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, SITE_BASE: base, SITE_URL: site },
    });
  } catch (error) {
    throw new Error(`构建失败（base = ${base}）\n${error.stdout ?? ''}\n${error.stderr ?? ''}`);
  }
  return { site, result: scanBuild(directory, base, site) };
}

function assertValid(result, base) {
  if (result.broken.length) throw new Error(`base = ${base} 有坏链接：\n${result.broken.map((item) => `${item.page} → ${item.ref}（${item.reason}）`).join('\n')}`);
  console.log(`✓ base = ${base}：${result.pages} 个真实页面，${result.checked} 条站内引用通过`);
}

function main() {
  const keep = process.argv.includes('--keep');
  const selfTest = process.argv.includes('--self-test');
  const directory = makeBuildRoot();
  try {
    const root = buildForBase('/', join(directory, 'root'));
    assertValid(root.result, '/');
    const subdirectory = join(directory, 'subpath');
    const sub = buildForBase('/yukki-rui/', subdirectory);
    assertValid(sub.result, '/yukki-rui/');
    const rootFiles = [...root.result.files].sort();
    const subFiles = [...sub.result.files].sort();
    // CSS/JS 文件名可能受 base 影响；页面与订阅、sitemap、robots 必须完全对应。
    const routes = (files) => files.filter((file) => /\.(html|xml)$/.test(file) || file === 'robots.txt');
    if (JSON.stringify(routes(rootFiles)) !== JSON.stringify(routes(subFiles))) throw new Error('两种 base 的路由产物不一致');
    console.log('✓ 两种部署路径的实际页面和订阅产物一致');
    if (selfTest) {
      // 在现有首页产物中注入坏链接，不使用探针，也不修改源文件。
      const index = join(subdirectory, 'index.html');
      const original = readFileSync(index, 'utf8');
      writeFileSync(index, original.replace('</body>', '<a href="/">wrong-base</a></body>'));
      const result = scanBuild(subdirectory, '/yukki-rui/', sub.site);
      if (!result.broken.some((item) => item.page === 'index.html' && item.ref === '/')) throw new Error('失败路径自检失败：未抓到真实页面里注入的错误前缀');
      writeFileSync(index, original);
      console.log('✓ 失败路径自检：真实页面中的错误部署前缀被拒绝');
    }
  } finally {
    if (keep) console.log(`保留临时产物：${directory}`);
    else rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
