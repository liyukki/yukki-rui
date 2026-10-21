import { describe, expect, it } from 'vitest';
import { selectRelatedPosts } from '../src/lib/related';
import type { PostLike } from '../src/lib/post-select';

function post(overrides: Partial<PostLike['data']> & { id: string }): PostLike {
  const { id, ...data } = overrides;
  return {
    id,
    data: {
      title: id,
      description: 'desc',
      pubDate: new Date('2026-01-01'),
      lang: 'zh',
      tags: [],
      draft: false,
      featured: false,
      ...data,
    },
  };
}

describe('selectRelatedPosts', () => {
  it('按标签重合数排序', () => {
    const target = post({ id: 't', tags: ['a', 'b'] });
    const list = [target, post({ id: 'one', tags: ['a'] }), post({ id: 'two', tags: ['a', 'b'] })];
    expect(selectRelatedPosts(target, list).map((p) => p.id)).toEqual(['two', 'one']);
  });

  it('排除自己、排除草稿、排除其他语言', () => {
    const target = post({ id: 't', tags: ['a'] });
    const list = [
      target,
      post({ id: 'draft', tags: ['a'], draft: true }),
      post({ id: 'en', tags: ['a'], lang: 'en' }),
      post({ id: 'ok', tags: ['a'] }),
    ];
    expect(selectRelatedPosts(target, list).map((p) => p.id)).toEqual(['ok']);
  });

  it('零重合不返回任何文章', () => {
    const target = post({ id: 't', tags: ['a'] });
    expect(selectRelatedPosts(target, [target, post({ id: 'other', tags: ['z'] })])).toEqual([]);
  });

  it('目标无标签时返回空数组', () => {
    const target = post({ id: 't', tags: [] });
    expect(selectRelatedPosts(target, [target, post({ id: 'other', tags: ['a'] })])).toEqual([]);
  });

  it('重合数相同按发布日期倒序,再按 id 升序', () => {
    const target = post({ id: 't', tags: ['a'] });
    const list = [
      target,
      post({ id: 'b', tags: ['a'], pubDate: new Date('2026-01-01') }),
      post({ id: 'a', tags: ['a'], pubDate: new Date('2026-01-01') }),
      post({ id: 'new', tags: ['a'], pubDate: new Date('2026-03-01') }),
    ];
    expect(selectRelatedPosts(target, list).map((p) => p.id)).toEqual(['new', 'a', 'b']);
  });

  it('默认最多 3 篇', () => {
    const target = post({ id: 't', tags: ['a'] });
    const list = [target, ...[1, 2, 3, 4].map((n) => post({ id: `p${n}`, tags: ['a'] }))];
    expect(selectRelatedPosts(target, list)).toHaveLength(3);
  });
});