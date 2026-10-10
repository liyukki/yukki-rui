# yukki rui 个人博客 —— 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `E:\deepseek\yukki-rui` 交付一个中英双语、零成本托管的静态个人博客，用 Markdown 写文章，一次推送到 GitHub Pages 和 Cloudflare Pages 两个地址。

**Architecture:** Astro 7 静态输出（`output: 'static'`）。内容层是 `src/content/posts/*.md` + Zod schema 校验；数据层拆成「纯函数选择器」（可单测）+「集合读取包装」（构建期）；展示层是 Astro 组件与动态路由 `[lang]/…`。部署靠 `SITE_BASE` 环境变量适配两个平台的路径差异，GitHub Actions 一份工作流同时推两处。

**Tech Stack:** Node 24.21.0 / Astro 7.3.8 / zod 4.6.5 / @astrojs/rss 4.0.19 / @astrojs/sitemap 3.7.4 / Vitest 5.0.3 / npm（或 pnpm）

**配套设计文档：** `docs/superpowers/specs/2026-10-10-yukki-rui-blog-design.md`（本计划是它的实施层；两者冲突时以设计文档为准，并要求回头看是否需要修订计划）

---

## Global Constraints

以下约束适用于**每一个**任务，不再逐条重复：

1. **零成本**：不得引入任何需要付费、需要备案、或需要常驻服务的依赖。
2. **零客户端 JavaScript**：每个页面自身 JS 必须为 0 字节。仅两个例外，且都必须内联：语言落地页的跳转脚本（< 500 字节）、主题初始化的防闪烁脚本。
3. **所有站内链接必须走 `withBase()`**（`src/lib/url.ts`）。禁止硬编码以 `/` 开头的绝对路径 —— 这是"本地好、线上 404"的唯一成因。
4. **`src/content.config.ts` 的 schema 与 `src/lib/post-select.ts` 的 `PostData` 接口必须一一对应**，改一个必须同步改另一个。
5. **`src/lib/post-select.ts` 必须保持零依赖**（不许 import `astro:content` 或任何 Astro API），否则它就不再可单测。
6. **前端视觉部分归协作者（Kimi）所有**：本计划只做中性可用的样式，不追求设计感；组件 props 严格按设计文档 §7.2 的表，改动前必须先确认，因为数据层是照着它实现的。
7. **依赖版本以本机实测为准**：Astro 7 要求 Node ≥ 22.12.0（实测 engines 字段）；本机 Node 24.21.0，通过。
8. **提交粒度**：每个任务结束时至少一次 commit，commit message 用 `feat: …` / `test: …` / `chore: …` 前缀。

---

## 已实测确认的技术事实（不要凭记忆改写）

这些结论来自本机真实构建探测，不是文档推测。写代码时以它们为准：

| 事实 | 实测值 |
|---|---|
| 集合条目形状 | `["id","data","body","filePath","digest","rendered","collection"]` |
| 页面 slug 取哪个字段 | **`entry.id`**。Astro 7 的 `glob` loader 不再提供 `slug` 字段，用 `id` |
| `id` 的实际值 | 文件名去扩展名，例如 `hello-world.md` → `"hello-world"` |
| `z.coerce.date()` 结果 | 真实 `Date` 对象（`[object Date]`），可直接 `.getTime()` |
| `draft` 的默认值 | schema 里 `.default(false)` 生效，未写该字段时 `data.draft === false` |
| `import.meta.env.BASE_URL` 的值 | base 为 `/` 时是 `"/"`；base 为 `/yukki-rui` 时是 `"/yukki-rui"` —— **没有结尾斜杠** |
| 直接拼接的后果 | `BASE_URL + 'zh/'` → `"/yukki-ruizh/"`，线上 404。必须用 `withBase()` |
| `Astro.url.pathname` 是否含 base | **含**。base 为 `/yukki-rui` 时，`src/pages/canon.astro` 的 `Astro.url.pathname` 实测为 `"/yukki-rui/canon/"`。因此 canonical 绝不能再拼一次 base |
| 页面产出的目录形态 | `[lang]/index.astro` → `dist/zh/index.html`；`[lang]/about.astro` → `dist/en/about/index.html`。因此 `trailingSlash` 必须设为 `'always'`，否则部分页面会产出 `dist/zh.html` 这种单文件形态，链接自检与链接写法都会不一致 |
| sitemap 的 base 处理 | `@astrojs/sitemap` 自动带 base。base 为 `/yukki-rui` 时 `<loc>` 为 `https://example.github.io/yukki-rui/en/`，**不需要**手工拼 base |
| `astro/loaders` 的导入 | `import { glob } from 'astro/loaders'`，构建期可解析（pnpm 严格结构下不报错） |
| zod 版本 | 4.6.5（`astro/zod` 转发 `zod/v4`） |

---

## File Structure

**本计划创建/修改的文件：**

| 文件 | 职责 |
|---|---|
| `package.json` | 依赖与脚本（`dev` / `build` / `preview` / `test` / `check` / `check:links`） |
| `astro.config.mjs` | site/base、sitemap 集成、`SITE_BASE` 读取 |
| `tsconfig.json` | 继承 `astro/tsconfigs/strict` |
| `vitest.config.ts` | 只跑 `tests/**/*.test.ts`，node 环境 |
| `src/content.config.ts` | **数据契约**：posts 集合的 Zod schema |
| `src/lib/post-select.ts` | **纯函数数据层**：筛选/排序/标签/译文查找（零依赖，被单测覆盖） |
| `src/lib/posts.ts` | 集合读取包装：`astro:content` → 纯函数 |
| `src/lib/url.ts` | `withBase()` / `langHref()` / `postHref()` |
| `src/consts.ts` | 站名、URL、导航、`COMMENTS` 开关 |
| `src/styles/tokens.css` | 设计令牌（颜色/字号/间距），深浅两套 |
| `src/styles/global.css` | 全局基础样式 |
| `src/layouts/BaseLayout.astro` | 页面骨架 + 主题脚本 + Header/Footer |
| `src/layouts/PostLayout.astro` | 文章页骨架，中英共用 |
| `src/components/*.astro` | 8 个组件，见设计文档 §7.2 |
| `src/pages/**` | 路由：落地页、`[lang]/` 首页、文章、关于、标签、404、RSS×2 |
| `scripts/check-links.mjs` | 构建产物站内链接自检 |
| `scripts/make-og-image.py` | 生成默认 OG 图（1200×630） |
| `.github/workflows/deploy.yml` | 双平台部署 |
| `tests/post-select.test.ts` | 数据层单测（10 条，已完成） |
| `tests/check-links.test.ts` | 链接解析器单测（覆盖两种 base） |
| `tests/url.test.ts` | `withBase()` 两种 base 的单测 |
| `README.md` | 写作流程 + 上线检查清单 |

**测试策略为什么这样切：** `src/lib/post-select.ts` 是零依赖纯函数，所以能用快速单测钉死全部业务规则（草稿隐藏、语言隔离、排序、标签计数、译文查找）。`src/lib/posts.ts` 只做一层 `await getCollection()` 转发，没有分支逻辑，不单独测试。链接解析器的核心是字符串处理，也抽成纯函数来测两种 base。

---

## Task 1: 项目骨架与构建可验证

**Files:**
- Modify: `package.json`（补脚本、固定包管理器）
- Create: `astro.config.mjs`、`tsconfig.json`、`vitest.config.ts`（三者已在本会话探测阶段创建并冻结）
- Create: `src/lib/url.ts`
- Test: `tests/url.test.ts`

