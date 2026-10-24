import { render } from 'astro:content';
import { SITE } from '../../consts';
import { buildAiIndex, chunkPost, type RenderedHeading } from '../../lib/ai-index';
import { getPosts } from '../../lib/posts';
import { postHref } from '../../lib/url';

export function getStaticPaths() {
  return SITE.langs.map((lang) => ({ params: { lang }, props: { lang } }));
}

export async function GET({ props }: { props: { lang: 'zh' | 'en' } }) {
  const posts = await getPosts(props.lang);
  const indexPosts = posts.map((post) => ({
    ...post,
    url: postHref(post.data.lang, post.id),
  }));
  const chunks = [];
  for (const post of indexPosts) {
    const { headings } = await render(post);
    chunks.push(...chunkPost(post, headings as RenderedHeading[], post.url));
  }
  const index = buildAiIndex(props.lang, indexPosts, chunks);
  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}