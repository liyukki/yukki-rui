export type AiLang = 'zh' | 'en';

export interface AiPostMeta {
  id: string;
  title: string;
  description: string;
  url: string;
  tags: string[];
}

export interface AiChunk {
  id: string;
  postId: string;
  title: string;
  url: string;
  heading: string;
  anchor: string;
  text: string;
}

export interface AiIndex {
  version: 1;
  lang: AiLang;
  posts: AiPostMeta[];
  chunks: AiChunk[];
}

export interface AiSource extends AiChunk {}

export interface AiContext {
  version: 1;
  lang: AiLang;
  currentPostId?: string;
  sources: AiSource[];
}

export const AI_CONTEXT_LIMITS = Object.freeze({
  maxSources: 6,
  maxSourceChars: 1200,
  maxTotalChars: 6000,
  perPostMax: 2,
  currentPostBoost: 1.3,
});

const MAX_POSTS = 1000;
const MAX_CHUNKS = 20_000;
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '和', '有', '我', '你', '他', '她', '它', '这', '那', '吗', '呢', '吧',
  '怎么', '什么', '哪', '哪些', '一下', '文章', '这篇', '本站', '站内',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'to', 'in', 'and', 'or', 'for',
  'on', 'with', 'this', 'that', 'what', 'which', 'how', 'please', 'tell', 'me', 'about',
]);

function charLength(value: string): number {
  return [...value].length;
}

function charSlice(value: string, maxChars: number): string {
  return [...value].slice(0, maxChars).join('');
}

function safeText(value: unknown, maxChars: number): string {
  return typeof value === 'string' ? charSlice(value.trim(), maxChars) : '';
}

