# yukki rui 展示层实施计划

**Goal:** Kimi 在已验证的静态数据层和文章路由骨架上完成个人展示、双语博客和响应式视觉。

**Architecture:** Astro 7 静态页面，Markdown 内容通过现有集合 API 读取；BaseHead 集中生成元信息，BaseLayout/PostLayout 负责骨架。RSS、robots、sitemap 和站点地址直接复用现有实现。

**Tech Stack:** package-lock.json 中的 Astro 7、TypeScript 6、npm；手写 CSS 与系统字体，无新增客户端框架。

设计依据：`docs/superpowers/specs/2026-10-10-yukki-rui-blog-design.md`。精确组件契约和真实数据示例：`docs/frontend-handoff.md`。

## Global Constraints

1. 展示内容为个人简介、代表作品、联系入口、最新文章；使用用户真实素材。
2. `post.id` 用真实集合 ID；文章 `await render(post)`，不可调用实例方法。
3. getStaticPaths、列表、标签、RSS 共用发布规则；生产绝不链接草稿译文。
4. 路径助手处理 base，绝对地址读取 SITE.url / Astro.site；不能硬编码平台域名。
5. 每个语言对应页一条 hreflang；无译文的导航回首页不声明为文章译文。
6. 允许主题初始化/点击和入口语言跳转内联脚本；存储异常要处理。
7. 本地脚本通过不等于前端完成；最终 `verify:frontend` 与浏览器验收都要通过。
8. 只在获得对应授权后提交、推送或发布；本计划不要求每步自动提交。

## Task 1: 页面骨架与设计令牌

**Files:** 新增 `src/styles/tokens.css`、`global.css`、`src/components/BaseHead.astro`、`Header.astro`、`Footer.astro`、`src/layouts/BaseLayout.astro`。

**Interfaces:** BaseHead/BaseLayout 接收 title、description、lang、ogType?、ogImage?、alternate?；Header 接收 lang、alternateUrl?；Footer 接收 lang。类型见交接文档。

- [ ] 定义深浅颜色、字号和间距变量；正文最大宽度、手机间距、可见焦点与 reduced-motion 规则。
- [ ] BaseHead 通过如下数据生成 title、description、canonical、OG、Twitter Card 与 RSS 链接；所有 meta 仅在此输出。

```astro
---
import { OG_IMAGE, RSS_PATH, type Lang } from '../consts';
import { absoluteHref, withBase } from '../lib/url';
interface Props {
  title: string; description: string; lang: Lang;
  ogType?: 'website' | 'article'; ogImage?: string; alternate?: string;
}
const { title, description, lang, ogType = 'website', ogImage = OG_IMAGE, alternate } = Astro.props;
const canonical = absoluteHref(Astro.url.pathname);
const image = absoluteHref(withBase(ogImage));
---
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title}</title>
<meta name="description" content={description} />
<link rel="canonical" href={canonical} />
<link rel="alternate" hreflang={lang === 'zh' ? 'zh-CN' : 'en'} href={canonical} />
{alternate && <link rel="alternate" hreflang={lang === 'zh' ? 'en' : 'zh-CN'} href={absoluteHref(alternate)} />}
<meta property="og:type" content={ogType} />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:url" content={canonical} />
<meta property="og:image" content={image} />
<meta name="twitter:card" content="summary_large_image" />
<link rel="alternate" type="application/rss+xml" title="RSS" href={withBase(RSS_PATH[lang])} />
```

- [ ] BaseLayout 引入两个 CSS，设置 html lang；head 中放 BaseHead 与主题初始化脚本，body 中放 Header、main slot、Footer。
- [ ] BaseLayout 的 alternate 同时传给 BaseHead 和 `<Header lang={lang} alternateUrl={alternate} />`。
- [ ] Header 的站名使用 `langHref(lang)`；导航使用 `NAV[lang]` 与 withBase；Footer 使用 RSS_PATH[lang]。
- [ ] 执行 `npm run check`，所有新增 props 和导入通过。

## Task 2: 主题与语言交互

**Files:** 新增 `ThemeToggle.astro`、`LangSwitch.astro`，修改 BaseLayout、Header 与入口页。

**Interfaces:** LangSwitch 接收 lang、alternateUrl?；ThemeToggle 内部状态为 html data-theme 和 localStorage。

- [ ] head 内主题初始化捕获存储错误，并优先读取已保存的 light/dark，否则使用系统偏好。

```html
<script is:inline>
  (() => {
    let saved;
    try { saved = localStorage.getItem('theme'); } catch {}
    document.documentElement.dataset.theme = saved === 'light' || saved === 'dark'
      ? saved : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  })();
</script>
```

