import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

async function config(site: string, base: string) {
  vi.stubEnv('SITE_URL', site);
  vi.stubEnv('SITE_BASE', base);
  vi.resetModules();
  return (await import('../astro.config.mjs')).default;
}

describe('构建地址作为唯一站点地址', () => {
  it('把站点 origin 和部署子路径组合成同一个公开地址', async () => {
    const result = await config('https://owner.github.io', '/yukki-rui');
    expect(result.site).toBe('https://owner.github.io/yukki-rui/');
    expect(result.base).toBe('/yukki-rui/');
  });

  it('根路径部署不会沿用 GitHub 子路径', async () => {
    expect((await config('https://yukki-rui.pages.dev/', '/')).site).toBe('https://yukki-rui.pages.dev/');
  });

  it('明确给出的地址路径与部署 base 冲突时拒绝构建', async () => {
    await expect(config('https://owner.github.io/other/', '/yukki-rui')).rejects.toThrow('SITE_URL');
  });

  it('站点元信息读取 Astro 注入的地址', async () => {
    vi.stubEnv('SITE', 'https://yukki-rui.pages.dev/');
    vi.resetModules();
    const { SITE } = await import('../src/consts');
    expect(SITE.url).toBe('https://yukki-rui.pages.dev/');
  });
});
