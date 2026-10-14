# yukki rui 个人网站设计文档

版本 v2，2026-10-10。数据层修复与构建验证已实现；展示层由 Kimi 接手。用户已授权本轮修复与审核。

## 1. 目标与范围

免费托管的中英双语个人网站，中文为默认语言，支持 Markdown 博客。首页用于展示身份、代表项目/作品与联系入口，再展示文章；所有个人素材由用户提供。

采用静态 HTML，不购买服务器或域名。评论、统计、搜索、登录、数据库和管理后台本期不启用。当前评论开关为 false，不产生第三方请求。

## 2. 技术与数据

实际项目：Astro 7.3.8、TypeScript 6.0.3、Vitest 5.0.3、@astrojs/rss 4.0.19、@astrojs/sitemap 3.7.4、npm。Node 要求 >=22.12.0，推荐 Node 24。版本以 package-lock.json 为准，不额外引入 UI 框架。

内容集合定义在 `src/content.config.ts`：Markdown glob loader + `astro/zod`。必填 `title`、`description`（最多 160 字符）、`pubDate`、`lang`；`tags` 默认空数组、`draft` 默认 false；可选 `updatedDate` 和 `translationKey`。

`Post` 使用真实 `CollectionEntry<'posts'>` 类型，路由以 `post.id` 为准。默认 loader 将文件名 slug 化，当前 `hello-world.en.md` 的 ID 为 `hello-worlden`。文章通过 `import { render } from 'astro:content'` 后 `await render(post)` 得到 `<Content />`。

数据层入口：

| 函数 | 行为 |
|---|---|
| `getPosts(lang)` | 当前语言文章，日期倒序；生产隐藏草稿、开发可预览 |
| `getTags(lang)` | 当前可见文章的标签计数 |
| `getTagNames(lang)` | 去重原始标签名，用于标签路由 |
| `getTranslations(post)` | 相同 translationKey 的另一语言文章；生产排除草稿 |

文章页的 getStaticPaths、首页、标签与 RSS 使用这些入口，不重复实现发布规则。纯函数 `findTranslation(entries, post, isProd = false)` 的第三参数用于验证模式；前端调用集合包装函数，不直接调用纯选择器。

## 3. 部署与地址

同一份源码在两个平台分别构建：

| 平台 | base | 公开地址 |
|---|---|---|
| GitHub Pages | `/仓库名/`，本项目默认 `/yukki-rui/` | `https://用户名.github.io/仓库名/` |
| Cloudflare Pages | `/` | 平台实际分配的项目 pages.dev 地址 |

`SITE_URL` 和 `SITE_BASE` 由 `astro.config.mjs` 统一读取、归一化，并拒绝明确的路径冲突。Astro 将结果注入 `Astro.site` 和 `import.meta.env.SITE`；`SITE.url` 从后者读取。未配置时使用本地 localhost 地址，正式部署必须配置公开地址。

页面 canonical、OG、RSS、sitemap、robots 共用这一来源。默认两个部署分别使用各自的 canonical。robots 是构建端点 `src/pages/robots.txt.ts`，不手工维护 public 文件。

链接接口：

```ts
withBase('zh/about/'); // 未加 base 的站内相对路径
langHref('zh');
postHref(post.data.lang, post.id);
tagHref(lang, tag);
absoluteHref(Astro.url.pathname); // 已加 base，不能重复拼接
absoluteHref(withBase(OG_IMAGE)); // public 图片尚未加 base
```

`BASE_URL` 是否带尾斜杠不影响助手。所有站内链接采用这些助手；图片路径、RSS 文章地址和 SEO 链接也要适配 base。免费托管的大陆/海外访问体验需实测，不承诺平台可达性。

## 4. 页面与阶段

已有无样式路由：`/`、`/zh/`、`/en/`、`/{lang}/posts/{id}/`。RSS 两语言分别在 `/rss.xml`、`/rss-en.xml`；robots 和 sitemap 已生成。

