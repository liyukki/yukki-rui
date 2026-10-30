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
    { label: '友链', path: 'zh/friends/' },
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
    { label: 'Friends', path: 'en/friends/' },
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
    postLikes: '文章点赞',
    postLike: '点赞',
    postLiked: '已赞，点击取消',
    postLikeLoading: '正在读取点赞…',
    postLikeLoadError: '点赞数读取失败，点击重试。',
    postLikeUnavailable: '点赞服务暂时不可用。',
    postLikeFailed: '点赞失败，请稍后再试。',
    sharePost: '分享文章',
    copyLink: '复制链接',
    linkCopied: '已复制',
    shareFailed: '复制失败',
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
    friends: '友链',
    nowHint: '最近在忙什么:一份随时会过期的快照。',
    worksHint: '做过的东西,目前主要是这个站。',
    listeningHint: '循环中的曲子,大多是 hitorie 与术曲。',
    friendsHint: '一些我会常去看看的站点。',
    updatedPrefix: '更新于',
    emptyItems: '还没有内容,稍后再来看。',
    keepExploring: '继续探索',
    notFoundTitle: '页面不存在',
    notFoundBody: '这个页面不存在。',
    aiTitle: 'YUKKI AI',
    aiOnline: '在线',
    aiClear: '清空对话',
    aiClose: '关闭聊天窗',
    aiOpen: '打开 YUKKI AI 聊天',
    aiWelcome: '你好，我是 YUKKI AI。今天想聊点什么？',
    aiPlaceholder: '问文章或随便聊聊…',
    aiContextUnavailable: '站内参考资料暂不可用。',
    aiSources: '来源',
    aiQuickSummary: '总结本文',
    aiQuickPoints: '列出重点',
    aiQuickExplain: '解释一个概念',
    aiQuickRelated: '找相关文章',
    aiSend: '发送',
    aiStop: '停止',
    aiThinking: 'YUKKI AI 正在输入',
    aiInputHint: 'Enter 发送 · Shift+Enter 换行',
    aiNoReply: '没有收到回复，请重试。',
    aiNotConfigured: 'AI 服务尚未配置，请稍后再试。',
    aiAuthFailed: 'AI 服务授权失败，请稍后再试。',
    aiRateLimited: '请求太频繁了，请稍后再试。',
    aiUnavailable: 'AI 服务暂时不可用，请稍后再试。',
    aiInvalid: '消息不合法，请修改后再试。',
    aiFailed: '出了点问题，请稍后再试。',
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
    postLikes: 'Post likes',
    postLike: 'Like this post',
    postLiked: 'Liked — click to undo',
    postLikeLoading: 'Loading likes…',
    postLikeLoadError: 'Could not load likes. Click to retry.',
    postLikeUnavailable: 'Likes are unavailable right now.',
    postLikeFailed: 'Could not update the like. Please try again.',
    sharePost: 'Share post',
    copyLink: 'Copy link',
    linkCopied: 'Copied',
    shareFailed: 'Copy failed',
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
    friends: 'Friends',
    nowHint: 'What I am up to — a snapshot that expires fast.',
    worksHint: 'Things I have built; mostly this site for now.',
    listeningHint: 'On repeat: mostly hitorie and Vocaloid songs.',
    friendsHint: 'Sites I like to check in on.',
    updatedPrefix: 'Updated',
    emptyItems: 'Nothing here yet — check back later.',
    keepExploring: 'Keep exploring',
    notFoundTitle: 'Page not found',
    notFoundBody: 'This page does not exist.',
    aiTitle: 'YUKKI AI',
    aiOnline: 'Online',
    aiClear: 'Clear chat',
    aiClose: 'Close chat',
    aiOpen: 'Open YUKKI AI chat',
    aiWelcome: 'Hi, I am YUKKI AI. What would you like to talk about?',
    aiPlaceholder: 'Ask about a post or just chat…',
    aiContextUnavailable: 'Site references are unavailable right now.',
    aiSources: 'Sources',
    aiQuickSummary: 'Summarize this post',
    aiQuickPoints: 'List the key points',
    aiQuickExplain: 'Explain a concept',
    aiQuickRelated: 'Find related posts',
    aiSend: 'Send',
    aiStop: 'Stop',
    aiThinking: 'YUKKI AI is typing',
    aiInputHint: 'Enter to send · Shift+Enter for a new line',
    aiNoReply: 'No reply received. Please try again.',
    aiNotConfigured: 'The AI assistant is not configured yet.',
    aiAuthFailed: 'The AI service authorization failed. Please try again later.',
    aiRateLimited: 'Too many requests. Please wait a moment and try again.',
    aiUnavailable: 'The AI service is temporarily unavailable. Please try again later.',
    aiInvalid: 'That message could not be sent. Please edit it and try again.',
    aiFailed: 'Something went wrong. Please try again.',
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

/**
 * AI 聊天小窗。
 *
 * 浏览器只请求本站 /api/chat；Cloudflare Function 从 Secret 读取上游密钥。
 * GitHub Pages 镜像跨域调用主站代理，因此 origin 必须是主站源。
 */
export const AI_CHAT = {
  enabled: true,
  contextEnabled: true,
  origin: 'https://yukki-rui.pages.dev',
  maxMessages: 20,
  maxInputLength: 2000,
  maxOutputTokens: 800,
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
