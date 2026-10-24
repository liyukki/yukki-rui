import type { AiChunk, AiIndex, AiLang } from './ai-context';

export interface RenderedHeading {
  depth: number;
  slug: string;
  text: string;
}

export interface IndexPost {
  id: string;
  url: string;
  body?: string;
  data: {
    title: string;
    description: string;
    lang: AiLang;
    tags: string[];
  };
}

interface MarkdownSection {
  heading: string;
  text: string;
}

interface FenceMarker {
  char: string;
  length: number;
}

const TARGET_CHARS = 1000;
const CODE_LIMIT = 600;

/** 围栏开启标记：` 或 ~，至少三个，允许行首缩进。 */
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/u;

/**
 * H2/H3 标题行。闭合 hashes 只在有前导空白时剥离 —— `## C#` 的井号属于标题本身，
 * `## 标题 ##` 的尾部井号才是闭合标记。
 */
const HEADING_RE = /^(#{2,3})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u;

function charLength(value: string): number {
  return [...value].length;
}

function charSlice(value: string, maxChars: number): string {
  return [...value].slice(0, maxChars).join('');
}

function fenceMarker(line: string): FenceMarker | undefined {
  const match = FENCE_RE.exec(line);
  if (!match) return undefined;
  return { char: match[1][0], length: match[1].length };
}

/** 闭合围栏必须同字符且不短于开启围栏，```` 内部的三反引号行不算闭合。 */
function closesFence(line: string, open: FenceMarker): boolean {
  const marker = fenceMarker(line);
  return marker !== undefined && marker.char === open.char && marker.length >= open.length;
}

/**
 * 清洗行内标记用于与 Astro 渲染出的标题文本比对。
 * 只剥离成对标记，绝不整体删除 `_` `~` `#`：`snake_case` 与 `C#` 必须原样保留，
 * 否则不同标题会被清洗成同一个文本，进而互相串锚点。
 */
function cleanInline(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/(\*\*|__|~~)(.+?)\1/gu, '$2')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/(?<!\w)(\*|_)(?=\S)(.+?)(?<=\S)\1(?!\w)/gu, '$2')
    .trim();
}

export function splitMarkdownSections(body: string): MarkdownSection[] {
  const lines = String(body ?? '').replace(/\r\n?/gu, '\n').split('\n');
  const sections: MarkdownSection[] = [];
  let heading = '';
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) sections.push({ heading, text });
    buffer = [];
  };

  let fence: FenceMarker | undefined;
  for (const line of lines) {
    if (fence !== undefined) {
      buffer.push(line);
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    const opening = fenceMarker(line);
    if (opening !== undefined) {
      fence = opening;
      buffer.push(line);
      continue;
    }
    const match = HEADING_RE.exec(line);
    if (!match) {
      buffer.push(line);
      continue;
    }
    flush();
    heading = cleanInline(match[2]);
  }
  flush();
  if (sections.length === 0 && body.trim()) return [{ heading: '', text: body.trim() }];
  return sections;
}

/**
 * 按同一套围栏规则处理代码块预算：与分节共用 fenceMarker/closesFence，
 * 因此 `~~~`、```` 及更长的反引号围栏都会被截断到 CODE_LIMIT。
 */
function trimLongCodeFences(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  let block: string[] = [];
  let fence: FenceMarker | undefined;

  const flush = () => {
    if (block.length === 0) return;
    const joined = block.join('\n');
    output.push(charLength(joined) <= CODE_LIMIT ? joined : `${charSlice(joined, CODE_LIMIT)}\n\n[代码已截断]`);
    block = [];
  };

  for (const line of lines) {
    if (fence === undefined) {
      const opening = fenceMarker(line);
      if (opening === undefined) {
        output.push(line);
        continue;
      }
      fence = opening;
      block.push(line);
      continue;
    }
    block.push(line);
    if (closesFence(line, fence)) {
      fence = undefined;
      flush();
    }
  }
  flush();
  return output.join('\n');
}

function splitLongText(text: string): string[] {
  if (charLength(text) <= TARGET_CHARS) return [text.trim()].filter(Boolean);
  const output: string[] = [];
  let buffer = '';
  const flush = () => {
    const value = buffer.trim();
    if (value) output.push(value);
    buffer = '';
  };
  for (const paragraph of text.split(/\n{2,}/gu).map((item) => item.trim()).filter(Boolean)) {
    if (charLength(paragraph) <= TARGET_CHARS) {
      const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (charLength(next) <= TARGET_CHARS) buffer = next;
      else { flush(); buffer = paragraph; }
      continue;
    }
    flush();
    let rest = paragraph;
    while (charLength(rest) > TARGET_CHARS) {
      const slice = charSlice(rest, TARGET_CHARS);
      const cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('。'), slice.lastIndexOf('.'));
      const part = cut >= 300 ? slice.slice(0, cut + 1) : slice;
      output.push(part.trim());
      rest = charSlice(rest, charLength(part)).trim();
    }
    if (rest) output.push(rest);
  }
  flush();
  return output.filter(Boolean);
}

/**
 * 锚点严格逐项对应：只把当前游标指向的 Astro 标题与本节标题比较。
 * 文本不一致时回退空锚点且不推进游标，绝不向后扫描「找一个像的」，
 * 否则 snake_case / snakecase 这类归一化碰撞会互相串锚点。
 */
function matchHeading(sectionHeading: string, headings: RenderedHeading[], cursor: number): { anchor: string; nextCursor: number } {
  if (!sectionHeading) return { anchor: '', nextCursor: cursor };
  const current = headings[cursor];
  if (current && current.text === sectionHeading) return { anchor: current.slug, nextCursor: cursor + 1 };
  return { anchor: '', nextCursor: cursor };
}

export function chunkPost(post: IndexPost, headings: RenderedHeading[], postUrl: string): AiChunk[] {
  const visibleHeadings = headings.filter((heading) => heading.depth === 2 || heading.depth === 3);
  const sections = splitMarkdownSections(post.body ?? '');
  const chunks: AiChunk[] = [];
  let headingCursor = 0;
  let chunkIndex = 0;

  for (const section of sections) {
    const match = matchHeading(section.heading, visibleHeadings, headingCursor);
    headingCursor = match.nextCursor;
    const heading = section.heading || post.data.title;
    const text = trimLongCodeFences(section.text);
    for (const part of splitLongText(text)) {
      const body = section.heading && !part.startsWith(section.heading)
        ? `${section.heading}\n\n${part}`
        : part;
      chunks.push({
        id: `${post.data.lang}:${post.id}:${chunkIndex}`,
        postId: post.id,
        title: post.data.title,
        url: postUrl,
        heading,
        anchor: match.anchor,
        text: charSlice(body, 1200),
      });
      chunkIndex += 1;
    }
  }
  return chunks;
}

export function buildAiIndex(lang: AiLang, posts: IndexPost[], chunks: AiChunk[]): AiIndex {
  return {
    version: 1,
    lang,
    posts: posts.map((post) => ({
      id: post.id,
      title: post.data.title,
      description: post.data.description,
      url: post.url,
      tags: post.data.tags,
    })),
    chunks,
  };
}