Kimi 需完成 `/{lang}/about/`、`/{lang}/tags/`、`/{lang}/tags/{tag}/`、`404.html`，并替换已有首页/文章模板。首页有个人简介、代表作品、联系入口和最新文章。英文版使用真实英文内容，不要求每篇文章有译文。

语言按钮在有译文时跳译文，无译文时可回目标语言首页。SEO alternate 只声明确实对应的页面；不能用首页代替文章译文。当前关于/标签/404 和分享图尚未实现，不作为后端完成的证明。

## 5. 前端契约

精确 props 和取数示例由 `docs/frontend-handoff.md` 第 3、4 节维护：

| 组件 | 输入 |
|---|---|
| BaseHead / BaseLayout | title、description、lang、ogType?、ogImage?、alternate? |
| Header / LangSwitch | lang、alternateUrl? |
| Footer | lang |
| PostCard | post |
| PostLayout | post、translations? |
| TagList | lang、tags（string[] 或带 count 的对象数组） |
| ThemeToggle / Comments | 无 props |

`ogImage` 是未加 base 的 public 路径；`alternate` 是已加 base 的真实对应页路径。BaseLayout 向 BaseHead 转发所有 head props，并向 Header 转发 alternateUrl。PostLayout 根据 translations.id 计算 alternate，正文通过 slot 传入。

BaseHead 是唯一 meta 输出入口；每个页面一份 title、description、canonical、OG、Twitter Card。hreflang 每语言最多一条，当前页指向自身，仅在有真实译文时添加另一语言；可选 x-default 指向等价页面，不任意指向语言首页。

Kimi 可自由选择颜色、系统字体、布局、间距、响应式断点、动效和组件内部结构。已有数据 schema 和 API 可维护，变更需同时更新契约与消费者、补必要验证；不存在“发现错误也不许改”的冻结规则。

## 6. 性能与可用性

内容静态渲染，无客户端框架。允许主题初始化、主题点击、入口语言跳转三类小型内联脚本。主题两段代码合计目标 <2 KB，语言跳转 <500 字节；评论启用后的第三方脚本属于未来另行评估的范围。

存储操作捕获异常；无 JS 时文章与两个语言入口可用。跳转仅发生在实际入口页，兼容子路径，避免刷新文章时跳回首页。

系统字体；CSS 总量目标 <50 KB；图片显式宽高；375px 手机可读；键盘焦点可见；正文对比度 >=4.5:1；尊重 prefers-reduced-motion。默认 OG 图为 1200×630，由 Kimi 制作。

## 7. 验证与验收

`npm run verify` 检查类型、回归单测、两种 base 的全部实际构建产物，并用真实 Astro 构建检查 Markdown、草稿页面、草稿译文与 RSS。

`npm run check:links` 检查当前 dist 中 HTML href/src、同站 canonical/hreflang/OG、RSS、sitemap 和 robots；验证目标存在与 base 前缀。外部网络、纯同页锚点、CSS 内部 url() 与 srcset 不在这个检查范围。

`npm run verify:frontend` 另外构建当前站点并要求首页、双语关于/标签总览、404 和默认 OG 图齐全。这是结构门槛，不替代浏览器视觉、交互或无障碍验收。Kimi 交付时还要逐项证明标签归档按内容过滤、双语互跳、无译文降级、主题持久化/无闪烁、RSS、手机布局和键盘操作。

双路径脚本使用系统临时目录，不覆盖 dist，也不在 src/pages 创建探针。失败路径自检修改临时构建的真实首页，要求错误链接导致拒绝。

## 8. 发布边界

本轮不发布网站或推送仓库。完成前端与浏览器验收后，再配置 GitHub Pages、Cloudflare Pages 和真实公开地址。GitHub CI 在发布前要求前端结构验收通过；Cloudflare 构建命令为 `npm run verify:frontend`，分别配置其 SITE_URL 和 SITE_BASE。

正式上线后在两个地址实测。若未来使用自有域名，更新 DNS、SITE_URL、必要的 SITE_BASE 并重新构建。