**`astro.config.mjs` 的冻结内容**（已实测通过，勿改）：

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const base = process.env.SITE_BASE ?? '/';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://example.github.io/yukki-rui',
  base,
  output: 'static',
  trailingSlash: 'always', // 见下方「已实测确认的技术事实」
  integrations: [sitemap()],
});
```

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `withBase(path: string): string`、`langHref(lang: 'zh' | 'en'): string`、`postHref(lang: 'zh' | 'en', id: string): string`

> 前置状态：`astro.config.mjs`、`tsconfig.json`、`vitest.config.ts`、`src/lib/url.ts`、`package.json` 已在本会话探测阶段创建。本任务的工作是补齐脚本、写测试、并验证两种 base 都能构建。

- [ ] **Step 1: 补齐 `package.json` 的脚本与包管理器字段**

```json
{
  "name": "yukki-rui",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "packageManager": "npm@11.7.0",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "test": "vitest run",
    "check:links": "node scripts/check-links.mjs"
  }
}
```

**不要**写 `"build:ghpages": "SITE_BASE=/yukki-rui astro build"` —— 那是 POSIX shell 语法，在 Windows 上直接失败。子路径构建由 CI 或手工 `$env:SITE_BASE` 完成（见 Step 6），不放进 npm script。

- [ ] **Step 2: 写 `withBase()` 的单元测试**

`tests/url.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

/**
 * withBase 的行为依赖 import.meta.env.BASE_URL，而 vitest 下该值为 '/'。
 * 因此这里测的是「解析逻辑」：给一个 base 和 path，产出什么。
 * 为此我们把纯逻辑抽成可注入 base 的形式。
 */
import { joinBase } from '../src/lib/url';

