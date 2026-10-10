# 前端交接说明（给 Kimi）

> 这份文档是**接口契约**。后端（数据层、链接助手、构建工具、部署配置）已经完成并通过验证，
> 现在轮到你写展示层。按本文档的边界工作，不会和已有代码打架。

**项目目录**：`E:\deepseek\yukki-rui`
**配套文档**：设计文档 `docs/superpowers/specs/2026-10-10-yukki-rui-blog-design.md`（§7 是本节的长版）、实施计划 `docs/superpowers/plans/2026-10-10-yukki-rui-blog.md`

---

## 1. 当前状态：什么已经能跑，什么还没写

**已经完成并验证的（不要改）**

| 文件 | 内容 | 验证方式 |
|---|---|---|
| `src/content.config.ts` | 文章 frontmatter 的 Zod schema | 构建时强制校验 |
| `src/lib/post-select.ts` | 纯函数数据层：筛选、排序、标签、译文查找 | 10 条单测 |
| `src/lib/posts.ts` | 集合读取包装，导出 4 个函数 | 构建期实测 |
| `src/lib/url.ts` | 链接助手：`withBase` / `langHref` / `postHref` / `tagHref` | 6 条单测 + 双 base 实测 |
| `src/consts.ts` | 站名、导航、界面文案、评论区开关、RSS 路径 | 类型检查 |
| `src/content/posts/` | 4 篇示例文章（含 1 对双语配对 + 1 篇无译文对照） | 构建产出 |
| `scripts/check-links.mjs` | 站内死链自检 | 12 条单测 + 双 base 实跑 |
| `scripts/check-base-parity.mjs` | 双 base 一致性检查（含自检模式） | 14 条单测 + 实跑 |
| `.github/workflows/deploy.yml` | 双平台部署 CI | — |

**当前状态**：`npm run check` 0 错误 0 警告；`npm test` **46 条全绿**；两种 base 都能构建。

**你需要写的（全部是展示层）**

```
src/styles/tokens.css          设计令牌（颜色/字号/间距），深浅两套
src/styles/global.css          全局基础样式
src/components/BaseHead.astro  所有 meta / OG / hreflang / JSON-LD
src/components/Header.astro    站名 + 导航 + 语言切换 + 主题切换
src/components/Footer.astro    版权 + RSS 入口
src/components/PostCard.astro  列表里的单篇文章条目
src/components/TagList.astro   标签渲染
src/components/LangSwitch.astro 语言切换
src/components/ThemeToggle.astro 明暗切换
src/components/Comments.astro  评论区占位
src/layouts/BaseLayout.astro   页面骨架
src/layouts/PostLayout.astro   文章页骨架
src/pages/index.astro          语言落地页（目前是占位）
src/pages/[lang]/index.astro   语言首页 ← 目录还不存在，需新建
src/pages/[lang]/about.astro
src/pages/[lang]/posts/[...id].astro
src/pages/[lang]/tags/index.astro
src/pages/[lang]/tags/[tag].astro
src/pages/404.astro
src/pages/rss.xml.ts
src/pages/rss-en.xml.ts
public/robots.txt
public/og-default.png          1200×630 默认 OG 图
```

设计文档 §7 列出了每个文件的职责。**组件的 props 契约如下**（这是权威版本，照它实现）：

### 组件 props 表

| 组件 | 输入 | 职责 |
|---|---|---|
| `BaseHead` | `title` `description` `lang` `ogType?` `ogImage?` `alternate?` | 输出全部 `<head>` 内容。**所有 meta 只在这里出现一次**，页面不自己写 meta |
| `BaseLayout` | `title` `description` `lang` | html/body 骨架、引入 tokens.css + global.css、主题防闪烁脚本、Header、Footer |
| `Header` | `lang` `alternateUrl?` | 站名链接到 `/{lang}/`，导航到首页/标签/关于，右侧放 `LangSwitch` + `ThemeToggle` |
| `Footer` | `lang` | 版权行 + RSS 入口 |
| `PostCard` | `post`（集合条目） | 一篇文章的列表条目：标题、日期、摘要、标签 |
| `PostLayout` | `post` `translations?` | 文章页骨架：标题、日期、正文 slot、标签、`LangSwitch`、`Comments` |
| `TagList` | `lang` `tags` | 标签渲染；`tags` 是 `string[]` 或 `{tag, count}[]`，带 count 时显示计数 |
| `LangSwitch` | `lang` `alternateUrl?` | 有译文跳译文，无译文跳目标语言首页 |
| `ThemeToggle` | 无 | 切换 `<html data-theme>`，写 `localStorage`，带可读的 `aria-label` |
| `Comments` | 无 | 见 §3.3 |

