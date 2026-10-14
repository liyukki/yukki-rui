/**
 * 全站文案与开关。站点地址由 astro.config.mjs 读取 SITE_URL / SITE_BASE，
 * Astro 将唯一地址注入 import.meta.env.SITE，页面、RSS 与 sitemap 共用它。
 */
import { LOCAL_SITE_URL } from './lib/site-config.mjs';
export const SITE = {
  name: 'yukki rui',
  title: 'yukki rui',
  description: '一个用 Markdown 写的中英双语个人博客。',
  url: import.meta.env.SITE ?? LOCAL_SITE_URL,
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

/**
 * 首页英雄区与关于页的形象图片。
 *
 * 把图片放进 public/ 后把 src 改成对应路径（例如 '/hero.png'），
 * 并填上真实宽高；src 为空字符串时显示待补充占位，不产出坏链。
 */
export const HERO_IMAGE = {
  src: '',
  altZh: 'yukki rui 的形象照片',
  altEn: 'Portrait of yukki rui',
  width: 320,
  height: 320,
} as const;

/** RSS 文件路径，按语言区分。 */
export const RSS_PATH: Record<Lang, string> = {
  zh: 'rss.xml',
  en: 'rss-en.xml',
};
