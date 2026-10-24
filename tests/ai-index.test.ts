import { describe, expect, it } from 'vitest';
import { buildAiIndex, chunkPost, splitMarkdownSections } from '../src/lib/ai-index';

const post = {
  id: 'hello-world',
  url: '/zh/posts/hello-world/',
  body: [
    '开场段落。',
    '',
    '## 开始写作',
    '',
    '写作先确定主题。',
    '',
    '### 长代码',
    '',
    '```ts',
    `const text = '${'x'.repeat(700)}';`,
    '## 代码里的标题样式',
    '### 不是真实章节',
    '```',
  ].join('\n'),
  data: { title: '你好，世界', description: '示例', lang: 'zh' as const, tags: ['写作'] },
};

describe('splitMarkdownSections', () => {
  it('按 H2/H3 分节并保留章节标题', () => {
    const sections = splitMarkdownSections(post.body);
    expect(sections.map((item) => item.heading)).toEqual(['', '开始写作', '长代码']);
    expect(sections[1].text).toContain('写作先确定主题');
  });
});

describe('chunkPost', () => {
  it('使用 Astro 标题 slug 生成真实锚点，并给每段稳定 id', () => {
    const chunks = chunkPost(post, [
      { depth: 2, slug: '开始写作', text: '开始写作' },
      { depth: 3, slug: '长代码', text: '长代码' },
    ], '/zh/posts/hello-world/');
    expect(chunks.map((item) => item.anchor)).toEqual(['', '开始写作', '长代码']);
    expect(chunks.map((item) => item.id)).toEqual([
      'zh:hello-world:0',
      'zh:hello-world:1',
      'zh:hello-world:2',
    ]);
  });

  it('长代码块截断到预算内', () => {
    const chunks = chunkPost(post, [{ depth: 3, slug: '长代码', text: '长代码' }], '/zh/posts/hello-world/');
    const codeChunk = chunks.find((item) => item.heading === '长代码');
    expect(codeChunk?.text).toContain('代码已截断');
    expect([...codeChunk!.text].length).toBeLessThanOrEqual(1100);
  });
});

describe('buildAiIndex', () => {
  it('输出元数据、语言和文章分片', () => {
    const chunks = chunkPost(post, [{ depth: 2, slug: '开始写作', text: '开始写作' }], '/zh/posts/hello-world/');
    const index = buildAiIndex('zh', [post], chunks);
    expect(index.lang).toBe('zh');
    expect(index.posts[0]).toEqual({
      id: 'hello-world',
      title: '你好，世界',
      description: '示例',
      url: '/zh/posts/hello-world/',
      tags: ['写作'],
    });
    expect(index.chunks).toEqual(chunks);
  });
});