**精确类型**：

```ts
type Lang = 'zh' | 'en';                    // 从 src/consts.ts 导入

interface BaseHeadProps {
  title: string;
  description: string;
  lang: Lang;
  ogType?: 'website' | 'article';
  ogImage?: string;                          // 相对路径，默认 OG_IMAGE
  alternate?: string;                        // 另一语言对应页 URL，由 PostLayout 计算
}

interface BaseLayoutProps {
  title: string;
  description: string;
  lang: Lang;
  ogType?: 'website' | 'article';
  ogImage?: string;
  alternate?: string;
}

interface HeaderProps   { lang: Lang; alternateUrl?: string }
interface FooterProps   { lang: Lang }
interface PostCardProps { post: Post }        // Post 从 src/lib/posts.ts 导入
interface PostLayoutProps { post: Post; translations?: Post }
interface TagListProps  { lang: Lang; tags: string[] | { tag: string; count: number }[] }
interface LangSwitchProps { lang: Lang; alternateUrl?: string }
```

**`Post` 的形状**（`CollectionEntry<'posts'>`）：

```ts
{
  id: string;                    // 'hello-world'
  data: {
    title: string;
    description: string;
    pubDate: Date;               // 已是 Date 对象，不是字符串
    lang: 'zh' | 'en';
    tags: string[];
    updatedDate?: Date;
    draft: boolean;              // 永远存在（schema 默认值），生产下永远是 false
    translationKey?: string;
  };
  render: () => Promise<{ Content: AstroComponentFactory }>;
}
```

---

## 2. 可以自由发挥 vs 不许动

**自由发挥**：配色、字体栈、间距节奏、卡片样式、动效、深浅色具体色值、响应式断点、标签的视觉形态、组件的内部 DOM 结构。

**不许动**（这些是数据契约，改了会连带破坏数据层）：

| 文件 / 符号 | 约束 |
|---|---|
| `src/content.config.ts` | schema 字段名与类型 |
| `src/lib/post-select.ts` | 导出的 3 个函数签名 + `PostData` 接口 |
| `src/lib/posts.ts` | 导出的 4 个函数签名：`getPosts` / `getTags` / `getTranslations` / `getTagNames` |
| `src/lib/url.ts` | 4 个链接助手签名 |
| `src/consts.ts` | 导出的**键名**（键值可以改，比如改站名、改文案） |

**组件 props 必须按设计文档 §7.2 的表。** 如果确实需要改某个 props 签名，顺序是：**先改设计文档 → 再改数据层 → 最后改前端**。反着来一定会出现「前端传了数据层不提供的字段」。

---

## 3. 三条最容易踩的硬约束

### 3.1 所有站内链接必须走 `withBase()`

```astro
---
import { withBase, postHref, tagHref } from '../lib/url';
---

<a href={withBase('zh/about/')}>关于</a>
<a href={postHref('zh', post.id)}>文章</a>
<a href={tagHref('zh', tag)}>标签</a>
```

**禁止**写 `href="/zh/about/"` 这种硬编码。原因：GitHub Pages 部署在 `/yukki-rui/` 子路径下，硬编码的绝对路径全部 404。

这不是理论风险 —— 实测 `import.meta.env.BASE_URL` 在子路径部署下是 `/yukki-rui`（**没有尾斜杠**），直接拼接会得到 `/yukki-ruizh/`。所有拼接差异都已经被收敛进 `withBase()`。

**改完后必须跑**：

```bash
npm run check:base
```

它会用两种 base 各构建一次并比较产物。输出 5 个 ✓ 才算过。

### 3.2 不要在布局里重复写 meta

