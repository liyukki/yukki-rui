import { describe, expect, it } from 'vitest';
import {
  AI_CONTEXT_LIMITS,
  buildAiContext,
  parseAiIndex,
  rankAiChunks,
  tokenizeQuery,
  truncateText,
  type AiIndex,
} from '../src/lib/ai-context';

const index: AiIndex = {
  version: 1,
  lang: 'zh',
  posts: [
    { id: 'current', title: '当前文章', description: '讲写作', url: '/zh/posts/current/', tags: ['写作'] },
    { id: 'other', title: '另一篇', description: '也讲写作', url: '/zh/posts/other/', tags: ['随笔'] },
    { id: 'en', title: 'English only', description: 'writing', url: '/en/posts/en/', tags: ['writing'] },
  ],
  chunks: [
    {
      id: 'zh:current:0',
      postId: 'current',
      title: '当前文章',
      url: '/zh/posts/current/',
      heading: '开始',
      anchor: 'start',
      text: '写作需要先确定主题，再整理结构。',
    },
    {
      id: 'zh:other:0',
      postId: 'other',
      title: '另一篇',
      url: '/zh/posts/other/',
      heading: '正文',
      anchor: 'body',
      text: '写作也可以从日记开始。',
    },
    {
      id: 'zh:other:1',
      postId: 'other',
      title: '另一篇',
      url: '/zh/posts/other/',
      heading: '正文',
      anchor: 'body',
      text: '写作练习要坚持。',
    },
    {
      id: 'zh:other:2',
      postId: 'other',
      title: '另一篇',
      url: '/zh/posts/other/',
      heading: '补充',
      anchor: 'more',
      text: '写作经验来自阅读。',
    },
    {
      id: 'en:0',
      postId: 'en',
      title: 'English only',
      url: '/en/posts/en/',
      heading: 'Writing',
      anchor: 'writing',
      text: 'writing in English',
    },
  ],
};

describe('tokenizeQuery', () => {
  it('拆出英文单词和中文单字/双字，并过滤空值', () => {
    const tokens = tokenizeQuery('Markdown 写作怎么开始？');
    expect(tokens).toContain('markdown');
    expect(tokens).toContain('写');
    expect(tokens).toContain('作');
    expect(tokens).toContain('写作');
    expect(tokens).not.toContain('的');
    expect(tokenizeQuery(null)).toEqual([]);
  });
});

describe('parseAiIndex', () => {
  it('接受合法索引，拒绝坏版本、坏 URL 和恶意字段', () => {
    expect(parseAiIndex(index)?.lang).toBe('zh');
    expect(parseAiIndex({ ...index, version: 2 })).toBeNull();
    expect(parseAiIndex({ ...index, chunks: [{ ...index.chunks[0], url: 'https://evil.example/' }] })).toBeNull();
    expect(parseAiIndex({ ...index, chunks: [{ ...index.chunks[0], text: { toString: null } }] })).toBeNull();
  });
});

describe('rankAiChunks', () => {
  it('当前文章有排序加成，且仍然过滤无关片段', () => {
    const result = rankAiChunks(index, '写作', { currentPostId: 'current' });
    expect(result[0].postId).toBe('current');
    expect(rankAiChunks(index, '量子计算', { currentPostId: 'current' })).toEqual([]);
  });

  it('每篇最多两段，最多六段，且只在同一语言内检索', () => {
    const result = rankAiChunks(index, '写作', { currentPostId: 'current' });
    expect(result.filter((item) => item.postId === 'other')).toHaveLength(2);
    expect(result.length).toBeLessThanOrEqual(AI_CONTEXT_LIMITS.maxSources);
    expect(result.every((item) => item.id.startsWith('zh:'))).toBe(true);
  });

  it('去重相同文章与章节的近似片段', () => {
    const duplicate = { ...index.chunks[1], id: 'zh:other:dup', text: '写作也可以从日记开始。' };
    const result = rankAiChunks({ ...index, chunks: [...index.chunks, duplicate] }, '写作');
    expect(result.filter((item) => item.postId === 'other')).toHaveLength(2);
  });
});

describe('buildAiContext / truncateText', () => {
  it('生成带语言、当前文章和来源的 context', () => {
    const context = buildAiContext(index, '写作', 'zh', 'current');
    expect(context).toMatchObject({ version: 1, lang: 'zh', currentPostId: 'current' });
    expect(context?.sources.length).toBeGreaterThan(0);
  });

  it('语言不匹配或没有命中时返回 undefined', () => {
    expect(buildAiContext(index, '写作', 'en', 'en')).toBeUndefined();
    expect(buildAiContext(index, '量子计算', 'zh', 'current')).toBeUndefined();
  });

  it('按 Unicode 字符截断，并优先保留完整句子', () => {
    expect(truncateText('第一句。第二句。第三句。', 8)).toBe('第一句。第二句。');
    expect([...truncateText('字'.repeat(1300), 1200)]).toHaveLength(1200);
  });
});