describe('joinBase', () => {
  it('根路径 base 下不产生双斜杠', () => {
    expect(joinBase('/', 'zh/')).toBe('/zh/');
  });

  it('子路径 base 下正确拼接（BASE_URL 没有结尾斜杠）', () => {
    expect(joinBase('/yukki-rui', 'zh/')).toBe('/yukki-rui/zh/');
  });

  it('子路径 base 带结尾斜杠时也不重复', () => {
    expect(joinBase('/yukki-rui/', 'zh/')).toBe('/yukki-rui/zh/');
  });

  it('传入前导斜杠的 path 也能正确处理', () => {
    expect(joinBase('/yukki-rui', '/zh/')).toBe('/yukki-rui/zh/');
  });

  it('空 path 返回 base 根', () => {
    expect(joinBase('/yukki-rui', '')).toBe('/yukki-rui/');
    expect(joinBase('/', '')).toBe('/');
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `pnpm test`
Expected: FAIL —— `joinBase is not a function` / 导入失败（因为 `url.ts` 里还没有这个导出）

- [ ] **Step 4: 重构 `src/lib/url.ts`，抽出可注入的 `joinBase()`**

```ts
/**
 * 站内链接助手。
 *
 * 为什么必须用它：`import.meta.env.BASE_URL` 的值在两种部署下分别是
 *   Cloudflare Pages → "/"
 *   GitHub Pages     → "/yukki-rui"      ← 注意：没有结尾斜杠
 * 实测直接拼接会得到 "/yukki-ruizh/"，线上必然 404。
 */

/** 纯字符串逻辑，可注入 base，因此可被单元测试覆盖。 */
export function joinBase(base: string, path: string): string {
  const clean = path.replace(/^\/+/, '');
  const root = base.endsWith('/') ? base : `${base}/`;
  return clean === '' ? root : root + clean;
}

const BASE = import.meta.env.BASE_URL;

export function withBase(path: string): string {
  return joinBase(BASE, path);
}

/** langHref('zh') -> '/zh/' */
export function langHref(lang: 'zh' | 'en'): string {
  return withBase(`${lang}/`);
}

/** postHref('zh', 'hello-world') -> '/zh/posts/hello-world/' */
export function postHref(lang: 'zh' | 'en', id: string): string {
  return withBase(`${lang}/posts/${id}/`);
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `pnpm test`
Expected: PASS —— `tests/url.test.ts` 5 条 + `tests/post-select.test.ts` 10 条，共 15 条通过

- [ ] **Step 6: 验证两种 base 都能构建**

PowerShell（Windows）：

```powershell
$env:SITE_BASE="/"; pnpm build; Get-ChildItem dist -Name
Remove-Item dist -Recurse -Force
$env:SITE_BASE="/yukki-rui"; pnpm build; Get-ChildItem dist -Name
Remove-Item Env:\SITE_BASE
```

Expected: 两次都 `Complete!`；`dist/` 下都有 `index.html` 和 `sitemap-index.xml`

- [ ] **Step 7: Commit**

```bash
git add package.json astro.config.mjs tsconfig.json vitest.config.ts src/lib/url.ts tests/url.test.ts
git commit -m "chore: 项目骨架、withBase 链接助手与单测"
```

---

## Task 2: 数据层（纯函数选择器 + 集合包装）

**Files:**
- Create: `src/content.config.ts`（已存在，本任务确认并冻结）
- Create: `src/lib/post-select.ts`（已存在，本任务确认并冻结）
- Create: `src/lib/posts.ts`
- Test: `tests/post-select.test.ts`（已存在，10 条已通过）

**Interfaces:**
- Consumes: `PostData`、`PostLike`（来自 `post-select.ts`）
- Produces:
  - `selectPosts<T extends PostLike>(entries, lang, isProd): T[]`
  - `collectTags(posts): Array<{ tag: string; count: number }>`
  - `findTranslation<T extends PostLike>(entries, post): T | undefined`
  - `getPosts(lang: 'zh' | 'en'): Promise<CollectionEntry<'posts'>[]>`
  - `getTags(lang: 'zh' | 'en'): Promise<Array<{ tag: string; count: number }>>`
  - `getTranslations(post): Promise<CollectionEntry<'posts'> | undefined>`

- [ ] **Step 1: 确认数据层单测全绿**

Run: `pnpm test`
Expected: PASS —— `post-select.test.ts` 10 条覆盖：语言隔离、日期倒序、生产隐藏草稿、开发保留草稿、标签计数降序、标签空数组、译文查找四态（找到/无译文/无 key/不返回自己）

- [ ] **Step 2: 写 `src/lib/posts.ts`（集合读取包装）**

```ts
import { getCollection, type CollectionEntry } from 'astro:content';
import {
  collectTags,
  findTranslation,
  selectPosts,
  type PostLike,
} from './post-select';

export type Post = CollectionEntry<'posts'>;

/**
 * 构建期读集合，然后交给纯函数筛选。
 *
 * isProd 用 import.meta.env.PROD 判断：astro build 为 true，astro dev 为 false。
 * 这是「生产绝不产出草稿、开发可预览草稿」这条规则的唯一落点 ——
 * 列表页、文章页的 getStaticPaths、RSS 三处都调用本函数，因此规则只需实现一次。
 */
async function allPosts(): Promise<Post[]> {
  return (await getCollection('posts')) as Post[];
}

export async function getPosts(lang: 'zh' | 'en'): Promise<Post[]> {
  const entries = await allPosts();
  return selectPosts(entries as PostLike[], lang, import.meta.env.PROD) as Post[];
}

export async function getTags(
  lang: 'zh' | 'en',
): Promise<Array<{ tag: string; count: number }>> {
  return collectTags(await getPosts(lang));
}

export async function getTranslations(post: Post): Promise<Post | undefined> {
  const entries = await allPosts();
  return findTranslation(entries as PostLike[], post as PostLike) as Post | undefined;
}
```

- [ ] **Step 3: 写一个临时探测页，验证集合读取真的跑通**

`src/pages/probe.astro`：

```astro
---
import { getPosts, getTags } from '../lib/posts';

const zhPosts = await getPosts('zh');
const zhTags = await getTags('zh');
console.log('PROBE zh count ->', zhPosts.length);
console.log('PROBE zh ids ->', JSON.stringify(zhPosts.map((p) => p.id)));
console.log('PROBE zh tags ->', JSON.stringify(zhTags));
console.log('PROBE PROD ->', import.meta.env.PROD);
---

<html lang="zh-CN"><head><title>probe</title></head><body><p>probe</p></body></html>
```

- [ ] **Step 4: 构建并检查探测输出**

Run: `pnpm build`
Expected: 输出中出现 `PROBE zh count -> 1`（当前只有 `hello-world.md`）、`PROBE zh ids -> ["hello-world"]`、`PROBE PROD -> true`

- [ ] **Step 5: 加一篇 `draft: true` 的文章，验证生产模式隐藏它**

创建 `src/content/posts/draft-test.md`：

```markdown
---
title: 草稿测试
description: 用来验证生产构建不产出草稿页面。
pubDate: 2026-10-11
lang: zh
draft: true
---

这篇不应该出现在生产构建里。
```

Run: `pnpm build`
Expected: `PROBE zh count -> 1`（**仍是 1**，草稿被排除）；`dist/` 下不存在 `zh/posts/draft-test/`

- [ ] **Step 6: 验证开发模式保留草稿**

Run: `pnpm dev`（另开终端），访问 `http://localhost:4321/probe/` 看终端输出
Expected: `PROBE zh count -> 2`、`PROBE PROD -> false`
然后停掉 dev server。

- [ ] **Step 7: 删除探测页与草稿测试文件**

```powershell
Remove-Item src/pages/probe.astro, src/content/posts/draft-test.md -Force
```

`draft-test.md` 必须删掉 —— 它的价值已经被这次验证消耗完了，留在仓库里只会变成噪音。

- [ ] **Step 8: Commit**

```bash
git add src/lib/posts.ts src/lib/post-select.ts src/content.config.ts
git commit -m "feat: 数据层——纯函数选择器与集合读取包装"
```

---

## Task 3: 示例内容与常量

**Files:**
- Create: `src/content/posts/hello-world.md`（已存在，本任务补齐）
- Create: `src/content/posts/hello-world.en.md`
- Create: `src/content/posts/building-this-site.md`
- Create: `src/content/posts/writing-in-markdown.md`
- Create: `src/consts.ts`

**Interfaces:**
- Consumes: `src/content.config.ts` 的 schema（字段名与类型必须严格匹配）
- Produces: `SITE`、`NAV`、`COMMENTS` 常量

- [ ] **Step 1: 写 `src/consts.ts`**

```ts
/**
 * 全站常量。改站名、改地址、开评论区，都只动这个文件。
 *
 * 注意：SITE.url 必须在部署前改成真实地址，否则 sitemap 和 RSS 里的链接会是假的。
 */
export const SITE = {
  name: 'yukki rui',
  title: 'yukki rui',
  description: '一个用 Markdown 写的中英双语个人博客。',
  url: 'https://example.github.io/yukki-rui', // TODO(用户): 部署前改成真实地址
  author: 'yukki rui',
  defaultLang: 'zh' as const,
  langs: ['zh', 'en'] as const,
};

export type Lang = (typeof SITE.langs)[number];

export const NAV: Record<Lang, Array<{ label: string; path: string }>> = {
  zh: [
    { label: '首页', path: 'zh/' },
    { label: '关于', path: 'zh/about/' },
  ],
  en: [
    { label: 'Home', path: 'en/' },
    { label: 'About', path: 'en/about/' },
  ],
};

/**
 * 评论区开关。enabled === false 时 Comments.astro 渲染 null，
 * DOM 里不留痕迹、不产生任何第三方请求。
 */
export const COMMENTS = {
  enabled: false,
  provider: 'giscus' as const,
  repo: '',
  repoId: '',
  category: 'Announcements',
  categoryId: '',
};

/** 默认 OG 图，相对 public/ 的路径。 */
export const OG_IMAGE = '/og-default.png';
```

- [ ] **Step 2: 写四篇示例文章**

`src/content/posts/hello-world.md`（中文，与英文版配对）：

```markdown
---
title: 你好，世界
description: 第一篇文章，说明这个站点为什么存在，以及它跑在什么上面。
pubDate: 2026-10-10
lang: zh
tags: [随笔]
translationKey: hello-world
---

这是 **yukki rui** 的第一篇文章。

## 这个站点是什么

一个用 Markdown 写的个人博客。没有服务器，没有域名账单，没有任何需要每月付钱的东西。

## 它是怎么跑起来的

文章是 `.md` 文件，提交到 Git 之后自动构建成一堆 HTML，然后同时发布到两个免费托管平台。

- GitHub Pages：海外访问
- Cloudflare Pages：中国大陆相对可访问

两个地址都是平台送的二级域名，都不需要备案。
```

`src/content/posts/hello-world.en.md`：

```markdown
---
title: Hello, World
description: The first post — why this site exists and what it runs on.
pubDate: 2026-10-10
lang: en
tags: [notes]
translationKey: hello-world
---

This is the first post on **yukki rui**.

## What this is

A personal blog written in Markdown. No server, no domain bill, nothing to pay for monthly.

## How it runs

Posts are `.md` files. Once committed, they are built into static HTML and published to two free hosts at the same time.

- GitHub Pages: reachable from outside mainland China
- Cloudflare Pages: comparatively reachable from mainland China

Both addresses are subdomains provided by the platforms, and neither requires an ICP filing.
```

`src/content/posts/writing-in-markdown.md`（中文，无译文 —— 用来验证降级行为）：

```markdown
---
title: 用 Markdown 写作
description: 这个站点支持的写作语法，以及几条让文章更好读的建议。
pubDate: 2026-10-12
lang: zh
tags: [写作, 指南]
---

## 基本语法

标题用 `##`，强调用 `**加粗**`，链接写成 `[文字](https://example.com)`。

## 代码

围栏代码块会带语法高亮：

```js
const answer = 42;
console.log(answer);
```

## 引用与列表

> 引用写成这样。

1. 有序列表
2. 第二项

- 无序列表
- 第二项
```

`src/content/posts/building-this-site.md`：

```markdown
---
title: 这个站点是怎么搭起来的
description: Astro、两处免费托管，以及为什么不需要买服务器和域名。
pubDate: 2026-10-15
lang: zh
tags: [技术, 指南]
---

## 为什么不用服务器

个人博客是静态内容 —— 每篇文章在构建时就变成了 HTML 文件，没有数据库、没有登录、没有需要实时计算的东西。静态内容托管平台免费提供，而且比自购服务器更快、更稳。

## 为什么不用买域名

平台会赠送二级域名。代价是地址长了点、换平台会变，但省下的是钱和每年续费的注意力。
```

- [ ] **Step 3: 验证构建包含 4 篇（3 中文 + 1 英文）**

Run: `pnpm build`
Expected: 构建成功，无 schema 校验错误。若报 `InvalidContentEntryDataError`，说明某篇 frontmatter 缺字段 —— 按报错里给出的字段名补齐。

- [ ] **Step 4: 用 grep 确认英文文章确实被识别为英文**

Run: `pnpm test`
Expected: PASS（单测不依赖真实内容，此步只是确认改动没破坏构建）

- [ ] **Step 5: Commit**

```bash
git add src/consts.ts src/content/posts/
git commit -m "feat: 站点常量与四篇示例文章（含一对双语配对）"
```

---

## Task 4: 布局与 head

**Files:**
- Create: `src/styles/tokens.css`、`src/styles/global.css`
- Create: `src/components/BaseHead.astro`、`Header.astro`、`Footer.astro`、`ThemeToggle.astro`、`LangSwitch.astro`
- Create: `src/layouts/BaseLayout.astro`

**Interfaces:**
- Consumes: `SITE`、`NAV`、`OG_IMAGE`、`Lang`（来自 `consts.ts`）；`withBase`、`langHref`（来自 `url.ts`）
- Produces: 组件 props 严格按设计文档 §7.2 —— `BaseHead(title, description, lang, ogType?, ogImage?, alternate?)`、`BaseLayout(title, description, lang)`、`Header(lang)`、`Footer(lang)`、`ThemeToggle()`、`LangSwitch(lang, alternateUrl?)`

> 这些文件名和 props 是**冻结契约**。Kimi 会照设计文档 §7.2 修改它们的样式和内部结构，但 props 签名不变。

- [ ] **Step 1: 写 `src/styles/tokens.css`（设计令牌，深浅两套）**

```css
/* 所有颜色和尺寸只在这里定义。组件里不许出现魔法色值。 */
:root {
  --font-sans: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Consolas, monospace;

  --size-step--1: 0.875rem;
  --size-step-0: 1rem;
  --size-step-1: 1.25rem;
  --size-step-2: 1.5rem;
  --size-step-3: 2rem;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 2.5rem;

  --radius: 6px;
  --measure: 68ch;          /* 正文最大行宽，保证可读性 */

  --bg: #ffffff;
  --surface: #f6f6f7;
  --text: #1a1a1a;
  --text-muted: #5c5c66;
  --border: #e2e2e6;
  --accent: #2f5d8a;
}

[data-theme='dark'] {
  --bg: #14151a;
  --surface: #1d1f26;
  --text: #ececf1;
  --text-muted: #a2a2b0;
  --border: #2e313b;
  --accent: #7fb0e0;
}
```

- [ ] **Step 2: 写 `src/styles/global.css`**

```css
*, *::before, *::after { box-sizing: border-box; }

html {
  font-family: var(--font-sans);
  color: var(--text);
  background: var(--bg);
  line-height: 1.7;
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main { flex: 1; width: 100%; max-width: var(--measure); margin: 0 auto; padding: var(--space-4) var(--space-3); }

a { color: var(--accent); }
a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

img { max-width: 100%; height: auto; }

pre, code { font-family: var(--font-mono); font-size: var(--size-step--1); }
pre { overflow-x: auto; padding: var(--space-3); background: var(--surface); border-radius: var(--radius); }

blockquote { margin: var(--space-4) 0; padding-left: var(--space-3); border-left: 3px solid var(--border); color: var(--text-muted); }

hr { border: 0; border-top: 1px solid var(--border); }

/* 尊重系统的减少动效偏好 —— 设计文档 §6.2 的硬要求 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 3: 写 `src/components/BaseHead.astro`（所有 meta 的唯一落点）**

```astro
---
import { SITE, OG_IMAGE } from '../consts';
import { withBase } from '../lib/url';

interface Props {
  title: string;
  description: string;
  lang: 'zh' | 'en';
  ogType?: 'website' | 'article';
  ogImage?: string;
  alternate?: string; // 另一语言对应页面的 URL；无译文时传该语言首页
}

const { title, description, lang, ogType = 'website', ogImage = OG_IMAGE, alternate } = Astro.props;
const htmlLang = lang === 'zh' ? 'zh-CN' : 'en';
const otherLang = lang === 'zh' ? 'en' : 'zh';

// 注意：Astro.url.pathname 已经包含 base 前缀（实测 "/yukki-rui/zh/"），
// 所以这里用 site 的 origin 拼 pathname，绝不能再拼一次 withBase()，
// 否则子路径部署下会变成 "/yukki-rui/yukki-rui/zh/"。
const origin = new URL(SITE.url).origin;
const canonical = new URL(Astro.url.pathname, origin).href;
const toAbsolute = (path: string) => new URL(path, origin).href;
---

<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title}</title>
<meta name="description" content={description} />
<link rel="canonical" href={canonical} />

<link rel="alternate" hreflang="zh-CN" href={toAbsolute(withBase('zh/'))} />
<link rel="alternate" hreflang="en" href={toAbsolute(withBase('en/'))} />
<link rel="alternate" hreflang="x-default" href={toAbsolute(withBase(''))} />
{alternate && <link rel="alternate" hreflang={lang === 'zh' ? 'en' : 'zh-CN'} href={toAbsolute(alternate)} />}

<meta property="og:type" content={ogType} />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:url" content={canonical} />
<meta property="og:image" content={toAbsolute(ogImage)} />
<meta property="og:locale" content={htmlLang === 'zh-CN' ? 'zh_CN' : 'en_US'} />
<meta name="twitter:card" content="summary_large_image" />

<link rel="alternate" type="application/rss+xml" title={`${SITE.name} · ${lang === 'zh' ? '中文' : 'English'}`} href={withBase(lang === 'zh' ? 'rss.xml' : 'rss-en.xml')} />
```

说明 `otherLang` 是给后续任务备用的，本任务可以不使用；若未使用请删掉，避免 lint 噪音。

**为什么 hreflang 全部指向语言首页**：`BaseHead` 只知道当前页的语言，不知道译文地址。文章页的译文 URL 通过 `alternate` 传入（见 `PostLayout`），其余页面回落到语言首页是正确且无害的。

- [ ] **Step 4: 写 `ThemeToggle.astro` 与防闪烁脚本**

`src/components/ThemeToggle.astro`：

```astro
---
// 无 props。切换 <html data-theme>，写入 localStorage。
// 防闪烁的关键不在本组件，而在 BaseLayout 里的内联脚本（首屏渲染前落定主题）。
---

<button id="theme-toggle" type="button" aria-label="切换深浅色主题">
  <span aria-hidden="true">◐</span>
</button>

<script is:inline>
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
  });
</script>
```

- [ ] **Step 5: 写 `LangSwitch.astro`**

```astro
---
import { withBase } from '../lib/url';

interface Props {
  lang: 'zh' | 'en';
  alternateUrl?: string; // 有译文时传译文 URL，否则跳目标语言首页
}

const { lang, alternateUrl } = Astro.props;
const target: 'zh' | 'en' = lang === 'zh' ? 'en' : 'zh';
const href = alternateUrl ?? withBase(`${target}/`);
const label = target === 'zh' ? '中文' : 'English';
---

<a href={href} hreflang={target === 'zh' ? 'zh-CN' : 'en'}>{label}</a>
```

- [ ] **Step 6: 写 `Header.astro` 与 `Footer.astro`**

```astro
---
// Header.astro
import { NAV, SITE } from '../consts';
import { langHref } from '../lib/url';
import LangSwitch from './LangSwitch.astro';
import ThemeToggle from './ThemeToggle.astro';

interface Props { lang: 'zh' | 'en'; alternateUrl?: string }
const { lang, alternateUrl } = Astro.props;
---

<header>
  <a href={langHref('zh')}>{SITE.name}</a>
  <nav>
    {NAV[lang].map((item) => <a href={withBase(item.path)}>{item.label}</a>)}
  </nav>
  <LangSwitch lang={lang} alternateUrl={alternateUrl} />
  <ThemeToggle />
</header>
```

注意：上面用了 `withBase` 但 import 列表里没写 —— 补上 `import { langHref, withBase } from '../lib/url';`。

`Footer.astro`：

```astro
---
import { SITE } from '../consts';
import { withBase } from '../lib/url';
interface Props { lang: 'zh' | 'en' }
const { lang } = Astro.props;
const year = new Date().getFullYear();
---

<footer>
  <p>© {year} {SITE.author}</p>
  <a href={withBase(lang === 'zh' ? 'rss.xml' : 'rss-en.xml')}>RSS</a>
</footer>
```

- [ ] **Step 7: 写 `src/layouts/BaseLayout.astro`**

```astro
---
import '../styles/tokens.css';
import '../styles/global.css';
import BaseHead from '../components/BaseHead.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';

interface Props {
  title: string;
  description: string;
  lang: 'zh' | 'en';
  ogType?: 'website' | 'article';
  ogImage?: string;
  alternate?: string;
}

const { title, description, lang, ogType, ogImage, alternate } = Astro.props;
const htmlLang = lang === 'zh' ? 'zh-CN' : 'en';
---

<!doctype html>
<html lang={htmlLang} data-theme="light">
  <head>
    <BaseHead title={title} description={description} lang={lang} ogType={ogType} ogImage={ogImage} alternate={alternate} />
    {/* 首屏渲染前落定主题，避免深浅色闪烁。必须内联，不能是外部脚本。 */}
    <script is:inline>
      try {
        const saved = localStorage.getItem('theme');
        const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme = saved ?? (prefersDark ? 'dark' : 'light');
      } catch {}
    </script>
  </head>
  <body>
    <Header lang={lang} alternateUrl={alternate} />
    <main><slot /></main>
    <Footer lang={lang} />
  </body>
</html>
```

- [ ] **Step 8: 用首页验证布局能渲染**

暂时把 `src/pages/index.astro` 改成：

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title="yukki rui" description="语言选择" lang="zh">
  <p>布局自检通过</p>
</BaseLayout>
```

Run: `pnpm build && pnpm preview`
Expected: 构建成功；浏览器打开预览地址能看到「布局自检通过」、页头页脚、主题切换按钮可用

- [ ] **Step 9: Commit**

```bash
git add src/styles/ src/components/ src/layouts/ src/pages/index.astro
git commit -m "feat: 设计令牌、基础样式、BaseLayout 与头部组件"
```

---

## Task 5: 路由与页面

**Files:**
- Create: `src/pages/[lang]/index.astro`、`[lang]/about.astro`、`[lang]/posts/[...id].astro`
- Create: `src/components/PostCard.astro`、`src/layouts/PostLayout.astro`
- Modify: `src/pages/index.astro`（改成语言落地页）

**Interfaces:**
- Consumes: `getPosts`、`getTranslations`（`lib/posts.ts`）；`postHref`、`withBase`；`BaseLayout`、`PostLayout`
- Produces: 四条路由 —— `/`（落地页）、`/[lang]/`、`/[lang]/about/`、`/[lang]/posts/[id]/`
- Produces: `PostCard(post)`、`PostLayout(post, translations)`

- [ ] **Step 1: 写 `src/components/PostCard.astro`**

```astro
---
import type { Post } from '../lib/posts';
import { postHref } from '../lib/url';

interface Props { post: Post }
const { post } = Astro.props;
const { title, description, pubDate, tags, lang } = post.data;
const date = pubDate.toISOString().slice(0, 10);
---

<article>
  <h2><a href={postHref(lang, post.id)}>{title}</a></h2>
  <p><time datetime={date}>{date}</time></p>
  <p>{description}</p>
  {tags.length > 0 && <ul>{tags.map((tag) => <li><a href={`${withBase(`${lang}/tags/${tag}/`)}`}>{tag}</a></li>)}</ul>}
</article>
```

补上缺失的 import：`import { postHref, withBase } from '../lib/url';`

- [ ] **Step 2: 写 `src/layouts/PostLayout.astro`**

```astro
---
import BaseLayout from './BaseLayout.astro';
import type { Post } from '../lib/posts';
import { withBase } from '../lib/url';
import Comments from '../components/Comments.astro';

interface Props {
  post: Post;
  translations?: Post;
}

const { post, translations } = Astro.props;
const { title, description, pubDate, updatedDate, tags, lang, translationKey } = post.data;
const alternate = translationKey
  ? (translations ? withBase(`${translations.data.lang}/posts/${translations.id}/`) : withBase(`${lang === 'zh' ? 'en' : 'zh'}/`))
  : undefined;
const isoDate = pubDate.toISOString().slice(0, 10);
---

<BaseLayout title={title} description={description} lang={lang} ogType="article" alternate={alternate}>
  <article>
    <header>
      <h1>{title}</h1>
      <p><time datetime={isoDate}>{isoDate}</time>{updatedDate && <span> · 更新于 {updatedDate.toISOString().slice(0, 10)}</span>}</p>
    </header>
    <slot />
    {tags.length > 0 && <ul>{tags.map((tag) => <li><a href={withBase(`${lang}/tags/${tag}/`)}>{tag}</a></li>)}</ul>}
    <Comments />
  </article>
</BaseLayout>
```

- [ ] **Step 3: 写 `src/components/Comments.astro`（开关式占位）**

```astro
---
import { COMMENTS } from '../consts';

// enabled === false 时渲染 null：DOM 里不留痕迹，不产生任何第三方请求。
// 想开评论时，把 consts.ts 里的 enabled 改成 true 并填好四个 ID。
const show = COMMENTS.enabled && COMMENTS.repo && COMMENTS.repoId;
---

{show && (
  <section class="comments">
    <h2>评论</h2>
    <script
      is:inline
      src="https://giscus.app/client.js"
      data-repo={COMMENTS.repo}
      data-repo-id={COMMENTS.repoId}
      data-category={COMMENTS.category}
      data-category-id={COMMENTS.categoryId}
      data-mapping="pathname"
      data-reactions-enabled="1"
      data-loading="lazy"
      async
    ></script>
  </section>
)}
```

- [ ] **Step 4: 写 `src/pages/[lang]/index.astro`（语言首页）**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import PostCard from '../../components/PostCard.astro';
import { getPosts } from '../../lib/posts';
import { SITE, type Lang } from '../../consts';

export function getStaticPaths() {
  return SITE.langs.map((lang) => ({ params: { lang } }));
}

const lang = Astro.params.lang as Lang;
const posts = await getPosts(lang);
const title = lang === 'zh' ? `${SITE.name} · 中文` : `${SITE.name} · English`;
---

<BaseLayout title={title} description={SITE.description} lang={lang}>
  <h1>{SITE.name}</h1>
  <p>{lang === 'zh' ? '最新的文章' : 'Latest posts'}</p>
  {posts.length === 0
    ? <p>{lang === 'zh' ? '还没有文章。' : 'No posts yet.'}</p>
    : posts.map((post) => <PostCard post={post} />)}
</BaseLayout>
```

- [ ] **Step 5: 写 `src/pages/[lang]/posts/[...id].astro`（文章页）**

```astro
---
import PostLayout from '../../../layouts/PostLayout.astro';
import { getPosts, getTranslations, type Post } from '../../../lib/posts';
import { SITE, type Lang } from '../../../consts';
import { postHref } from '../../../lib/url';

export async function getStaticPaths() {
  // 只用这两种语言，避免为不存在的语言生成页面
  const paths = [];
  for (const lang of SITE.langs) {
    const posts = await getPosts(lang);
    for (const post of posts) {
      paths.push({ params: { lang, id: post.id }, props: { post } });
    }
  }
  return paths;
}

interface Props { post: Post }
const { post } = Astro.props;
const lang = post.data.lang as Lang;
const translations = await getTranslations(post);
const { Content } = await post.render();
---

<PostLayout post={post} translations={translations}>
  <Content />
</PostLayout>
```

说明：`getPosts(lang)` 已经过滤掉草稿，因此 `getStaticPaths` 天然不会为草稿生成页面 —— 这正是设计文档里「规则只需实现一次」的含义。路由参数用 `[...id]` 而不是 `[id]`，是为了让 `id` 中可能存在的斜杠路径也能工作。

- [ ] **Step 6: 写 `src/pages/[lang]/about.astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { SITE, type Lang } from '../../consts';

export function getStaticPaths() {
  return SITE.langs.map((lang) => ({ params: { lang } }));
}

const lang = Astro.params.lang as Lang;
const title = lang === 'zh' ? '关于' : 'About';
---

<BaseLayout title={`${title} · ${SITE.name}`} description={SITE.description} lang={lang}>
  <h1>{title}</h1>
  {lang === 'zh' ? (
    <p>这里是 yukki rui 的个人博客。文章用 Markdown 写，站点是纯静态的 <em>（这段占位文案由你本人替换）</em>。</p>
  ) : (
    <p>This is yukki rui's personal blog. Posts are written in Markdown and the site is fully static. <em>(Placeholder copy — replace with your own.)</em></p>
  )}
</BaseLayout>
```

- [ ] **Step 7: 把 `src/pages/index.astro` 改成语言落地页**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { withBase } from '../lib/url';
import { SITE } from '../consts';
---

<BaseLayout title={SITE.name} description={SITE.description} lang="zh">
  <h1>{SITE.name}</h1>
  <p><a href={withBase('zh/')}>中文</a> · <a href={withBase('en/')}>English</a></p>
  <!--
    只在根路径执行的跳转脚本。禁用 JS 时上面的链接仍可用，因此不会把人困住。
    必须 < 500 字节（质量预算，见设计文档 §6.1）。
  -->
  <script is:inline>
    if (location.pathname.replace(/\/+$/, '') === 'BASE_PLACEHOLDER') {
      location.replace((navigator.language || '').toLowerCase().startsWith('zh') ? 'ZH' : 'EN');
    }
  </script>
</BaseLayout>
```

`BASE_PLACEHOLDER` / `ZH` / `EN` 不能手写 —— 用 frontmatter 里算好的值注入：

```astro
---
const rootPath = withBase('').replace(/\/+$/, '') || '/';
const zhUrl = withBase('zh/');
const enUrl = withBase('en/');
---
<script is:inline define:vars={{ rootPath, zhUrl, enUrl }}>
  if (location.pathname.replace(/\/+$/, '') === rootPath || location.pathname === '/') {
    location.replace((navigator.language || '').toLowerCase().startsWith('zh') ? zhUrl : enUrl);
  }
</script>
```

注意 `Astro.url.pathname` **包含** base 前缀（实测 `/yukki-rui/zh/`），而运行时 `location.pathname` 也包含它 —— 所以这里比较 `location.pathname` 与 `withBase('')` 是口径一致的。对根部署，`withBase('')` 返回 `'/'`，比较值为 `'/' || '/'`，同样成立。**两种 base 都要实测**（Task 8 Step 4）。

- [ ] **Step 8: 验证四条路由都存在**

Run: `pnpm build` 然后 `Get-ChildItem dist -Recurse -Filter index.html | Select-Object FullName`

Expected 至少包含：

```
dist/index.html
dist/zh/index.html
dist/en/index.html
dist/zh/posts/hello-world/index.html
dist/zh/posts/writing-in-markdown/index.html
dist/zh/posts/building-this-site/index.html
dist/en/posts/hello-world/index.html
dist/zh/about/index.html
dist/en/about/index.html
```

并且**不含** `dist/zh/tags/`（标签页在 Task 7）也不含任何草稿。

- [ ] **Step 9: Commit**

```bash
git add src/pages/ src/components/PostCard.astro src/layouts/PostLayout.astro src/components/Comments.astro
git commit -m "feat: 四条核心路由、文章卡片与文章页布局"
```

---

## Task 6: 标签页、404 与 RSS

**Files:**
- Create: `src/pages/[lang]/tags/index.astro`、`[lang]/tags/[tag].astro`
- Create: `src/pages/404.astro`
- Create: `src/pages/rss.xml.ts`、`rss-en.xml.ts`
- Create: `src/components/TagList.astro`
- Create: `public/robots.txt`

**Interfaces:**
- Consumes: `getPosts`、`getTags`
- Produces: `/zh/tags/`、`/zh/tags/<tag>/`、`/en/tags/…`、`/404.html`、`/rss.xml`、`/rss-en.xml`

- [ ] **Step 1: 写 `src/components/TagList.astro`**

```astro
---
import { withBase } from '../lib/url';

interface Props {
  lang: 'zh' | 'en';
  tags: Array<{ tag: string; count: number }> | string[];
}

const { lang, tags } = Astro.props;
const items = tags.map((t) => (typeof t === 'string' ? { tag: t, count: undefined } : t));
---

<ul>
  {items.map(({ tag, count }) => (
    <li>
      <a href={withBase(`${lang}/tags/${tag}/`)}>{tag}{count !== undefined && ` (${count})`}</a>
    </li>
  ))}
</ul>
```

- [ ] **Step 2: 写 `src/pages/[lang]/tags/index.astro`**

```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import TagList from '../../../components/TagList.astro';
import { getTags } from '../../../lib/posts';
import { SITE, type Lang } from '../../../consts';

export function getStaticPaths() {
  return SITE.langs.map((lang) => ({ params: { lang } }));
}

const lang = Astro.params.lang as Lang;
const tags = await getTags(lang);
const title = lang === 'zh' ? '标签' : 'Tags';
---

<BaseLayout title={`${title} · ${SITE.name}`} description={SITE.description} lang={lang}>
  <h1>{title}</h1>
  {tags.length === 0 ? <p>{lang === 'zh' ? '还没有标签。' : 'No tags yet.'}</p> : <TagList lang={lang} tags={tags} />}
</BaseLayout>
```

- [ ] **Step 3: 写 `src/pages/[lang]/tags/[tag].astro`**

```astro
---
import BaseLayout from '../../../../layouts/BaseLayout.astro';
import PostCard from '../../../../components/PostCard.astro';
import { getPosts } from '../../../../lib/posts';
import { SITE, type Lang } from '../../../../consts';

export async function getStaticPaths() {
  const paths = [];
  for (const lang of SITE.langs) {
    const posts = await getPosts(lang);
    const tags = [...new Set(posts.flatMap((p) => p.data.tags))];
    for (const tag of tags) {
      paths.push({
        params: { lang, tag },
        props: { posts: posts.filter((p) => p.data.tags.includes(tag)) },
      });
    }
  }
  return paths;
}

const lang = Astro.params.lang as Lang;
const tag = Astro.params.tag as string;
const { posts } = Astro.props;
---

<BaseLayout title={`${tag} · ${SITE.name}`} description={`${tag} 标签下的文章`} lang={lang}>
  <h1>{tag}</h1>
  {posts.map((post) => <PostCard post={post} />)}
  <p><a href={`${withBase(`${lang}/tags/`)}`}>{lang === 'zh' ? '全部标签' : 'All tags'}</a></p>
</BaseLayout>
```

补上 `import { withBase } from '../../../../lib/url';`

**注意**：中文标签会进 URL（例如 `/zh/tags/随笔/`）。这在静态构建下可用，Astro 会生成对应目录。若以后发现某些托管平台对非 ASCII 路径处理有问题，再改成对标签做 slug 映射 —— 但当前两个平台都支持，**先用最简单的方案**。

- [ ] **Step 4: 写 `src/pages/rss.xml.ts` 与 `rss-en.xml.ts`**

```ts
// src/pages/rss.xml.ts
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts } from '../lib/posts';
import { SITE } from '../consts';

export async function GET(context: APIContext) {
  const posts = await getPosts('zh');
  return rss({
    title: `${SITE.name} · 中文`,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/zh/posts/${post.id}/`,
    })),
    customData: '<language>zh-cn</language>',
  });
}
```

`rss-en.xml.ts` 同上，把 `'zh'` 换成 `'en'`、`/zh/posts/` 换成 `/en/posts/`、`<language>zh-cn</language>` 换成 `<language>en</language>`、标题换成 `${SITE.name} · English`。

- [ ] **Step 5: 写 `src/pages/404.astro` 与 `public/robots.txt`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { withBase } from '../lib/url';
---

<BaseLayout title="404 · yukki rui" description="页面不存在" lang="zh">
  <h1>404</h1>
  <p>这个页面不存在。<em>This page does not exist.</em></p>
  <p><a href={withBase('zh/')}>回中文首页</a> · <a href={withBase('en/')}>Back to English home</a></p>
</BaseLayout>
```

