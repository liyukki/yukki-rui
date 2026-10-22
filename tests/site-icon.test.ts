import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);

function pngSize(name: string) {
  const buffer = readFileSync(new URL(`public/${name}`, root));
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('站点标签图标', () => {
  it.each([
    ['favicon-16x16.png', 16],
    ['favicon-32x32.png', 32],
    ['favicon-48x48.png', 48],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ])('%s 是 %ix%i 的 PNG', (name, size) => {
    expect(pngSize(name)).toEqual({ width: size, height: size });
  });

  it('多尺寸 favicon.ico 存在且包含图标目录', () => {
    const ico = readFileSync(new URL('public/favicon.ico', root));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(3);
  });

  it('head 使用带部署 base 的图标和 manifest 地址', () => {
    const head = readFileSync(new URL('src/components/BaseHead.astro', root), 'utf8');
    for (const path of [
      '/favicon.ico',
      '/favicon-16x16.png',
      '/favicon-32x32.png',
      '/favicon-48x48.png',
      '/apple-touch-icon.png',
      '/site.webmanifest',
    ]) {
      expect(head).toContain(`withBase('${path}')`);
    }
  });

  it('manifest 指向可安装图标', () => {
    const manifest = JSON.parse(readFileSync(new URL('public/site.webmanifest', root), 'utf8')) as {
      icons: Array<{ src: string; sizes: string }>;
    };
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      ]),
    );
  });
});
