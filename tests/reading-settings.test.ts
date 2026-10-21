import { describe, expect, it } from 'vitest';
import {
  READING_DEFAULTS,
  normalizeReadingSettings,
  readReadingSettings,
} from '../src/lib/reading-settings';

describe('normalizeReadingSettings', () => {
  it('空值返回默认值', () => {
    expect(normalizeReadingSettings(null)).toEqual(READING_DEFAULTS);
    expect(normalizeReadingSettings(undefined)).toEqual(READING_DEFAULTS);
    expect(normalizeReadingSettings({})).toEqual(READING_DEFAULTS);
  });

  it('保留合法值', () => {
    expect(normalizeReadingSettings({ size: 'lg', line: 'tight', width: 'wide' })).toEqual({
      size: 'lg', line: 'tight', width: 'wide',
    });
  });

  it('非法值逐项退回默认,不影响其他项', () => {
    expect(normalizeReadingSettings({ size: 'huge', line: 'loose', width: 12 })).toEqual({
      size: READING_DEFAULTS.size, line: 'loose', width: READING_DEFAULTS.width,
    });
  });
});

describe('readReadingSettings', () => {
  it('storage 为空时返回默认值', () => {
    expect(readReadingSettings(null)).toEqual(READING_DEFAULTS);
  });

  it('storage 抛错时返回默认值(隐私模式)', () => {
    const storage = { getItem() { throw new Error('blocked'); } };
    expect(readReadingSettings(storage)).toEqual(READING_DEFAULTS);
  });

  it('解析 JSON 失败时返回默认值', () => {
    const storage = { getItem: () => '{not json' };
    expect(readReadingSettings(storage)).toEqual(READING_DEFAULTS);
  });

  it('读取已保存的合法设置', () => {
    const storage = { getItem: () => JSON.stringify({ size: 'sm', line: 'tight', width: 'narrow' }) };
    expect(readReadingSettings(storage)).toEqual({ size: 'sm', line: 'tight', width: 'narrow' });
  });
});