`public/robots.txt`：

```
User-agent: *
Allow: /

Sitemap: https://example.github.io/yukki-rui/sitemap-index.xml
```

`Sitemap` 那一行的地址**必须**在部署前改成真实地址（Task 9 Step 2 会检查这一点）。

- [ ] **Step 6: 验证标签页、RSS 与 404 都产出**

Run: `pnpm build`

Expected：

- `dist/zh/tags/index.html` 存在
- `dist/zh/tags/写作/index.html` 存在（跟随你的实际标签）
- `dist/rss.xml` 与 `dist/rss-en.xml` 存在
- `dist/404.html` 存在

然后手工检查 RSS 内容：

```powershell
Select-String -Path dist/rss.xml -Pattern "<item>|<language>|<link>" | Select-Object -First 10
```

Expected: 中文 RSS 里只有中文文章，条数与上一篇数一致，`<language>zh-cn</language>` 存在

- [ ] **Step 7: Commit**

```bash
git add src/pages/ src/components/TagList.astro public/robots.txt
git commit -m "feat: 标签页、404 页与分语言 RSS"
```

---

## Task 7: 链接自检工具（构建产物的可执行证据）

**Files:**
- Create: `scripts/check-links.mjs`
- Test: `tests/check-links.test.ts`

**Interfaces:**
- Produces: `extractRefs(html: string): string[]`、`resolveRef(ref: string, base: string, fileExists: (p: string) => boolean): 'ok' | 'missing' | 'external'`
- Produces: CLI —— `node scripts/check-links.mjs`，退出码 0 表示全部可达，1 表示发现死链

