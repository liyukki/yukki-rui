import { describe, expect, it } from 'vitest';
import { groupPostsByYear } from '../src/lib/archive';

/** 测试只需要 pubDate，其余字段用最小替身。 */
function post(year: number, month: number, day: number, id: string) {
  return { id, data: { pubDate: new Date(Date.UTC(year, month - 1, day)) } };
}

describe('groupPostsByYear', () => {
  it('空数组返回空数组', () => {
    expect(groupPostsByYear([])).toEqual([]);
  });

  it('按年份倒序分组', () => {
    const grouped = groupPostsByYear([
      post(2024, 3, 1, 'a'),
      post(2026, 1, 2, 'b'),
      post(2025, 7, 8, 'c'),
    ]);
    expect(grouped.map((item) => item.year)).toEqual([2026, 2025, 2024]);
  });

  it('组内按发布日期倒序', () => {
    const grouped = groupPostsByYear([
      post(2026, 1, 2, 'older'),
      post(2026, 10, 16, 'newer'),
      post(2026, 5, 5, 'middle'),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].posts.map((item) => item.id)).toEqual(['newer', 'middle', 'older']);
  });

  it('同一天的文章保持传入顺序的稳定排序', () => {
    const grouped = groupPostsByYear([post(2026, 10, 16, 'first'), post(2026, 10, 16, 'second')]);
    expect(grouped[0].posts.map((item) => item.id)).toEqual(['first', 'second']);
  });
});
