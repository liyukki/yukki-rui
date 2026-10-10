#!/usr/bin/env node
/**
 * 构建产物站内链接自检。
 *
 * 检查 dist/ 下每个 HTML 里引用的站内资源是否真实存在。
 * 外部链接不请求（离线环境下不误报，也不给别人添流量）。
 * 同时兼容根部署（base = '/'）与子路径部署（base = '/yukki-rui'）。
 *
 * 用法：
 *   node scripts/check-links.mjs
 *   SITE_BASE=/yukki-rui node scripts/check-links.mjs   # PowerShell: $env:SITE_BASE="/yukki-rui"
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REF_PATTERN = /(?:href|src)="([^"]+)"/g;

const isExternal = (ref) =>
  /^(https?:)?\/\//.test(ref) ||
  ref.startsWith('#') ||
  ref.startsWith('mailto:') ||
  ref.startsWith('data:') ||
  !ref.startsWith('/');

/** 抽出页面里所有站内引用（去掉外部链接、mailto、纯锚点、相对链接）。 */
export function extractRefs(html) {
  const refs = [];
  for (const match of html.matchAll(REF_PATTERN)) {
    const ref = match[1];
    if (!isExternal(ref)) refs.push(ref);
  }
  return refs;
}

/**
 * 判断一个站内引用是否可达。
 *
 * @param ref        页面里的原始引用，如 '/yukki-rui/zh/'
 * @param base       部署 base，如 '/' 或 '/yukki-rui'
 * @param fileExists 接收「相对 dist 的路径」如 'zh/index.html'，返回布尔值
 * @returns 'ok' | 'missing' | 'external'
 */
export function resolveRef(ref, base, fileExists) {
  if (isExternal(ref)) return 'external';

  // 先剥掉 base 前缀，把引用还原成「站点根相对路径」
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  let path = ref;
  if (root && path.startsWith(root)) path = path.slice(root.length);
  if (!path.startsWith('/')) path = `/${path}`;

  const toKey = (p) => p.replace(/^\//, '');

  if (path.endsWith('/')) return fileExists(`${toKey(path)}index.html`) ? 'ok' : 'missing';
  if (fileExists(toKey(path))) return 'ok';
  return fileExists(`${toKey(path)}/index.html`) ? 'ok' : 'missing';
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function main() {
  const dist = 'dist';
  if (!existsSync(dist)) {
    console.error('dist/ 不存在，先跑构建：npm run build');
    process.exit(1);
  }

  const base = process.env.SITE_BASE ?? '/';
  const files = walk(dist);
  const relativeFiles = new Set(files.map((f) => relative(dist, f).replace(/\\/g, '/')));
  const fileExists = (p) => relativeFiles.has(p);

  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const broken = [];
  let checked = 0;

  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    for (const ref of extractRefs(html)) {
      const result = resolveRef(ref, base, fileExists);
      if (result === 'external') continue;
      checked += 1;
      if (result === 'missing') {
        broken.push({ page: relative(dist, file).replace(/\\/g, '/'), ref });
      }
    }
  }

  console.log(
    `已扫描 ${htmlFiles.length} 个页面，检查 ${checked} 条站内链接（base = ${base}）`,
  );

  if (broken.length > 0) {
    console.error(`\n发现 ${broken.length} 条死链：`);
    for (const item of broken) console.error(`  ${item.page} → ${item.ref}`);
    process.exit(1);
  }
  console.log('✓ 无死链');
}

// 仅在直接执行时跑 main；被 import 时不跑（否则单元测试无法导入纯函数）
if (process.argv[1] && process.argv[1].endsWith('check-links.mjs')) main();
