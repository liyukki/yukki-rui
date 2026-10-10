import { describe, expect, it } from 'vitest';
import {
  normalizeBase,
  normalizeBaseValue,
  probeSource,
  readBuildBase,
} from '../scripts/check-base-parity.mjs';

describe('normalizeBase', () => {
  it('剥掉子路径前缀', () => {
    expect(normalizeBase('<a href="/yukki-rui/zh/">x</a>', '/yukki-rui')).toBe(
      '<a href="/zh/">x</a>',
    );
  });

  it('带结尾斜杠的 base 也能剥', () => {
    expect(normalizeBase('href="/yukki-rui/zh/"', '/yukki-rui/')).toBe('href="/zh/"');
  });

  it('根 base 已经是目标刻度，原样返回', () => {
    expect(normalizeBase('<a href="/zh/">x</a>', '/')).toBe('<a href="/zh/">x</a>');
  });

  it('裸 base（withBase 空路径的产物）也能剥干净', () => {
    expect(normalizeBase('<a href="/yukki-rui/">root</a>', '/yukki-rui')).toBe(
      '<a href="/">root</a>',
    );
  });

  it('不会破坏 HTML 闭合标签', () => {
    expect(normalizeBase('</a></html>', '/yukki-rui')).toBe('</a></html>');
  });

  it('正确实现的两种产物归一化后相等', () => {
    const a = '<a href="/zh/">x</a><img src="/og-default.png">';
    const b = '<a href="/yukki-rui/zh/">x</a><img src="/yukki-rui/og-default.png">';
    expect(normalizeBase(a, '/')).toBe(normalizeBase(b, '/yukki-rui'));
  });

  /**
   * 这条测试记录的是归一化比较的**固有限制**，不是它要抓的 bug。
   *
   * 如果探针页漏写 base，两次构建的 href 都是 '/zh/'，归一化后完全一样 ——
   * 相等性检查通不出问题。所以脚本必须靠另外两道防线：
   *   1. 身份标记（产物自己声明 base）：证明这次比较是有效的比较；
   *   2. 前缀检查（子路径构建下助手链接必须带 /yukki-rui）。
   */
  it('漏写 base 时两份产物归一化后仍然相等 —— 固有限制，故需要身份标记与前缀检查', () => {
    const a = '<a href="/zh/">x</a>';
    const b = '<a href="/zh/">x</a>';
    expect(normalizeBase(a, '/')).toBe(normalizeBase(b, '/yukki-rui'));
  });
});

describe('readBuildBase', () => {
  it('读出产物声明的 base', () => {
    const html = '<meta name="probe-build-base" content="/yukki-rui" />';
    expect(readBuildBase(html)).toBe('/yukki-rui');
  });

  it('根部署时读出 /', () => {
    expect(readBuildBase('<meta name="probe-build-base" content="/" />')).toBe('/');
  });

  it('没有标记时返回 null（比返回错误值更安全）', () => {
    expect(readBuildBase('<html></html>')).toBeNull();
  });
});

describe('normalizeBaseValue', () => {
  it('子路径带尾斜杠归一化为不带', () => {
    expect(normalizeBaseValue('/yukki-rui/')).toBe('/yukki-rui');
  });

  it('根路径归一化为 /', () => {
    expect(normalizeBaseValue('/')).toBe('/');
  });

  it('多个尾斜杠也能归一化', () => {
    expect(normalizeBaseValue('/yukki-rui//')).toBe('/yukki-rui');
  });

  it('null 与 undefined 原样返回 null', () => {
    expect(normalizeBaseValue(null)).toBeNull();
    expect(normalizeBaseValue(undefined)).toBeNull();
  });
});

describe('probeSource', () => {
  const source = probeSource();

  it('用 BASE_URL 生成身份标记', () => {
    expect(source).toContain('import.meta.env.BASE_URL');
    expect(source).toContain('probe-build-base');
  });

  it('助手链接覆盖 withBase / postHref / tagHref', () => {
    expect(source).toContain("withBase('')");
    expect(source).toContain("withBase('zh/')");
    expect(source).toContain("postHref('zh', 'hello-world')");
    expect(source).toContain("tagHref('zh', '随笔')");
  });

  it('包含一条硬编码反例，用于证明检查器会报警', () => {
    expect(source).toContain("const badHardcoded = '/zh/';");
    expect(source).toContain('href={badHardcoded}');
  });

  it('探针本身的标签链接不是硬编码的', () => {
    // id="lang" 那条必须用 withBase，否则正常模式永远报错
    expect(source).toMatch(/id="lang" href=\{withBase\('zh\/'\)\}/);
  });
});
