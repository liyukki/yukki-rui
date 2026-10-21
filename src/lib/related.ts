import type { PostLike } from './post-select';

/**
 * 相关文章:同语言已发布、与目标至少共享一个标签。
 * 排序 = 重合标签数倒序 → 发布日期倒序 → id 升序(保证构建结果确定性)。
 */
export function selectRelatedPosts<T extends PostLike>(
  target: T,
  entries: readonly T[],
  limit = 3,
): T[] {
  const targetTags = new Set(target.data.tags);
  if (targetTags.size === 0) return [];

  return entries
    .filter((entry) =>
      entry.id !== target.id
      && entry.data.lang === target.data.lang
      && !entry.data.draft
      && entry.data.tags.some((tag) => targetTags.has(tag)),
    )
    .map((entry) => ({
      entry,
      overlap: entry.data.tags.filter((tag) => targetTags.has(tag)).length,
    }))
    .sort((a, b) =>
      b.overlap - a.overlap
      || b.entry.data.pubDate.getTime() - a.entry.data.pubDate.getTime()
      || a.entry.id.localeCompare(b.entry.id),
    )
    .slice(0, Math.max(0, limit))
    .map((item) => item.entry);
}