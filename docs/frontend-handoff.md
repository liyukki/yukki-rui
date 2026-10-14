# Kimi 前端交接说明

版本 v2，2026-10-10。项目位于 `E:\deepseek\yukki-rui`。

这份文件是前端入口。数据与路由以实际代码为准；产品与质量要求见设计文档，执行顺序见实施计划。若文件之间出现冲突，先修正文档和契约，再统一消费者。

## 1. 已有与待做

**已有：** Markdown schema、发布/草稿规则、译文查找、标签聚合、链接助手、两种部署路径配置、可渲染 Markdown 的文章路由骨架、双语首页骨架、RSS、robots、sitemap、回归测试和真实构建检查。

**已完成：** 设计令牌、响应式视觉、个人介绍与作品展示、组件/布局、关于页、标签总览/归档、404、主题/语言交互和默认分享图。仅剩真实素材（头像、联系方式、第二件作品）待用户提供；替换模板时保留已验证的取数与路由逻辑。

首页内容顺序：身份与一句话介绍 → 代表项目/作品 → 联系入口 → 最新文章。真实介绍、头像、作品素材、项目地址和联系方式由用户提供；未提供时清楚标注待补充，不编造个人经历。

## 2. 数据 API

```ts
import { SITE, UI, COMMENTS, OG_IMAGE, RSS_PATH, type Lang } from '../consts';
import { getPosts, getTags, getTagNames, getTranslations, type Post } from '../lib/posts';
import { withBase, langHref, postHref, tagHref, absoluteHref } from '../lib/url';
```

| 接口 | 返回 / 规则 |
|---|---|
| `getPosts(lang)` | `Promise<Post[]>`，日期倒序；生产排除草稿，开发保留 |
| `getTags(lang)` | `Promise<{ tag: string; count: number }[]>`，基于可见文章统计 |
| `getTagNames(lang)` | `Promise<string[]>`，用于标签路由的原始参数 |
| `getTranslations(post)` | `Promise<Post \| undefined>`；生产不返回草稿译文 |
| `postHref(lang, post.id)` | 包含部署 base 的文章链接 |
| `tagHref(lang, tag)` | 包含 base 和编码后标签的链接 |
| `absoluteHref(path)` | 将已经含 base 的路径转换为当前部署的绝对地址 |

`Post` 是 `CollectionEntry<'posts'>`，包含 `id`、`data`、可选 `body` 等字段，**没有实例 render 方法**。`data` 的字段：`title`、`description`、`pubDate: Date`、`lang: 'zh' | 'en'`、`tags: string[]`、`draft: boolean`，以及可选 `updatedDate`、`translationKey`。

`id` 是 loader 实际生成的 slug；当前英文示例 ID 为 `hello-worlden`。中英文章必须从 `getTranslations()` 取得彼此的实际 ID。

## 3. 文章渲染与路由

实际骨架位于 `src/pages/[lang]/posts/[...id].astro`：

```astro
---
import { render } from 'astro:content';
import { SITE } from '../../../consts';
import { getPosts, getTranslations, type Post } from '../../../lib/posts';
import PostLayout from '../../../layouts/PostLayout.astro';

export async function getStaticPaths() {
  return (await Promise.all(SITE.langs.map(async (lang) =>
    (await getPosts(lang)).map((post) => ({
      params: { lang, id: post.id }, props: { post },
    })),
  ))).flat();
}

interface Props { post: Post }
const { post } = Astro.props;
const translations = await getTranslations(post);
const { Content } = await render(post);
---
<PostLayout post={post} translations={translations}><Content /></PostLayout>
```

`PostLayout.astro` 是本轮 Kimi 需新增的文件。生产文章路由、列表、标签和 RSS 一律使用 `getPosts()`；不要绕过它直接读取集合。开发草稿也通过这个入口预览。

## 4. 展示组件契约

```ts
interface BaseHeadProps {
  title: string;
  description: string;
  lang: Lang;
  ogType?: 'website' | 'article';
  ogImage?: string; // public 相对路径，尚未添加 base
  alternate?: string; // 真正对应页面的路径，已添加 base；无对应页则不传
}
interface BaseLayoutProps extends BaseHeadProps {}
interface HeaderProps { lang: Lang; alternateUrl?: string }
interface FooterProps { lang: Lang }
interface PostCardProps { post: Post }
interface PostLayoutProps { post: Post; translations?: Post }
interface TagListProps { lang: Lang; tags: string[] | { tag: string; count: number }[] }
interface LangSwitchProps { lang: Lang; alternateUrl?: string }
```

