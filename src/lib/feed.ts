import rss from '@astrojs/rss';
import { SITE, type Lang } from '../consts';
import { getPosts } from './posts';
import { absoluteHref, postHref } from './url';

export async function createFeed(lang: Lang, site: string = SITE.url): Promise<Response> {
  const posts = await getPosts(lang);
  return rss({
    title: `${SITE.name} · ${lang === 'zh' ? '中文' : 'English'}`,
    description: SITE.description,
    site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: absoluteHref(postHref(lang, post.id), site),
    })),
    customData: `<language>${lang === 'zh' ? 'zh-cn' : 'en'}</language>`,
  });
}
