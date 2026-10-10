/**
 * 全站常量。改站名、改地址、开评论区，都只动这个文件。
 *
 * ⚠️ 部署前必须把 SITE.url 改成真实地址，否则 canonical、hreflang、
 *    sitemap、RSS 里的链接全部是假地址。检查方法：
 *      Select-String -Path src/consts.ts,public/robots.txt -Pattern "example"
 *    应当没有输出。
 */
export const SITE = {
  name: 'yukki rui',
  title: 'yukki rui',
  description: '一个用 Markdown 写的中英双语个人博客。',
  url: 'https://example.github.io/yukki-rui',
  author: 'yukki rui',
  defaultLang: 'zh' as const,
  langs: ['zh', 'en'] as const,
} as const;

export type Lang = (typeof SITE.langs)[number];

/** 导航项。path 是相对路径，渲染时必须经过 withBase()。 */
export const NAV: Record<Lang, ReadonlyArray<{ label: string; path: string }>> = {
  zh: [
    { label: '首页', path: 'zh/' },
    { label: '标签', path: 'zh/tags/' },
    { label: '关于', path: 'zh/about/' },
  ],
  en: [
    { label: 'Home', path: 'en/' },
    { label: 'Tags', path: 'en/tags/' },
    { label: 'About', path: 'en/about/' },
  ],
};

/** 界面文案。集中在 here，避免散落在各组件里。 */
export const UI: Record<Lang, Record<string, string>> = {
  zh: {
    latestPosts: '最新文章',
    noPosts: '还没有文章。',
    allTags: '全部标签',
    noTags: '还没有标签。',
    backHome: '返回首页',
    updatedAt: '更新于',
    languageSwitch: 'English',
    themeToggle: '切换深浅色主题',
    comments: '评论',
    notFoundTitle: '页面不存在',
    notFoundBody: '这个页面不存在。',
    readMore: '阅读全文',
  },
  en: {
    latestPosts: 'Latest posts',
    noPosts: 'No posts yet.',
    allTags: 'All tags',
    noTags: 'No tags yet.',
    backHome: 'Back home',
    updatedAt: 'Updated',
    languageSwitch: '中文',
    themeToggle: 'Toggle color theme',
    comments: 'Comments',
    notFoundTitle: 'Page not found',
    notFoundBody: 'This page does not exist.',
    readMore: 'Read more',
  },
};

/**
 * 评论区开关。
 *
 * enabled === false 时 Comments.astro 渲染 null：DOM 里不留痕迹，
 * 不产生任何第三方请求。想开评论时：把 enabled 改成 true，
 * 装 giscus App，然后把 repo / repoId / categoryId 三项填上。
 */
export const COMMENTS = {
  enabled: false,
  provider: 'giscus' as const,
  repo: '',
  repoId: '',
  category: 'Announcements',
  categoryId: '',
} as const;

/** 默认 OG 图，相对 public/ 的路径。1200×630。 */
export const OG_IMAGE = '/og-default.png';

/** RSS 文件路径，按语言区分。 */
export const RSS_PATH: Record<Lang, string> = {
  zh: 'rss.xml',
  en: 'rss-en.xml',
};