- [ ] 按钮 aria-label 按当前语言设置；点击脚本使用如下状态变化，读写存储都不能让页面崩溃。

```html
<script is:inline>
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch {}
  });
</script>
```

- [ ] LangSwitch 目标为 `alternateUrl ?? langHref(lang === 'zh' ? 'en' : 'zh')`。首页互跳首页、关于互跳关于、文章互跳真实译文。
- [ ] 如添加入口自动跳转，脚本只输出在 src/pages/index.astro；使用语言路径助手注入目标，保留无 JS 双语入口，尊重已存语言且处理存储异常。
- [ ] 浏览器检查点击主题、刷新保持、系统偏好、存储受限、语言互跳和无 JS 入口；主题合计目标 <2 KB，跳转 <500 字节。

## Task 3: 首页与文章

**Files:** 修改现有 `src/pages/index.astro`、`[lang]/index.astro`、`[lang]/posts/[...id].astro`；新增 PostCard、PostLayout、TagList 和必要的个人展示组件。

**Interfaces:** 首页使用 getPosts(lang)；PostCard 接收 Post；PostLayout 接收 post 和 translations?，正文通过 slot。

- [ ] 首页放入用户真实的个人简介、代表作品、联系入口；最新文章使用 getPosts，不修改数据层筛选规则。
- [ ] 保留文章路由现有 getStaticPaths 和 render(post) 数据流程，模板替换为交接文档第 3 节的 PostLayout。
- [ ] PostLayout 计算真实 alternate：

```ts
const alternate = translations
  ? postHref(translations.data.lang, translations.id)
  : undefined;
```

- [ ] `<BaseLayout title={post.data.title} description={post.data.description} lang={post.data.lang} ogType="article" alternate={alternate}>` 内展示标题、日期、可选更新日期、标签和正文 slot。
- [ ] 无译文时给导航组件的 fallback 只用于按钮；不把语言首页传给 BaseHead 的 alternate。
- [ ] 使用 tagHref 生成标签链接，正文覆盖标题层级、列表、引用、代码块、表格、图片和长链接的手机布局。
- [ ] 执行 `npm run check:content`，确认真实渲染与草稿规则仍通过。

## Task 4: 关于、标签、404 与分享图

**Files:** 新增 `[lang]/about.astro`、`[lang]/tags/index.astro`、`[lang]/tags/[tag].astro`、`404.astro`、Comments.astro 与 `public/og-default.png`。

**Interfaces:** SITE.langs 限定语言；标签目录用 getTags，归档路径由 getTagNames 生成，文章按同一个原始标签过滤。

- [ ] 关于页双语 getStaticPaths 与首页相同，各语言提供真实介绍和联系入口，alternate 指向对等关于页。
- [ ] 标签总览展示 getTags 的标签与 count；归档 getStaticPaths 逐语言调用 getTagNames，每路径 props 携带原始 tag。
- [ ] 归档过滤逻辑：

```ts
const posts = (await getPosts(lang)).filter((post) => post.data.tags.includes(tag));
```

- [ ] 标签页无真实跨语言对应关系时不声明另一个语言的 hreflang；语言导航仍能回目标首页。
- [ ] 404 给出 withBase 生成的两个语言首页链接；生产产物应是 dist/404.html。
- [ ] 评论关闭时不渲染评论 DOM 或外部脚本。不要为了占位创建空第三方请求。
- [ ] 制作 1200×630 默认分享图；BaseHead 使用 withBase 后生成绝对图片地址。
- [ ] 执行 `npm run verify:frontend`，修复所有缺失路由、图片及站内链接。

## Task 5: 验收与部署准备

**Files:** 记录实际输出到 `docs/verification-report.md`，不覆盖已有后端审核事实。

- [ ] 运行 `npm run verify:frontend` 和 `node scripts/check-base-parity.mjs --self-test`；用实际输出证明检查结果，不能固定测试数量。
- [ ] 浏览器验收 375px/桌面、主题持久化和首屏、键盘焦点、reduced-motion、标签过滤、真实译文/无译文、RSS 与 404。
- [ ] 确认 canonical、OG、RSS、robots 与 sitemap 全部使用当前部署公开地址；hreflang 互指对应页面且无重复语言。
- [ ] 确认个人信息与作品素材由用户提供，页面没有虚构经历或示例联系方式。
- [ ] 部署步骤按 README；GitHub 和 Cloudflare 分别配置 SITE_URL/SITE_BASE，分别构建。
- [ ] 本地验收完成后按用户授权处理提交、推送或发布。

## 完成标准

数据层验证、前端结构检查和浏览器验收都通过，并记录真实输出。标签页/关于页/404 与分享图不可用首页骨架替代。实际部署后在两个公开地址重新检查，不能以本地构建成功推断线上访问成功。
