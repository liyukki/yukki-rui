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
    { label: '现在', path: 'zh/now/' },
    { label: '作品', path: 'zh/works/' },
    { label: '在听', path: 'zh/listening/' },
    { label: '归档', path: 'zh/archive/' },
    { label: '标签', path: 'zh/tags/' },
    { label: '搜索', path: 'zh/search/' },
    { label: '关于', path: 'zh/about/' },
  ],
  en: [
    { label: 'Home', path: 'en/' },
    { label: 'Now', path: 'en/now/' },
    { label: 'Works', path: 'en/works/' },
    { label: 'Listening', path: 'en/listening/' },
    { label: 'Archive', path: 'en/archive/' },
    { label: 'Tags', path: 'en/tags/' },
    { label: 'Search', path: 'en/search/' },
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
    commentsReply: '回复',
    commentsReplyTo: '回复',
    commentsReplyPosted: '回复成功。',
    commentsReactionLike: '赞',
    commentsReactionLove: '喜欢',
    commentsReactionUseful: '有用',
    commentsErrorInvalid: '内容不合法：昵称和正文都要填，网址要么留空要么以 http(s) 开头。',
    commentsErrorQuick: '提交太快了，刷新页面后再试。',
    commentsErrorRate: '发得太快了，歇一分钟再来。',
    commentsErrorUnavailable: '评论服务还没配置好。',
    commentsErrorFailed: '提交失败，请稍后再试。',
    toc: '目录',
    prevPost: '上一篇',
    nextPost: '下一篇',
    readingSettings: '阅读设置',
    readingSize: '字号',
    readingSizeSm: '小',
    readingSizeMd: '中',
    readingSizeLg: '大',
    readingLine: '行高',
    readingLineTight: '紧凑',
    readingLineNormal: '标准',
    readingLineLoose: '宽松',
    readingWidth: '正文宽度',
    readingWidthNarrow: '窄',
    readingWidthNormal: '标准',
    readingWidthWide: '宽',
    relatedPosts: '相关文章',
    readingTime: '约 {minutes} 分钟',
    copyCode: '复制',
    copiedCode: '已复制',
    copyFailed: '复制失败',
    backToTop: '返回顶部',
    closeLightbox: '关闭',
    search: '搜索',
    archive: '归档',
    searchHint: '输入关键词，搜索标题和正文。',
    searchPlaceholder: '搜点什么…',
    searchEmpty: '没有找到相关内容。',
    searchError: '搜索暂时不可用，请稍后再试。',
    archiveHint: '按年份翻旧文。',
    archiveCount: '{count} 篇',
    now: '现在',
    works: '作品',
    listening: '最近在听',
    nowHint: '最近在忙什么:一份随时会过期的快照。',
    worksHint: '做过的东西,目前主要是这个站。',
    listeningHint: '循环中的曲子,大多是 hitorie 与术曲。',
    updatedPrefix: '更新于',
    emptyItems: '还没有内容,稍后再来看。',
    keepExploring: '继续探索',
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
    commentsReply: 'Reply',
    commentsReplyTo: 'Reply to',
    commentsReplyPosted: 'Reply posted.',
    commentsReactionLike: 'Like',
    commentsReactionLove: 'Love',
    commentsReactionUseful: 'Useful',
    commentsErrorInvalid: 'Invalid content: name and comment are required, and the website must start with http(s).',
    commentsErrorQuick: 'That was too quick — reload the page and try again.',
    commentsErrorRate: 'Too fast — take a minute and try again.',
    commentsErrorUnavailable: 'Comments are not configured yet.',
    commentsErrorFailed: 'Could not post. Please try again later.',
    toc: 'On this page',
    prevPost: 'Previous',
    nextPost: 'Next',
    readingSettings: 'Reading settings',
    readingSize: 'Text size',
    readingSizeSm: 'Small',
    readingSizeMd: 'Medium',
    readingSizeLg: 'Large',
    readingLine: 'Line height',
    readingLineTight: 'Tight',
    readingLineNormal: 'Normal',
    readingLineLoose: 'Loose',
    readingWidth: 'Text width',
    readingWidthNarrow: 'Narrow',
    readingWidthNormal: 'Normal',
    readingWidthWide: 'Wide',
    relatedPosts: 'Related posts',
    readingTime: '{minutes} min read',
    copyCode: 'Copy',
    copiedCode: 'Copied',
    copyFailed: 'Copy failed',
    backToTop: 'Back to top',
    closeLightbox: 'Close',
    search: 'Search',
    archive: 'Archive',
    searchHint: 'Type a keyword to search titles and body text.',
    searchPlaceholder: 'Search…',
    searchEmpty: 'Nothing found.',
    searchError: 'Search is unavailable right now. Please try again later.',
    archiveHint: 'Browse older posts by year.',
    archiveCount: '{count} posts',
    now: 'Now',
    works: 'Works',
    listening: 'Listening',
    nowHint: 'What I am up to — a snapshot that expires fast.',
    worksHint: 'Things I have built; mostly this site for now.',
    listeningHint: 'On repeat: mostly hitorie and Vocaloid songs.',
    updatedPrefix: 'Updated',
    emptyItems: 'Nothing here yet — check back later.',
    keepExploring: 'Keep exploring',
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
 * Cloudflare Web Analytics(浏览器端访问统计)。
 *
 * token 是**公开的 site token**(本来就会出现在页面源码里),不是密钥,可以放心提交。
 * 2026-10-19 在 Cloudflare 控制台为 yukki-rui.pages.dev 开通;两个平台插同一段脚本,
 * 所以 Cloudflare Pages 与 GitHub Pages 的访问会汇总到同一个统计站点。
 * 想关掉:把 enabled 改成 false(只是不再输出脚本,统计站点本身不会删除)。
 */
export const WEB_ANALYTICS = {
  enabled: true,
  token: '8a26bb2204aa45f58a5937686cf051d0',
} as const;

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
