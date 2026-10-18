import { describe, expect, it } from 'vitest';
import {
  countReadingMinutes,
  formatReadingTime,
  selectTocHeadings,
} from '../src/lib/reading';

describe('countReadingMinutes', () => {
  it('空文本按 1 分钟算', () => {
    expect(countReadingMinutes('')).toBe(1);
  });

  it('300 个汉字约 1 分钟', () => {
    expect(countReadingMinutes('字'.repeat(300))).toBe(1);
    expect(countReadingMinutes('字'.repeat(301))).toBe(2);
  });

  it('200 个英文单词约 1 分钟', () => {
    expect(countReadingMinutes('word '.repeat(200))).toBe(1);
    expect(countReadingMinutes('word '.repeat(201))).toBe(2);
  });

  it('中英混排分别累加', () => {
    // 300 个汉字 = 1 分钟；额外 200 个英文词 = 再 1 分钟
    const text = `${'字'.repeat(300)} ${'word '.repeat(200)}`;
    expect(countReadingMinutes(text)).toBe(2);
  });

  it('标点与代码符号不算英文词', () => {
    expect(countReadingMinutes('---```[](){}'.repeat(50))).toBe(1);
  });
});

describe('selectTocHeadings', () => {
  it('只保留 h2 与 h3', () => {
    const headings = [
      { depth: 1, slug: 'title', text: '标题' },
      { depth: 2, slug: 'a', text: 'A' },
      { depth: 3, slug: 'b', text: 'B' },
      { depth: 4, slug: 'c', text: 'C' },
    ];
    expect(selectTocHeadings(headings)).toEqual([
      { depth: 2, slug: 'a', text: 'A' },
      { depth: 3, slug: 'b', text: 'B' },
    ]);
  });

  it('空数组返回空数组', () => {
    expect(selectTocHeadings([])).toEqual([]);
  });
});

describe('formatReadingTime', () => {
  it('替换模板中的 {minutes}', () => {
    expect(formatReadingTime(3, '约 {minutes} 分钟')).toBe('约 3 分钟');
    expect(formatReadingTime(5, '{minutes} min read')).toBe('5 min read');
  });

  it('没有占位符时原样返回模板', () => {
    expect(formatReadingTime(3, '约 3 分钟')).toBe('约 3 分钟');
  });
});
