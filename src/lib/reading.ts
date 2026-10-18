/** 与 Astro `render()` 返回的 headings 结构一致的最小形状，便于单测构造。 */
export interface ReadingHeading {
  depth: number;
  slug: string;
  text: string;
}

const CJK_CHARS_PER_MINUTE = 300;
const LATIN_WORDS_PER_MINUTE = 200;

/** 汉字、假名、谚文都按「一个字符」计。 */
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
/** 英文/数字词（允许词内连字符与撇号），其余符号一律不算词。 */
const LATIN_WORD_PATTERN = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

/**
 * 按中文 300 字/分钟、英文 200 词/分钟分别累加后向上取整，至少 1 分钟。
 * 输入是文章原始 Markdown 正文即可（代码块与链接语法里的符号不会被当成英文词）。
 */
export function countReadingMinutes(text: string): number {
  const cjkCount = text.match(CJK_PATTERN)?.length ?? 0;
  const latinCount = text.replace(CJK_PATTERN, ' ').match(LATIN_WORD_PATTERN)?.length ?? 0;
  const minutes = cjkCount / CJK_CHARS_PER_MINUTE + latinCount / LATIN_WORDS_PER_MINUTE;
  return Math.max(1, Math.ceil(minutes));
}

/** 目录只收 h2/h3：h1 是文章标题本身，h4 以下太碎。 */
export function selectTocHeadings(headings: readonly ReadingHeading[]): ReadingHeading[] {
  return headings
    .filter((heading) => heading.depth === 2 || heading.depth === 3)
    .map(({ depth, slug, text }) => ({ depth, slug, text }));
}

/** 把「约 {minutes} 分钟」这类模板替换成实际数字；模板没有占位符时原样返回。 */
export function formatReadingTime(minutes: number, template: string): string {
  return template.replace('{minutes}', String(minutes));
}
