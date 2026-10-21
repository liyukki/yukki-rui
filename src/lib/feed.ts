import rss from '@astrojs/rss';
import { render } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { SITE, type Lang } from '../consts';
import { absolutizeFeedHtml } from './feed-html';
import { getPostsByDate, type Post } from './posts';
import { absoluteHref, postHref } from './url';

type Container = Awaited<ReturnType<typeof AstroContainer.create>>;

/**
 * 正文由 Astro 自己的渲染管线产出（Container API 渲染 `render(post).Content`），
 * 而不是把 Markdown 重新解释一遍 —— 这样代码高亮、优化后的图片、扩展语法
 * 都和网页端完全一致，不会出现「网页对、订阅错」的两套排版。
 */
async function feedItem(post: Post, site: string, container: Container) {
  const link = absoluteHref(postHref(post.data.lang, post.id), site);
  const { Content } = await render(post);
  const body = await container.renderToString(Content, { request: new Request(link) });
  return {
    title: post.data.title,
    description: post.data.description,
    pubDate: post.data.pubDate,
    link,
    // RSS 的 content:encoded 约定是「实体编码后的 HTML」，@astrojs/rss 负责转义。
    content: absolutizeFeedHtml(body, link, site),
  };
}

/**
 * 生成一路订阅源（中文 / 英文各一份）。
 *
 * 全文输出：`description` 仍保留摘要（阅读器列表里显示），正文放在 `content`。
 * site 必须带部署 base，否则订阅器里的文章地址会丢掉 `/yukki-rui/` 前缀。
 */
export async function createFeed(lang: Lang, site: string = SITE.url): Promise<Response> {
  const posts = await getPostsByDate(lang);
  // 一个容器复用给所有文章：每篇都 new 一次会重复初始化渲染环境。
  const container = await AstroContainer.create();
  const items = await Promise.all(posts.map((post) => feedItem(post, site, container)));
  return rss({
    title: `${SITE.name} · ${lang === 'zh' ? '中文' : 'English'}`,
    description: SITE.description,
    site,
    items,
    customData: `<language>${lang === 'zh' ? 'zh-cn' : 'en'}</language>`,
  });
}
