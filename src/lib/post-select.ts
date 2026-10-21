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
  publishAt?: Date;
  featured: boolean;
}

/** 集合条目的最小形状。Astro 7 的条目有 id/data/body/... 这里只取需要的两个。 */
export interface PostLike {
  id: string;
  data: PostData;
}

/**
 * 生产环境的可见性：草稿永远不可见，定时文章到点才可见。
 * now 由调用方传入，确保同一轮构建使用同一个时间快照，也便于测试。
 */
export function isVisibleOn(data: PostData, isProd: boolean, now: Date): boolean {
  if (!isProd) return true;
  if (data.draft) return false;
  return !data.publishAt || data.publishAt.getTime() <= now.getTime();
}

/** 首页列表排序：精选优先，其次发布日期倒序，最后 id 升序保证确定性。 */
export function byFeaturedThenDate(a: PostLike, b: PostLike): number {
  if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
  return compareByDateDesc(a, b);
}

/** 时间倒序；时间相同时按 id 升序。归档、RSS、上下篇统一用它。 */
export function compareByDateDesc(a: PostLike, b: PostLike): number {
  const diff = b.data.pubDate.getTime() - a.data.pubDate.getTime();
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
}

/**
 * 该语言的全部可见文章：首页与标签列表使用，精选优先、其余按发布日期倒序。
 *
 * @param isProd 生产模式应用草稿与定时规则；开发模式全部保留便于预览。
 * @param now 构建时的时间快照，保证同一次筛选使用一致的时间基准。
 */
export function selectPosts<T extends PostLike>(
  entries: readonly T[],
  lang: 'zh' | 'en',
  isProd: boolean,
  now: Date = new Date(),
): T[] {
  return entries
    .filter((entry) => entry.data.lang === lang)
    .filter((entry) => isVisibleOn(entry.data, isProd, now))
    .sort(byFeaturedThenDate);
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
  now: Date = new Date(),
): T | undefined {
  const key = post.data.translationKey;
  if (!key) return undefined;
  return entries.find(
    (entry) => entry.data.translationKey === key && entry.data.lang !== post.data.lang
      && isVisibleOn(entry.data, isProd, now),
  );
}