| 文件 | 职责 |
|---|---|
| `src/components/BaseHead.astro` | 唯一 head 元信息入口；canonical、OG、RSS 与 hreflang |
| `src/layouts/BaseLayout.astro` | 页面骨架、CSS、主题初始化；向 BaseHead 传全部 head props，向 Header 传 `alternateUrl={alternate}` |
| `src/components/Header.astro` | 当前语言站名/导航、语言与主题按钮 |
| `src/components/Footer.astro` | 版权、联系入口和当前语言 RSS |
| `src/components/PostCard.astro` | 标题、日期、摘要、标签 |
| `src/layouts/PostLayout.astro` | 正文 slot、发布日期/更新日期、标签；根据真实译文计算 alternate |
| `src/components/TagList.astro` | 标签链接与可选计数，链接使用 tagHref |
| `src/components/LangSwitch.astro` | 有对应页时跳对应页，否则跳目标语言首页 |
| `src/components/ThemeToggle.astro` | 主题点击与持久化；可读、按语言变化的 aria-label |
| `src/components/Comments.astro` | COMMENTS.enabled 为 false 时不输出评论 DOM 或第三方请求 |

颜色、字体、间距、响应式断点、内部 DOM 与动效由 Kimi 决定。新增个人介绍/作品组件可以使用页面内容 props，现有文章 schema 不需要为此修改。

## 5. 链接、地址与 SEO

普通站内链接走助手；别把带 base 的结果再次传给 `withBase()`。

```ts
withBase('zh/about/');
postHref(post.data.lang, post.id);
tagHref(lang, tag);
const canonical = absoluteHref(Astro.url.pathname); // pathname 已含 base
const image = absoluteHref(withBase(ogImage ?? OG_IMAGE)); // image 尚未含 base
```

站点地址来自 `SITE_URL` / `SITE_BASE`，由 Astro 注入；不要在页面写平台域名或修改 `SITE.url`。RSS 和 robots 已实现，无需重写。不要新增 `public/robots.txt`，否则会与端点冲突。

`hreflang` 每种语言最多一条，指向等价页面。文章有译文时使用 `translations.id`；没有译文时不输出另一语言 alternate。首页和关于页在两种语言都有对应页，可传其对等路径。标签页仅在确有对应标签归档时声明对等页面。语言按钮回首页属于导航降级，不是 SEO 等价关系。

默认 OG 图片由 Kimi 创建 `public/og-default.png`，尺寸 1200×630。文章页应设置 `ogType="article"`；所有 meta 仅由 BaseHead 输出一次。默认使用各部署自己的 canonical 地址。

## 6. JavaScript 与可用性

内容渲染使用静态 HTML，不引入客户端框架。允许三类小型内联脚本：

1. 主题初始化防闪烁：在 head 中执行，读取 localStorage，并处理存储被禁用的情况。
2. 主题按钮点击：切换 data-theme，持久化；同样捕获存储错误。
3. 根语言入口的可选跳转：小于 500 字节，仅在入口页执行，尊重已保存语言；无 JS 时两个入口都可用。

主题初始化和点击代码合计目标小于 2 KB；不得为了“0 字节”删除必要交互。语言跳转不能硬编码 `location.pathname === '/'`，子路径部署入口是 `/yukki-rui/`。用 `withBase('')` 注入入口，或只在入口页面输出脚本。

系统字体、CSS 自定义属性、CSS 总量目标小于 50 KB；图片显式宽高；375px 手机布局可读；键盘焦点可见、按钮可操作；正文对比度至少 4.5:1；尊重 reduced-motion。

## 7. Kimi 的执行与验收

按实施计划完成布局 → 首页个人展示 → 文章页 → 关于/标签/404 → 交互/分享图。

```bash
npm run verify
npm run verify:frontend
node scripts/check-base-parity.mjs --self-test
```

`verify` 证明数据、内容和现有路由可构建；`verify:frontend` 另外要求完整前端必需路由和分享图，当前不再报告缺失。该检查仍作为发布前结构门槛存在。

双路径检查扫描实际 HTML 的 href/src、同站 meta、RSS、sitemap 与 robots；外部网络可达性、同页锚点、CSS 内部 url()、srcset、视觉及交互需另外核验。它保留用户原有 dist，不再生成源码探针。

浏览器必测：375px 与桌面首页/文章、两套主题、主题刷新保持/无闪烁、存储受限时页面可用、真实译文互跳、无译文回首页、标签筛选、404、两个 RSS、键盘导航和 reduced-motion。

完成后附实际命令输出、浏览器验收结果和改动接口清单。不要固定测试数量；新增必要回归测试是允许的。提交或推送按用户当前授权执行。
