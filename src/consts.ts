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
    commentsHint: '不用登录，填个昵称就能说两句；站长可以删除不合适的评论。',
    commentsEmpty: '还没有评论，来说两句吧。',
    commentsLoading: '评论加载中…',
    commentsLoadError: '评论加载失败，稍后再试。',
    commentsRetry: '重试',
    commentsLoadMore: '加载更早的评论',
    commentsName: '昵称',
    commentsNamePlaceholder: '怎么称呼你',
    commentsWebsite: '网址（选填）',
    commentsWebsitePlaceholder: 'https://example.com',
    commentsBody: '评论内容',
    commentsBodyPlaceholder: '想说什么就写什么',
    commentsSubmit: '发表评论',
    commentsSubmitting: '发送中…',
    commentsPosted: '发表成功。',
    commentsErrorInvalid: '内容不合法：昵称和正文都要填，网址要么留空要么以 http(s) 开头。',
    commentsErrorQuick: '提交太快了，刷新页面后再试。',
    commentsErrorRate: '发得太快了，歇一分钟再来。',
    commentsErrorUnavailable: '评论服务还没配置好。',
    commentsErrorFailed: '提交失败，请稍后再试。',
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
    commentsHint: 'No sign-in needed — just pick a display name. The owner can remove unsuitable comments.',
    commentsEmpty: 'No comments yet. Say something!',
    commentsLoading: 'Loading comments…',
    commentsLoadError: 'Could not load comments. Please try again later.',
    commentsRetry: 'Retry',
    commentsLoadMore: 'Load earlier comments',
    commentsName: 'Name',
    commentsNamePlaceholder: 'What should we call you',
    commentsWebsite: 'Website (optional)',
    commentsWebsitePlaceholder: 'https://example.com',
    commentsBody: 'Comment',
    commentsBodyPlaceholder: 'Say what you think',
    commentsSubmit: 'Post comment',
    commentsSubmitting: 'Sending…',
    commentsPosted: 'Posted.',
    commentsErrorInvalid: 'Invalid content: name and comment are required, and the website must start with http(s).',
    commentsErrorQuick: 'That was too quick — reload the page and try again.',
    commentsErrorRate: 'Too fast — take a minute and try again.',
    commentsErrorUnavailable: 'Comments are not configured yet.',
    commentsErrorFailed: 'Could not post. Please try again later.',
    notFoundTitle: 'Page not found',
    notFoundBody: 'This page does not exist.',
    readMore: 'Read more',
  },
};

/**
 * 评论区开关。
 *
 * 评论由 Cloudflare Pages Functions + D1 提供（免登录、无第三方）。
 * enabled === false 时 Comments.astro 渲染 null：DOM 里不留痕迹、不发请求，
 * 但 API 与已有评论数据都还在，改回 true 重新部署即可再开。
 *
 * origin 是主站源：Cloudflare 部署同源，走相对路径；GitHub Pages 镜像
 * 没有 Functions，前端会跨域调用这个地址（服务端有 CORS 白名单）。
 */
export const COMMENTS = {
  enabled: true,
  origin: 'https://yukki-rui.pages.dev',
  pageSize: 20,
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
