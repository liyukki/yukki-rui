import { describe, expect, it } from 'vitest';
import { joinBase } from '../src/lib/url';

/**
 * withBase() 依赖 import.meta.env.BASE_URL，在 vitest 下固定为 '/'，
 * 无法切换两种部署形态。因此把纯逻辑抽成可注入 base 的 joinBase() 来测。
 */
describe('joinBase', () => {
  it('根路径 base 下不产生双斜杠', () => {
    expect(joinBase('/', 'zh/')).toBe('/zh/');
  });

  it('子路径 base 下正确拼接（BASE_URL 实测没有结尾斜杠）', () => {
    expect(joinBase('/yukki-rui', 'zh/')).toBe('/yukki-rui/zh/');
  });

  it('子路径 base 带结尾斜杠时也不重复', () => {
    expect(joinBase('/yukki-rui/', 'zh/')).toBe('/yukki-rui/zh/');
  });

  it('传入前导斜杠的 path 也能正确处理', () => {
    expect(joinBase('/yukki-rui', '/zh/')).toBe('/yukki-rui/zh/');
  });

  it('空 path 返回 base 根', () => {
    expect(joinBase('/yukki-rui', '')).toBe('/yukki-rui/');
    expect(joinBase('/', '')).toBe('/');
  });

  it('文章路径在两种 base 下都正确', () => {
    expect(joinBase('/', 'zh/posts/hello-world/')).toBe('/zh/posts/hello-world/');
    expect(joinBase('/yukki-rui', 'zh/posts/hello-world/')).toBe(
      '/yukki-rui/zh/posts/hello-world/',
    );
  });
});
