#!/usr/bin/env node
/** 检查全部 HTML、RSS、sitemap、robots 的站内引用与部署前缀。 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_SITE_URL, normalizeSiteBase, resolveSiteUrl } from '../src/lib/site-config.mjs';

const ignored = (ref) => !ref || ref.startsWith('#') || /^(?!https?:)[a-z][\w+.-]*:/i.test(ref);
const decodeEntities = (ref) => ref.replace(/&amp;/g, '&').replace(/&#(?:0*38|x0*26);/gi, '&');

/** @param {string} html @param {string=} site */
export function extractRefs(html, site) {
  const refs = [];
  for (const tag of html.matchAll(/<[a-z][^>]*>/gi)) {
    for (const attribute of tag[0].matchAll(/\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const ref = decodeEntities(attribute[1] ?? attribute[2] ?? attribute[3]);
      if (ignored(ref)) continue;
      if (/^(https?:)?\/\//i.test(ref) && (!site || new URL(ref, site).origin !== new URL(site).origin)) continue;
      refs.push(ref);
    }
  }
  return refs;
}

/**
 * @param {string} ref
 * @param {string} base
 * @param {(path: string) => boolean} fileExists
 * @param {string} page 文件相对 dist 的位置，用于解析相对引用
 * @param {string=} site 同站绝对链接也需要检查
 * @returns {'ok' | 'missing' | 'external'}
 */
export function resolveRef(ref, base, fileExists, page = 'index.html', site) {
  if (ignored(ref)) return 'external';
  const publicSite = site ?? LOCAL_SITE_URL;
  const prefix = normalizeSiteBase(base);
  try {
    const origin = new URL(publicSite).origin;
    const url = new URL(decodeEntities(ref), `${origin}${prefix}${page}`);
    if (url.origin !== origin) return 'external';
    if (/^(https?:)?\/\//i.test(ref) && !site) return 'external';
    if (prefix !== '/' && url.pathname !== prefix.slice(0, -1) && !url.pathname.startsWith(prefix)) return 'missing';
    const pathname = url.pathname === prefix.slice(0, -1) ? prefix : url.pathname;
    const key = decodeURIComponent(pathname.slice(prefix.length));
    if (key.endsWith('/') || key === '') return fileExists(`${key}index.html`) ? 'ok' : 'missing';
    return fileExists(key) || fileExists(`${key}/index.html`) ? 'ok' : 'missing';
  } catch {
    return 'missing';
  }
}

function walk(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const key = prefix + entry.name;
    return entry.isDirectory() ? walk(join(directory, entry.name), `${key}/`) : [key];
  });
}

function attribute(tag, name) {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(pattern);
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3]) : undefined;
}

/** @param {string} directory @param {string} base @param {string} site */
export function scanBuild(directory, base, site) {
  const files = walk(directory);
  const existing = new Set(files);
  const broken = [];
  let checked = 0;
  for (const page of files.filter((file) => /\.(html|xml)$/.test(file) || file === 'robots.txt')) {
    const source = readFileSync(join(directory, page), 'utf8');
    const refs = extractRefs(source, site).map((ref) => ({ ref, local: false }));
    if (page.endsWith('.html')) {
      for (const tag of source.matchAll(/<(?:link|meta)\s[^>]*>/gi)) {
        const rel = attribute(tag[0], 'rel');
        const property = attribute(tag[0], 'property');
        if (rel === 'canonical' || (rel === 'alternate' && (attribute(tag[0], 'hreflang') || attribute(tag[0], 'type') === 'application/rss+xml'))) {
          const ref = attribute(tag[0], 'href');
          if (ref) refs.push({ ref, local: true });
        }
        if (property === 'og:url' || property === 'og:image') {
          const ref = attribute(tag[0], 'content');
          if (ref) refs.push({ ref, local: true });
        }
      }
    } else if (page.endsWith('.xml')) {
      for (const match of source.matchAll(/<(?:link|loc)>([^<]+)<\/(?:link|loc)>/gi)) refs.push({ ref: decodeEntities(match[1]), local: true });
    } else {
      for (const match of source.matchAll(/^Sitemap:\s*(\S+)/gm)) refs.push({ ref: match[1], local: true });
    }
    for (const { ref, local } of refs) {
      const result = resolveRef(ref, base, (key) => existing.has(key), page, site);
      if (result === 'external' && !local) continue;
      checked++;
      if (result !== 'ok') broken.push({ page, ref, reason: result === 'external' ? '站点地址不一致' : '路径前缀错误或目标不存在' });
    }
  }
  return { pages: files.filter((file) => file.endsWith('.html')).length, checked, broken, files };
}

function main() {
  if (!existsSync('dist')) throw new Error('dist/ 不存在，请先运行 npm run build');
  const base = process.env.SITE_BASE ?? '/';
  const site = resolveSiteUrl(process.env.SITE_URL ?? LOCAL_SITE_URL, base);
  const result = scanBuild('dist', base, site);
  console.log(`已扫描 ${result.pages} 个 HTML 页面及 XML/robots，检查 ${result.checked} 条站内引用（base = ${base}）`);
  if (result.broken.length) {
    for (const item of result.broken) console.error(`  ${item.page} → ${item.ref}（${item.reason}）`);
    process.exitCode = 1;
  } else console.log('✓ 无死链，站内路径和站点地址正确');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
