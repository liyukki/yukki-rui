import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/check-links.mjs', import.meta.url));
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

function check(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'yukki-links-test-'));
  directories.push(directory);
  for (const [file, content] of Object.entries(files)) {
    const target = join(directory, 'dist', file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return spawnSync(process.execPath, [script], {
    cwd: directory, encoding: 'utf8',
    env: { ...process.env, SITE_BASE: '/blog/', SITE_URL: 'https://site.test/blog/' },
  });
}

describe('CLI 检查真实页面与 XML 产物', () => {
  it('正确的跨页面链接可以通过', () => {
    expect(check({
      'index.html': '<a href="/blog/zh/">中文</a>',
      'zh/index.html': '<a href="/blog/">首页</a>',
    }).status).toBe(0);
  });

  it('非探针页面漏写 base 会失败，即使目标文件存在', () => {
    const result = check({ 'index.html': '', 'zh/index.html': '', 'other/index.html': '<a href="/zh/">坏链接</a>' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('other/index.html');
    expect(result.stderr).toContain('/zh/');
  });

  it('RSS 中缺少部署前缀的文章地址会失败', () => {
    const result = check({ 'index.html': '', 'zh/index.html': '', 'rss.xml': '<rss><channel><link>https://site.test/zh/</link></channel></rss>' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('rss.xml');
  });

  it('sitemap 中与配置站点不一致的地址会失败', () => {
    const result = check({ 'index.html': '', 'sitemap-0.xml': '<urlset><url><loc>https://wrong.test/blog/</loc></url></urlset>' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('wrong.test');
  });

  it('相对链接指向缺失页面会失败', () => {
    expect(check({ 'index.html': '<a href="missing/">坏链接</a>' }).status).toBe(1);
  });
});