> 为什么要写这个而不是靠手点：站点一旦有几十篇文章，手点不现实。而「内链死链」正是 `base` 路径问题最爱表现的地方。

- [ ] **Step 1: 写解析器的单元测试**

`tests/check-links.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { extractRefs, resolveRef } from '../scripts/check-links.mjs';

describe('extractRefs', () => {
  it('抽出 a[href] 与 link[href]', () => {
    const html = '<a href="/zh/">首页</a><link rel="stylesheet" href="/_astro/x.css">';
    expect(extractRefs(html)).toEqual(['/zh/', '/_astro/x.css']);
  });

  it('忽略外部链接、mailto 与纯锚点', () => {
    const html = '<a href="https://x.com">x</a><a href="mailto:a@b.c">m</a><a href="#top">t</a>';
    expect(extractRefs(html)).toEqual([]);
  });

  it('抽出 img[src] 与 script[src]', () => {
    const html = '<img src="/og-default.png" alt=""><script src="/a.js"></script>';
    expect(extractRefs(html)).toEqual(['/og-default.png', '/a.js']);
  });
});

describe('resolveRef', () => {
  const exists = (p: string) => p === '/zh/index.html' || p === '/_astro/x.css';

  it('根部署下解析目录链接', () => {
    expect(resolveRef('/zh/', '/', exists)).toBe('ok');
  });

  it('子路径部署下先剥掉 base 前缀再解析', () => {
    expect(resolveRef('/yukki-rui/zh/', '/yukki-rui', exists)).toBe('ok');
  });

  it('缺失文件报 missing', () => {
    expect(resolveRef('/nope/', '/', exists)).toBe('missing');
  });

  it('外部链接不参与检查', () => {
    expect(resolveRef('https://example.com', '/', exists)).toBe('external');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test`
