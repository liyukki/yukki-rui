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

const TARGET_CHARS = 1000;
const CODE_LIMIT = 600;

function charLength(value: string): number {
  return [...value].length;
}

function charSlice(value: string, maxChars: number): string {
  return [...value].slice(0, maxChars).join('');
}

function cleanInline(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/[*_`~]/gu, '')
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

  let fence = '';
  for (const line of lines) {
    const fenceMatch = /^\s*(?:`{3,}|~{3,})/u.exec(line);
    if (!fence && fenceMatch) fence = fenceMatch[0].trim()[0];
    else if (fence && fenceMatch && fenceMatch[0].trim()[0] === fence) fence = '';
    if (fence || fenceMatch) {
      buffer.push(line);
      continue;
    }
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/u.exec(line);
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

function trimLongCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?```/gu, (block) => {
    if (charLength(block) <= CODE_LIMIT) return block;
    return `${charSlice(block, CODE_LIMIT)}\n\n[代码已截断]`;
  });
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

function matchHeading(sectionHeading: string, headings: RenderedHeading[], cursor: number): { anchor: string; nextCursor: number } {
  if (!sectionHeading) return { anchor: '', nextCursor: cursor };
  for (let index = cursor; index < headings.length; index += 1) {
    if (headings[index].text === sectionHeading) return { anchor: headings[index].slug, nextCursor: index + 1 };
  }
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