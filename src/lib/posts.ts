import { getCollection, type CollectionEntry } from 'astro:content';
import {
  collectTags,
  findTranslation,
  selectPosts,
  type PostLike,
} from './post-select';

export type Post = CollectionEntry<'posts'>;

/**
 * 构建期读集合，然后交给零依赖的纯函数筛选。
 *
 * 本文件刻意保持「零分支」：所有业务规则都在 post-select.ts 里，
 * 因而能被单元测试覆盖。这里只做数据搬运。
 *
 * isProd 用 import.meta.env.PROD：astro build 为 true，astro dev 为 false。
 * 这是「生产绝不产出草稿、开发可预览草稿」这条规则的唯一落点 ——
 * 列表页、文章页的 getStaticPaths、RSS、标签页全都调用 getPosts()，
 * 因此规则只需实现一次。
 */
async function allPosts(): Promise<Post[]> {
  return await getCollection('posts');
}

/** 该语言的全部已发布文章，按发布日期倒序。 */
export async function getPosts(lang: 'zh' | 'en'): Promise<Post[]> {
  const entries = await allPosts();
  return selectPosts(entries as PostLike[], lang, import.meta.env.PROD) as Post[];
}

/** 该语言的标签及文章数，按数量倒序。 */
export async function getTags(
  lang: 'zh' | 'en',
): Promise<Array<{ tag: string; count: number }>> {
  return collectTags(await getPosts(lang));
}

/** 通过 translationKey 找另一语言版本；没有译文时返回 undefined（正常状态）。 */
export async function getTranslations(post: Post): Promise<Post | undefined> {
  const entries = await allPosts();
  return findTranslation(entries as PostLike[], post as PostLike) as Post | undefined;
}

/** 该语言出现过的全部标签名（去重，用于 getStaticPaths）。 */
export async function getTagNames(lang: 'zh' | 'en'): Promise<string[]> {
  const posts = await getPosts(lang);
  return [...new Set(posts.flatMap((post) => post.data.tags))];
}
