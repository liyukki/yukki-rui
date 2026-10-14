/**
 * 纯函数数据层：只负责「筛选、排序、聚合」，不碰 Astro 的集合读取。
 *
 * 拆出来的理由：Astro 的 `astro:content` 只能在构建期解析，把它混进来会让这层
 * 无法被单元测试覆盖。这里保持零依赖，因此每条规则都能用测试钉死。
 */

/** 与 content.config.ts 的 schema 一一对应。改 schema 时必须同步改这里。 */
export interface PostData {
  title: string;
  description: string;
  pubDate: Date;
  lang: 'zh' | 'en';
  tags: string[];
  updatedDate?: Date;
  draft: boolean;
  translationKey?: string;
}

/** 集合条目的最小形状。Astro 7 的条目有 id/data/body/... 这里只取需要的两个。 */
export interface PostLike {
  id: string;
  data: PostData;
}

/**
 * 该语言的全部已发布文章，按发布日期倒序。
 *
 * @param isProd 生产模式下隐藏草稿；开发模式保留草稿便于写作预览。
 *               必须显式传入而不是内部读取环境，否则测试无法覆盖两种模式。
 */
export function selectPosts<T extends PostLike>(
  entries: readonly T[],
  lang: 'zh' | 'en',
  isProd: boolean,
): T[] {
  return entries
    .filter((entry) => entry.data.lang === lang)
    .filter((entry) => !(isProd && entry.data.draft))
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
}

/** 标签及各自文章数，按数量倒序；数量相同时按名称升序，保证结果稳定可测。 */
export function collectTags(
  posts: readonly PostLike[],
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * 通过 translationKey 找到另一语言版本的文章。
 * 找不到译文是正常状态（不是所有文章都有译文），因此返回 undefined 而非抛错。
 */
export function findTranslation<T extends PostLike>(
  entries: readonly T[],
  post: T,
  isProd = false,
): T | undefined {
  const key = post.data.translationKey;
  if (!key) return undefined;
  return entries.find(
    (entry) => entry.data.translationKey === key && entry.data.lang !== post.data.lang
      && !(isProd && entry.data.draft),
  );
}
