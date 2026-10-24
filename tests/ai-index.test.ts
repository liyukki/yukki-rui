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
describe('标题清洗与锚点严格对应', () => {
  it('保留内部下划线与标题末尾 #，只剥离有前导空白的闭合 hashes', () => {
    const body = [
      '## snake_case',
      '',
      '下划线标题。',
      '',
      '## C#',
      '',
      '井号标题。',
      '',
      '## 带闭合 # 的标题 ##',
      '',
      '闭合井号标题。',
    ].join('\n');
    expect(splitMarkdownSections(body).map((item) => item.heading)).toEqual([
      'snake_case',
      'C#',
      '带闭合 # 的标题',
    ]);
  });

  it('归一化后可能碰撞的相邻标题各自匹配自己的锚点', () => {
    const body = ['## snake_case', '', '甲。', '', '## snakecase', '', '乙。'].join('\n');
    const chunks = chunkPost(
      { ...post, id: 'snake', body },
      [
        { depth: 2, slug: 'snake_case', text: 'snake_case' },
        { depth: 2, slug: 'snakecase', text: 'snakecase' },
      ],
      '/zh/posts/snake/',
    );
    expect(chunks.map((item) => item.heading)).toEqual(['snake_case', 'snakecase']);
    expect(chunks.map((item) => item.anchor)).toEqual(['snake_case', 'snakecase']);
  });

  it('C# 标题保留井号并匹配 Astro 锚点', () => {
    const body = ['## C#', '', '说的是这门语言。'].join('\n');
    const chunks = chunkPost({ ...post, id: 'csharp', body }, [{ depth: 2, slug: 'c', text: 'C#' }], '/zh/posts/csharp/');
    expect(chunks.map((item) => ({ heading: item.heading, anchor: item.anchor }))).toEqual([
      { heading: 'C#', anchor: 'c' },
    ]);
  });

  it('标题顺序对不上时回退空锚点，不跨到后续标题', () => {
    const body = ['## A', '', '甲。', '', '## C', '', '丙。'].join('\n');
    const chunks = chunkPost(
      { ...post, id: 'strict', body },
      [
        { depth: 2, slug: 'a', text: 'A' },
        { depth: 2, slug: 'b', text: 'B' },
        { depth: 2, slug: 'c', text: 'C' },
      ],
      '/zh/posts/strict/',
    );
    expect(chunks.map((item) => ({ heading: item.heading, anchor: item.anchor }))).toEqual([
      { heading: 'A', anchor: 'a' },
      { heading: 'C', anchor: '' },
    ]);
  });
});

describe('长度预算', () => {
  it('非 BMP 正文按码点截断到 1200，UTF-16 长度可以超过 1200', () => {
    const heading = '很长的章节标题'.repeat(30);
    const body = [`## ${heading}`, '', '😀'.repeat(1500)].join('\n');
    const chunks = chunkPost({ ...post, id: 'emoji', body }, [{ depth: 2, slug: 'emoji', text: heading }], '/zh/posts/emoji/');
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect([...chunk.text].length).toBeLessThanOrEqual(1200);
      expect(() => encodeURIComponent(chunk.text)).not.toThrow();
    }
    expect(chunks.some((chunk) => chunk.text.length > 1200)).toBe(true);
  });
});

describe('统一代码围栏截断', () => {
  it('波浪号围栏的长代码块同样按预算截断', () => {
    const body = ['## 波浪代码', '', '~~~ts', 'const value = 1;', 'x'.repeat(1300), '~~~'].join('\n');
    const chunks = chunkPost({ ...post, id: 'tilde', body }, [{ depth: 2, slug: '波浪代码', text: '波浪代码' }], '/zh/posts/tilde/');
    const codeChunk = chunks.find((item) => item.heading === '波浪代码');
    expect(codeChunk?.text).toContain('代码已截断');
    expect([...codeChunk!.text].length).toBeLessThanOrEqual(1100);
  });

  it('四个反引号围栏内的长代码被截断且后续标题仍然成节', () => {
    const body = [
      '## 长反引号',
      '',
      '````md',
      '```ts',
      'y'.repeat(1300),
      '```',
      '````',
      '',
      '## 之后的章节',
      '',
      '尾部。',
    ].join('\n');
    const chunks = chunkPost(
      { ...post, id: 'fence', body },
      [
        { depth: 2, slug: '长反引号', text: '长反引号' },
        { depth: 2, slug: '之后的章节', text: '之后的章节' },
      ],
      '/zh/posts/fence/',
    );
    expect(chunks.map((item) => item.anchor)).toEqual(['长反引号', '之后的章节']);
    const codeChunk = chunks.find((item) => item.heading === '长反引号');
    expect(codeChunk?.text).toContain('代码已截断');
    expect([...codeChunk!.text].length).toBeLessThanOrEqual(1100);
  });
});