function safeSitePath(value: unknown): string {
  const path = safeText(value, 1000);
  if (!path.startsWith('/') || path.startsWith('//')) return '';
  if (path.includes('\\') || path.includes('..') || /[?#]/u.test(path)) return '';
  return path;
}

export function truncateText(value: string, maxChars: number): string {
  const max = Math.max(0, Math.floor(maxChars));
  const source = String(value ?? '');
  if (charLength(source) <= max) return source;
  const sliced = charSlice(source, max);
  const sentence = sliced.replace(/\s+\S*$/u, '').replace(/[^。！？.!?]*$/u, '').trim();
  return charLength(sentence) >= Math.min(200, Math.floor(max * 0.6)) ? sentence : sliced.trim();
}

export function parseAiIndex(value: unknown): AiIndex | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || (record.lang !== 'zh' && record.lang !== 'en')) return null;
  if (!Array.isArray(record.posts) || !Array.isArray(record.chunks)) return null;
  if (record.posts.length > MAX_POSTS || record.chunks.length > MAX_CHUNKS) return null;

  const posts: AiPostMeta[] = [];
  for (const item of record.posts) {
    if (!item || typeof item !== 'object') return null;
    const post = item as Record<string, unknown>;
    const id = safeText(post.id, 200);
    const title = safeText(post.title, 300);
    const description = safeText(post.description, 500);
    const url = safeSitePath(post.url);
    const tags = Array.isArray(post.tags)
      ? post.tags.slice(0, 20).map((tag) => safeText(tag, 80)).filter(Boolean)
      : [];
    if (!id || !title || !url) return null;
    posts.push({ id, title, description, url, tags });
  }

  const chunks: AiChunk[] = [];
  const seen = new Set<string>();
  for (const item of record.chunks) {
    if (!item || typeof item !== 'object') return null;
    const chunk = item as Record<string, unknown>;
    const id = safeText(chunk.id, 240);
    const postId = safeText(chunk.postId, 200);
    const title = safeText(chunk.title, 300);
    const url = safeSitePath(chunk.url);
    const heading = safeText(chunk.heading, 300);
    const anchor = safeText(chunk.anchor, 300);
    const text = safeText(chunk.text, AI_CONTEXT_LIMITS.maxSourceChars);
    if (!id || !postId || !title || !url || !text || seen.has(id)) return null;
    if (anchor.includes('/') || anchor.includes('\\') || anchor.includes('..')) return null;
    seen.add(id);
    chunks.push({ id, postId, title, url, heading, anchor, text });
  }

  return { version: 1, lang: record.lang, posts, chunks };
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

export function tokenizeQuery(query: unknown): string[] {
  if (typeof query !== 'string') return [];
  const raw = normalize(query);
  const tokens = new Set<string>();
  for (const word of raw.match(/[a-z0-9]+/gu) ?? []) {
    if (word.length >= 2 && !STOP_WORDS.has(word)) tokens.add(word);
  }
  for (const sequence of raw.match(/[\p{Script=Han}]+/gu) ?? []) {
    const chars = [...sequence];
    for (const char of chars) {
      if (!STOP_WORDS.has(char)) tokens.add(char);
    }
    for (let index = 0; index < chars.length - 1; index += 1) {
      const bigram = `${chars[index]}${chars[index + 1]}`;
      if (!STOP_WORDS.has(bigram)) tokens.add(bigram);
    }
  }
  return [...tokens];
}

function scoreAiChunk(chunk: AiChunk, post: AiPostMeta | undefined, query: string, tokens: string[], currentPostId?: string): number {
  const title = normalize(chunk.title);
  const description = normalize(post?.description ?? '');
  const heading = normalize(chunk.heading);
  const body = normalize(chunk.text);
  const tags = (post?.tags ?? []).map(normalize);
  const phrase = normalize(query.trim());
  let score = 0;

  if (phrase && title.includes(phrase)) score += 12;
  if (phrase && description.includes(phrase)) score += 6;
  if (phrase && heading.includes(phrase)) score += 5;
  if (phrase && body.includes(phrase)) score += 4;
  score += tokens.filter((token) => title.includes(token)).length * 5;
  score += tokens.filter((token) => tags.some((tag) => tag.includes(token))).length * 4;
  score += tokens.filter((token) => heading.includes(token)).length * 3;
  score += Math.min(new Set(tokens.filter((token) => body.includes(token))).size, 12);
  if (chunk.postId === currentPostId) score *= AI_CONTEXT_LIMITS.currentPostBoost;
  return score;
}

function dedupeKey(chunk: AiChunk): string {
  return `${chunk.postId}:${chunk.anchor}:${normalize(chunk.text).replace(/\s+/gu, '').slice(0, 120)}`;
}

export function rankAiChunks(
  index: AiIndex,
  query: string,
  options: { currentPostId?: string; maxSources?: number } = {},
): AiSource[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];
  const postById = new Map(index.posts.map((post) => [post.id, post]));
  const candidates = index.chunks
    .map((chunk) => ({ chunk, score: scoreAiChunk(chunk, postById.get(chunk.postId), query, tokens, options.currentPostId) }))
    .filter((item) => item.score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      left.chunk.title.localeCompare(right.chunk.title) ||
      left.chunk.postId.localeCompare(right.chunk.postId) ||
      left.chunk.id.localeCompare(right.chunk.id),
    );

  const result: AiSource[] = [];
  const seen = new Set<string>();
  const perPost = new Map<string, number>();
  let totalChars = 0;
  const maxSources = Math.min(Math.max(1, options.maxSources ?? AI_CONTEXT_LIMITS.maxSources), AI_CONTEXT_LIMITS.maxSources);

  for (const { chunk } of candidates) {
    if (result.length >= maxSources) break;
    const key = dedupeKey(chunk);
    if (seen.has(key) || seen.has(chunk.id)) continue;
    if ((perPost.get(chunk.postId) ?? 0) >= AI_CONTEXT_LIMITS.perPostMax) continue;
    const remaining = AI_CONTEXT_LIMITS.maxTotalChars - totalChars;
    if (remaining <= 0) break;
    const text = truncateText(chunk.text, Math.min(AI_CONTEXT_LIMITS.maxSourceChars, remaining));
    if (!text) break;
    seen.add(chunk.id);
    seen.add(key);
    perPost.set(chunk.postId, (perPost.get(chunk.postId) ?? 0) + 1);
    totalChars += charLength(text);
    result.push({ ...chunk, text });
  }
  return result;
}

export function buildAiContext(
  index: AiIndex,
  query: string,
  lang: AiLang,
  currentPostId?: string,
): AiContext | undefined {
  if (index.lang !== lang) return undefined;
  const sources = rankAiChunks(index, query, { currentPostId });
  if (sources.length === 0) return undefined;
  return { version: 1, lang, currentPostId: currentPostId || undefined, sources };
}
