/**
 * 归档分组：只依赖「id + 发布日期」这两个字段。
 *
 * 用结构类型而不是直接绑定 Astro 的 CollectionEntry，既能让页面传真实 Post，
 * 也能让单测用最小替身，不需要构造完整集合条目。
 */
export interface ArchiveEntry {
  id: string;
  data: {
    pubDate: Date;
  };
}

export interface ArchiveYear<T extends ArchiveEntry = ArchiveEntry> {
  /** 年份（公历）。 */
  year: number;
  /** 该年的文章，按发布日期倒序。 */
  posts: T[];
}

/**
 * 把文章按发布年份分组：年份倒序（新的年份在前），组内按发布日期倒序。
 *
 * 纯函数，只依赖传入的 pubDate，方便单测；不读集合、不碰 Astro 运行时。
 */
export function groupPostsByYear<T extends ArchiveEntry>(posts: readonly T[]): ArchiveYear<T>[] {
  const byYear = new Map<number, T[]>();
  for (const post of posts) {
    const year = post.data.pubDate.getFullYear();
    const bucket = byYear.get(year);
    if (bucket) bucket.push(post);
    else byYear.set(year, [post]);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, list]) => ({
      year,
      posts: [...list].sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime()),
    }));
}