Expected: FAIL —— 找不到 `../scripts/check-links.mjs`

- [ ] **Step 3: 写 `scripts/check-links.mjs`**

```js
#!/usr/bin/env node
/**
 * 构建产物站内链接自检。
 *
 * 检查 dist/ 下每个 HTML 里引用的站内资源是否真实存在。
 * 外部链接不请求（避免离线环境误报、也不给别人添流量）。
 * 同时兼容根部署（base = '/'）与子路径部署（base = '/yukki-rui'）。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const REF_PATTERN = /(?:href|src)="([^"]+)"/g;

/** 抽出所有内部引用（去掉外部链接、mailto、纯锚点）。 */
export function extractRefs(html) {
  const refs = [];
  for (const match of html.matchAll(REF_PATTERN)) {
    const ref = match[1];
    if (/^(https?:)?\/\//.test(ref)) continue;
    if (ref.startsWith('#') || ref.startsWith('mailto:') || ref.startsWith('data:')) continue;
    refs.push(ref);
  }
  return refs;
}

/**
 * 判断一个引用是否可达。
 * base 是部署子路径（如 '/yukki-rui' 或 '/'），fileExists 接收「以 / 开头的站点根相对路径」。
 */
export function resolveRef(ref, base, fileExists) {
  if (/^(https?:)?\/\//.test(ref)) return 'external';
  if (ref.startsWith('#') || ref.startsWith('mailto:') || ref.startsWith('data:')) return 'external';
  if (!ref.startsWith('/')) return 'external'; // 相对链接先不检查，站点内不使用

  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  let path = ref;
  if (root && path.startsWith(root)) path = path.slice(root.length);
  if (!path.startsWith('/')) path = `/${path}`;

  if (path.endsWith('/')) return fileExists(`${path}index.html`) ? 'ok' : 'missing';
  if (fileExists(path)) return 'ok';
  return fileExists(`${path}/index.html`) ? 'ok' : 'missing';
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function main() {
  const dist = 'dist';
  if (!existsSync(dist)) {
    console.error('dist/ 不存在，先跑 pnpm build');
    process.exit(1);
  }

  const base = process.env.SITE_BASE ?? '/';
  const files = walk(dist);
  const relativeFiles = new Set(files.map((f) => relative(dist, f).replace(/\\/g, '/')));
  const fileExists = (p) => relativeFiles.has(p.replace(/^\//, ''));

  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const broken = [];
  let checked = 0;

  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    for (const ref of extractRefs(html)) {
      const result = resolveRef(ref, base, fileExists);
      if (result === 'external') continue;
      checked += 1;
      if (result === 'missing') {
        broken.push({ page: relative(dist, file).replace(/\\/g, '/'), ref });
      }
    }
  }

  console.log(`已扫描 ${htmlFiles.length} 个页面，检查 ${checked} 条站内链接（base = ${base}）`);
  if (broken.length > 0) {
    console.error(`\n发现 ${broken.length} 条死链：`);
    for (const item of broken) console.error(`  ${item.page} → ${item.ref}`);
    process.exit(1);
  }
  console.log('✓ 无死链');
}

// 仅在直接执行时跑 main，被 import 时不跑（这样单元测试才能导入纯函数）
if (process.argv[1] && process.argv[1].endsWith('check-links.mjs')) main();
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test`
Expected: PASS —— 新增 7 条，总计 22 条