`BaseHead.astro` 是**所有** `<head>` 内容的唯一落点。页面不自己写 `<title>`、`<meta>`、`og:` 或 `hreflang`。

注意 `Astro.url.pathname` **已经包含 base 前缀**（实测子路径部署下是 `/yukki-rui/zh/`），所以 canonical 用 `new URL(Astro.url.pathname, origin)`，**绝不能再套一层 `withBase()`**，否则会变成 `/yukki-rui/yukki-rui/zh/`。

### 3.3 客户端 JavaScript 预算：每页 0 字节

只有两个例外，且必须内联（不能是外部脚本）：

1. 主题初始化防闪烁脚本 —— 在首屏渲染前读 `localStorage` 落定 `data-theme`
2. 语言落地页的跳转脚本 —— 必须 < 500 字节

`Comments.astro` 在 `COMMENTS.enabled === false` 时必须渲染 `null`，DOM 里不留痕迹、不产生任何第三方请求。

---

## 4. 数据层怎么用

```astro
---
import { getPosts, getTags, getTranslations, getTagNames } from '../lib/posts';
import { SITE, UI, type Lang } from '../consts';

export function getStaticPaths() {
  return SITE.langs.map((lang) => ({ params: { lang } }));
}

const lang = Astro.params.lang as Lang;
const posts = await getPosts(lang);   // 已发布、按日期倒序、草稿已排除
---
```

**要点**：

- `getPosts()` 已经处理了草稿规则（`draft: true` 在 `npm run build` 下不产出、在 `npm run dev` 下可预览）。**不要在页面里再过滤一次草稿**。
- `getStaticPaths` 必须用 `SITE.langs` 限定，否则会为不存在的语言生成页面。
- `[lang]/tags/[tag].astro` 的路由要用 `getTagNames(lang)` 生成，不要自己从文章里算。
- 文章渲染：`const { Content } = await post.render();` 然后 `<Content />`。
- 文章的唯一标识字段是 **`post.id`**（Astro 7 的 `glob` loader 不再提供 `slug`，实测 `id` 就是文件名去扩展名）。

---

## 5. 本地怎么验证

```bash
npm install
npm run dev          # http://localhost:4321/zh/
```

每完成一块就按顺序过一遍：

```bash
npm run check        # astro check：0 错误 0 警告
npm test             # 46 条单测
npm run build        # 构建
npm run check:links  # 站内死链自检
npm run check:base   # 双 base 一致性（5 个 ✓）
```

或者一条命令：

```bash
npm run verify
```

**`check:base` 会临时创建并删除 `src/pages/parity-probe.astro`**，这是正常行为。如果你自己正好有一个同名文件，它会拒绝运行并提示你 —— 换成别的文件名即可。

---

## 6. 交付时应达到的状态

- [ ] `npm run check` 0 错误 0 警告
- [ ] `npm test` 46 条仍全绿（你没有改数据层，所以必须还是 46）
- [ ] `npm run check:links` 输出 `✓ 无死链`
- [ ] `npm run check:base` 输出 5 个 ✓
- [ ] 五条路由都产出页面：`/`、`/zh/`、`/en/`、`/zh/posts/hello-world/`、`/zh/tags/`
- [ ] 四项交互实测可用：语言切换、明暗切换（刷新保持 + 无首屏闪烁）、标签筛选、RSS
- [ ] 无译文的文章（`writing-in-markdown`）点语言切换 → 降级跳 `/en/`
- [ ] 手机宽度（375px）下首页与文章页可读
- [ ] 深浅两套主题下正文对比度都 ≥ 4.5:1

## 7. 完成后怎么交接回来

1. 在仓库里提交你的改动（分支随意，推上来即可）
2. 把上面第 6 节的勾选结果、以及**实际跑出来的命令输出**贴出来 —— 不要写「应该没问题」
3. 如果过程中改了任何 props 签名或数据层，明确列出改了哪些、为什么

我会做整合验证：跑一遍完整的 `npm run verify`，逐条核对设计文档 §8 的验收标准，然后处理部署部分（GitHub 仓库、Cloudflare Pages 连接需要你本人操作，我会给出步骤清单）。
