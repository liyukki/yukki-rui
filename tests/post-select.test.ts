import { describe, expect, it } from 'vitest';
import {
  collectTags,
  compareByDateDesc,
  findTranslation,
  selectPosts,
  type PostLike,
} from '../src/lib/post-select';

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

const entries: PostLike[] = [
  post({ id: 'zh-old', pubDate: new Date('2026-01-01') }),
  post({ id: 'zh-new', pubDate: new Date('2026-05-01') }),
  post({ id: 'zh-draft', pubDate: new Date('2026-06-01'), draft: true }),
  post({ id: 'en-new', lang: 'en', pubDate: new Date('2026-03-01') }),
];

describe('selectPosts', () => {
  it('只返回指定语言的文章', () => {
    const ids = selectPosts(entries, 'zh', false).map((p) => p.id);
    expect(ids).toContain('zh-new');
    expect(ids).not.toContain('en-new');
  });

  it('按发布日期倒序', () => {
    const ids = selectPosts(entries, 'zh', true).map((p) => p.id);
    expect(ids).toEqual(['zh-new', 'zh-old']);
  });

  it('生产模式隐藏草稿', () => {
    const ids = selectPosts(entries, 'zh', true).map((p) => p.id);
    expect(ids).not.toContain('zh-draft');
  });

  it('开发模式保留草稿以便预览', () => {
    const ids = selectPosts(entries, 'zh', false).map((p) => p.id);
    expect(ids).toContain('zh-draft');
  });

  it('生产模式隐藏未到点的定时文章', () => {
    const now = new Date('2026-05-10T00:00:00Z');
    const future = post({ id: 'future', pubDate: new Date('2026-05-01'), publishAt: new Date('2026-06-01T00:00:00Z') });
    const ids = selectPosts([...entries, future], 'zh', true, now).map((p) => p.id);
    expect(ids).not.toContain('future');
  });

  it('到点后定时文章可见', () => {
    const now = new Date('2026-06-02T00:00:00Z');
    const due = post({ id: 'due', pubDate: new Date('2026-05-01'), publishAt: new Date('2026-06-01T00:00:00Z') });
    const ids = selectPosts([...entries, due], 'zh', true, now).map((p) => p.id);
    expect(ids).toContain('due');
  });

  it('draft 压过 publishAt', () => {
    const now = new Date('2026-06-02T00:00:00Z');
    const blocked = post({ id: 'blocked', draft: true, publishAt: new Date('2026-06-01T00:00:00Z') });
    const ids = selectPosts([...entries, blocked], 'zh', true, now).map((p) => p.id);
    expect(ids).not.toContain('blocked');
  });

  it('开发模式保留未到点的定时文章以便本地预览', () => {
    const future = post({ id: 'future', publishAt: new Date('2030-01-01T00:00:00Z') });
    const ids = selectPosts([...entries, future], 'zh', false).map((p) => p.id);
    expect(ids).toContain('future');
  });

  it('精选文章排在最前，其余仍按日期倒序', () => {
    const list = [
      post({ id: 'zh-old', pubDate: new Date('2026-01-01'), featured: true }),
      post({ id: 'zh-new', pubDate: new Date('2026-05-01') }),
      post({ id: 'zh-mid', pubDate: new Date('2026-03-01') }),
    ];
    expect(selectPosts(list, 'zh', true).map((p) => p.id)).toEqual(['zh-old', 'zh-new', 'zh-mid']);
  });

  it('同一天且都精选时按 id 升序，结果稳定', () => {
    const date = new Date('2026-05-01');
    const list = [
      post({ id: 'b', pubDate: date, featured: true }),
      post({ id: 'a', pubDate: date, featured: true }),
    ];
    expect(selectPosts(list, 'zh', true).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('compareByDateDesc', () => {
  it('纯时间排序忽略 featured', () => {
    const list = [
      post({ id: 'old-featured', pubDate: new Date('2026-01-01'), featured: true }),
      post({ id: 'new-normal', pubDate: new Date('2026-05-01') }),
    ];
    expect([...list].sort(compareByDateDesc).map((p) => p.id)).toEqual(['new-normal', 'old-featured']);
  });
});

describe('collectTags', () => {
  it('统计标签并按数量倒序', () => {
    const tagged = [
      post({ id: 'a', tags: ['随笔', '技术'] }),
      post({ id: 'b', tags: ['技术'] }),
      post({ id: 'c', tags: ['技术'] }),
    ];
    expect(collectTags(tagged)).toEqual([
      { tag: '技术', count: 3 },
      { tag: '随笔', count: 1 },
    ]);
  });

  it('没有标签时返回空数组', () => {
    expect(collectTags([post({ id: 'a' })])).toEqual([]);
  });
});

describe('findTranslation', () => {
  it('找到另一语言中 translationKey 相同的文章', () => {
    const zh = post({ id: 'zh', translationKey: 'hello-world' });
    const en = post({ id: 'en', lang: 'en', translationKey: 'hello-world' });
    expect(findTranslation([zh, en], zh)?.id).toBe('en');
  });

  it('没有译文时返回 undefined', () => {
    const zh = post({ id: 'zh', translationKey: 'lonely' });
    expect(findTranslation([zh], zh)).toBeUndefined();
  });

  it('没写 translationKey 时返回 undefined', () => {
    const zh = post({ id: 'zh' });
    expect(findTranslation([zh], zh)).toBeUndefined();
  });

  it('不会返回自己', () => {
    const zh = post({ id: 'zh', translationKey: 'same' });
    expect(findTranslation([zh], zh)).toBeUndefined();
  });

  it('生产环境不会把未发布的译文作为语言切换目标', () => {
    const zh = post({ id: 'zh', translationKey: 'same' });
    const draft = post({ id: 'en-draft', lang: 'en', translationKey: 'same', draft: true });
    expect(findTranslation([zh, draft], zh, true)).toBeUndefined();
  });

  it('生产环境不会把未到点的定时译文作为语言切换目标', () => {
    const zh = post({ id: 'zh', translationKey: 'same' });
    const scheduled = post({
      id: 'en-scheduled',
      lang: 'en',
      translationKey: 'same',
      publishAt: new Date('2026-06-01T00:00:00Z'),
    });
    expect(findTranslation([zh, scheduled], zh, true, new Date('2026-05-01T00:00:00Z'))).toBeUndefined();
  });

  it('开发环境可以预览草稿译文', () => {
    const zh = post({ id: 'zh', translationKey: 'same' });
    const draft = post({ id: 'en-draft', lang: 'en', translationKey: 'same', draft: true });
    expect(findTranslation([zh, draft], zh, false)?.id).toBe('en-draft');
  });

  it('生产环境跳过草稿后仍能找到已发布的译文', () => {
    const zh = post({ id: 'zh', translationKey: 'same' });
    const draft = post({ id: 'draft', lang: 'en', translationKey: 'same', draft: true });
    const published = post({ id: 'published', lang: 'en', translationKey: 'same' });
    expect(findTranslation([zh, draft, published], zh, true)?.id).toBe('published');
  });
});