- [ ] **Step 5: 在两种 base 下跑真实自检**

```powershell
$env:SITE_BASE="/"; pnpm build; node scripts/check-links.mjs
Remove-Item dist -Recurse -Force
$env:SITE_BASE="/yukki-rui"; pnpm build; node scripts/check-links.mjs
Remove-Item Env:\SITE_BASE
```

Expected: 两次都输出 `✓ 无死链`

- [ ] **Step 6: 故意制造一条死链，确认检查器真的会报警**

在 `src/pages/[lang]/about.astro` 里临时加 `<a href={withBase('nope/')}>坏链</a>`，Run: `pnpm build; node scripts/check-links.mjs`
Expected: 退出码 1，输出 `→ /nope/`

然后**删掉这一行**，重新构建并确认恢复 `✓ 无死链`。这一步不能跳过 —— 不验证失败路径的检查器等于没有检查器。

- [ ] **Step 7: Commit**

```bash
git add scripts/check-links.mjs tests/check-links.test.ts
git commit -m "test: 站内链接自检工具及其单测"
```

---

## Task 8: 验收验证（设计文档 §8 的六条）

**Files:**
- Modify: 无（只做验证，发现问题则回到对应任务修）
- Create: `docs/verification-report.md`

**Interfaces:**
- Consumes: 前七个任务的全部产物
- Produces: 一份带实际命令输出的验证报告

- [ ] **Step 1: 验证 §8.1 —— 构建成功且产物完整**

```powershell
$env:SITE_BASE="/"; pnpm build
Test-Path dist/index.html, dist/zh/index.html, dist/en/index.html, dist/rss.xml, dist/rss-en.xml, dist/404.html, dist/sitemap-index.xml
```

Expected: 全部 `True`

- [ ] **Step 2: 验证 §8.2 + §8.4 —— 本地预览与四项交互**

```powershell
pnpm preview
```

浏览器逐项确认并记录实际结果：

1. `/zh/` 与 `/en/` 都能渲染，文章列表条数正确（中文 3 篇、英文 1 篇）
2. 语言切换：在 `/zh/posts/hello-world/` 点切换 → 到 `/en/posts/hello-world/`；在 `/zh/posts/writing-in-markdown/`（无译文）点切换 → 到 `/en/`
3. 明暗切换：点击生效；**刷新后保持**；**首屏无闪烁**（把浏览器限速到 Slow 3G 更容易观察到）
4. 标签筛选：`/zh/tags/` 列出标签与计数，点击进入 `/zh/tags/<tag>/` 且只显示该标签文章

- [ ] **Step 3: 验证 §8.3 —— 无死链**

Run: `node scripts/check-links.mjs`
Expected: `✓ 无死链`

- [ ] **Step 4: 验证 §8.5 + §8.6 —— 双语配对与双 base**

