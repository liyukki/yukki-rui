import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/check-frontend.mjs', import.meta.url));
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

function run(files: string[]) {
  const directory = mkdtempSync(join(tmpdir(), 'yukki-frontend-test-'));
  directories.push(directory);
  for (const file of files) {
    const target = join(directory, 'dist', file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, '');
  }
  return spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
}

it('数据层页面存在也不能替代前端必需路由', () => {
  const result = run(['index.html', 'zh/index.html', 'en/index.html']);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('zh/about/index.html');
});

it('必需路由和默认分享图齐全后通过结构验收', () => {
  expect(run(['index.html', 'zh/index.html', 'en/index.html', 'zh/about/index.html', 'en/about/index.html', 'zh/tags/index.html', 'en/tags/index.html', '404.html', 'og-default.png']).status).toBe(0);
});