```powershell
# 双语配对：读产物里的 hreflang，确认互指
Select-String -Path dist/zh/posts/hello-world/index.html -Pattern 'hreflang'
Select-String -Path dist/zh/posts/writing-in-markdown/index.html -Pattern 'hreflang'

# 双 base 构建
Remove-Item dist -Recurse -Force
$env:SITE_BASE="/yukki-rui"; pnpm build; node scripts/check-links.mjs
```

Expected：
- `hello-world` 中文页的 `hreflang="en"` 指向 `/en/posts/hello-world/`
- `writing-in-markdown` 中文页的 `hreflang="en"` 指向 `/en/`（降级）
- 子路径构建下 `✓ 无死链`

- [ ] **Step 5: 验证 §8.7 —— 草稿规则**

临时建 `src/content/posts/zz-draft-check.md`（`draft: true`），Run: `pnpm build`
Expected: `dist/zh/posts/zz-draft-check/` **不存在**；`Select-String dist/rss.xml "zz-draft-check"` 无结果。然后删除该文件。

- [ ] **Step 6: 验证性能预算（§6.1 的 JS 上限）**

```powershell
# 每个 HTML 里的 <script> 数量与大小
Get-ChildItem dist -Recurse -Filter *.html | ForEach-Object {
  $c = Get-Content $_.FullName -Raw
  $scripts = [regex]::Matches($c, '<script[^>]*>.*?</script>')
  $bytes = ($scripts | Measure-Object -Property Length -Sum).Sum
  [pscustomobject]@{ Page = $_.Name; Scripts = $scripts.Count; Bytes = $bytes }
} | Sort-Object Bytes -Descending | Select-Object -First 5
```

Expected: 文章页与列表页 `Bytes` 为 0 或只有主题脚本的几十字节；**不存在外部 `<script src>`**（除 giscus，而它是关闭的）。若某页出现几百字节以上的脚本，说明混进了客户端 JS，需要查清来源。

- [ ] **Step 7: 写 `docs/verification-report.md`**

把上面每一步的**实际命令与实际输出**粘进去，用表格列出「验收项 / 命令 / 实际结果 / 通过与否」。不要写「应该通过」—— 只写跑出来的东西。

- [ ] **Step 8: Commit**

```bash
git add docs/verification-report.md
git commit -m "docs: 验收验证报告"
```

---

## Task 9: 部署与交付

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `README.md`
- Modify: `src/consts.ts`（把 `SITE.url` 改成真实地址）
- Modify: `public/robots.txt`（sitemap 地址）

**Interfaces:**
- Consumes: 全部产物
- Produces: 可被用户照着执行的上线检查清单

- [ ] **Step 1: 写 `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - name: Build for GitHub Pages
        run: npm run build
        env:
          SITE_BASE: /yukki-rui
          SITE_URL: https://${{ github.repository_owner }}.github.io/yukki-rui
      - run: node scripts/check-links.mjs
        env:
          SITE_BASE: /yukki-rui
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Cloudflare Pages 单独处理**：在 Cloudflare 后台连接同一仓库即可，不需要写进这个工作流（它的构建环境自己会跑 `npm run build`，环境变量 `SITE_BASE=/` 在后台设）。这样两边互不干扰，任一平台失败不影响另一个。

`npm ci` 需要 `package-lock.json`。如果项目用 pnpm，把 `cache: npm` / `npm ci` 换成 `pnpm/action-setup` + `pnpm install --frozen-lockfile`，并提交 `pnpm-lock.yaml`。**不要**在没有 lock 文件的情况下用 `npm ci`，它会直接失败。

- [ ] **Step 2: 把两个占位地址改成真实地址**

`src/consts.ts`：`url: 'https://<你的用户名>.github.io/yukki-rui'`
`public/robots.txt`：同步改 `Sitemap:` 那一行
`astro.config.mjs`：`site` 的默认值同步改（或依赖 CI 传入的 `SITE_URL`）

改完 Run: `Select-String -Path src/consts.ts,public/robots.txt -Pattern "example"`，Expected: 无输出（占位符清零）

- [ ] **Step 3: 写 `README.md`（用户真正会用到的那份）**

必须包含四节：

1. **怎么加一篇文章** —— 复制 `src/content/posts/hello-world.md`，改 frontmatter 六个字段，提交。字段表逐一解释。
2. **本地怎么看效果** —— `npm install` / `npm run dev` / `npm run build` / `npm run test`
3. **怎么上线** —— 首次部署五步（建仓库 → 推送 → Pages 设 GitHub Actions → Cloudflare 连接仓库 → 填环境变量）
4. **上线检查清单** —— 逐条可勾选，含「两个地址都打开过」「RSS 能被解析」「换成手机宽度看过」

- [ ] **Step 4: 验证工作流语法**

Run: `node -e "const s=require('fs').readFileSync('.github/workflows/deploy.yml','utf8'); if(!s.includes('deploy-pages')) process.exit(1); console.log('workflow present, '+s.split('\n').length+' lines')"`
Expected: 打印行数、退出码 0

（能装 `actionlint` 的话更好；不能装就用上面这条最低限度检查，并在报告里说明这是最低限度检查。）

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml README.md src/consts.ts public/robots.txt astro.config.mjs
git commit -m "chore: 双平台部署工作流、README 与上线检查清单"
```

---

## 交付给用户本人的动作（AI 无法代劳）

计划执行完毕后，必须把这几件事明确交给用户，不要替他做、也不要假装做了：

1. `git config --global user.name/user.email`（本仓库已设本地值，换机器要重设）
2. 在 GitHub 建**空**仓库 `yukki-rui`（公开，不要勾选初始化 README）
3. `git remote add origin …` + `git push -u origin main`
4. 仓库 Settings → Pages → Source 选 **GitHub Actions**
5. Cloudflare 后台连接该仓库：构建命令 `npm run build`、输出目录 `dist`、环境变量 `SITE_BASE=/`
6. 把两个真实地址填回 `src/consts.ts` 与 `public/robots.txt`（如果 Step 2 时还不知道用户名）

---

## 风险与回滚

| 风险 | 应对 |
|---|---|
| 中文标签进 URL 后某些平台异常 | 已在 Task 6 Step 3 标注。真出问题时改标签 slug 映射，影响面局限在 `TagList` 与标签路由两处 |
| `[lang]/tags/[tag]` 与 `[lang]/posts/[...id]` 路由冲突 | 两者的静态段不同（`tags` vs `posts`），实测构建能同时产出。若报冲突，把标签路由改成静态段优先的写法或改用查询参数方案 |
| RSS 里 `site` 为占位地址 | Task 9 Step 2 明确要求清零占位符，并有 grep 验证 |
| `import.meta.env.PROD` 在 RSS 端点里行为不一致 | Task 8 Step 5 专门验证草稿不进 RSS |
| 前端视觉被 Kimi 改坏 | 组件 props 是冻结契约；数据层有 22 条单测兜底；`check-links` 兜底链接不破 |

**回滚方式**：所有工作都在本地 git 里，每个任务一次 commit。任一任务出问题就 `git revert <commit>`；整体推倒重来只需删除 `E:\deepseek\yukki-rui` 并重跑计划 —— 文章（`src/content/posts/`）是纯 Markdown，可在任何方案间平移。

---

## 交给协作者（Kimi）的交接边界

**执行本计划时请勿越界修改以下文件**，它们构成前端依赖的接口契约：

- `src/content.config.ts`（schema）
- `src/lib/post-select.ts`（纯函数数据层 + `PostData` 接口）
- `src/lib/posts.ts`（三个函数的签名）
- `src/lib/url.ts`（三个链接助手的签名）
- `src/consts.ts` 的导出名（值可以改，键名不能改）

**前端可以自由修改**：`src/styles/*`、全部 `src/components/*.astro` 的内部结构与样式、`src/layouts/*.astro` 的 DOM 结构、`src/pages/*` 的模板 —— 只要组件 props 保持设计文档 §7.2 的表不变。

若前端确实需要改某个 props 签名或数据层函数签名，**先改设计文档、再改数据层、最后改前端**，顺序不能倒。
