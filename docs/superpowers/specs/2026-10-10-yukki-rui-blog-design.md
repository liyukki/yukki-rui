# yukki rui 个人博客 —— 设计文档

| 项目 | 值 |
|---|---|
| 站名 | yukki rui |
| 仓库名 | `yukki-rui` |
| 目标地址 | GitHub Pages：`https://<用户名>.github.io/yukki-rui/`；Cloudflare Pages：`https://yukki-rui.pages.dev/` |
| 文档版本 | v1，2026-10-10 |
| 状态 | 待用户确认 |
| 前端实现 | 由用户的另一位协作者（Kimi）负责，契约见 §7 |

---

## 1. 目标与约束

**要什么**

1. 一个个人博客：文章用 Markdown 写，写作流程简单到「新建一个 `.md` 文件 → 提交 → 自动上线」。
2. 中英双语。中文为默认语言，英文为镜像。
3. 受众同时包含中国大陆和海外的读者。
4. 长期可维护：换主题、换框架、换托管平台时，**文章一个字都不用改**。

**硬约束**

| 约束 | 影响 |
|---|---|
| 不购买服务器 | 必须纯静态输出，零常驻进程 |
| 不购买域名 | 只用平台赠送的二级域名 |
| 两者都不买 → 不能 ICP 备案 | 不能使用国内平台的「自有域名 + 国内节点」组合；二级域名不受影响 |
| 预算 0 元 | 所有依赖必须是免费且无到期陷阱的 |

**非目标（本期明确不做）**

全文搜索、点赞、评论（仅预留占位）、邮件订阅、访问统计（可选、默认关）、多作者、后台管理界面、登录、任何需要数据库的功能。

> 这些不是"以后再说"，而是"没有真实需求前都是负债"：每一项要么引入费用，要么引入必须长期维护的外部服务，与「不买服务器」的初衷冲突。

---

## 2. 技术选型

**Astro 5.x（`output: 'static'`）+ npm。**

选它的决定性理由不是流行度，而是**内容层与展示层分离**：

- 文章是 `src/content/posts/*.md`，语言由 frontmatter 的 `lang` 字段决定，与目录结构、路由、样式完全解耦。
- Astro Content Collections 在构建时用 Zod schema 校验 frontmatter —— frontmatter 写错会导致构建失败并给出精确报错，而不是静默生成一个坏页面。
- 输出纯静态 HTML，**默认零 JavaScript**，无 JS 也能完整阅读。这对大陆网络环境下首屏速度影响很大。
- 与原生的 `@astrojs/sitemap`、`@astrojs/rss`、`@astrojs/mdx` 集成，不需要自己造轮子。

**被否掉的方案**

| 方案 | 否掉原因 |
|---|---|
| Hugo | 模板语言（Go template）学习成本高，改样式比改内容还费劲 |
| VitePress | 本质是文档站，做博客要跟它的默认假设（侧边栏、大纲）反复对抗 |
| Next.js | 对静态博客是过度设计，产出大量用不上的 JS |
| 手写 HTML | 每加一篇文章都要碰模板，半年后必然放弃维护 |

**样式方案：手写 CSS + 自定义属性（CSS Custom Properties），不用 UI 框架。**

理由：零依赖，十年后还能跑；且样式层完全交给前端协作者自由发挥，不引入任何需要学习的框架约束。深色模式通过 `<html data-theme="dark">` 切换，配合自定义属性实现，不需要 JS 重绘。

---

## 3. 部署策略

**一份代码，同时部署到两个平台。**

这是唯一诚实的方案：没有任何一个免费平台能同时保证大陆和海外都流畅。但静态站是与托管方无关的，同一份构建产物可以推送两处。

| 平台 | 地址 | 定位 |
|---|---|---|
| GitHub Pages | `<用户名>.github.io/yukki-rui/` | 主力，海外访问 + 与 Git 工作流一体 |
| Cloudflare Pages | `yukki-rui.pages.dev` | 大陆相对可访问的镜像；带宽不计量 |

两个地址**都是平台赠送的二级域名，都不需要备案**。

**技术要点：`base` 路径差异**

GitHub Pages 部署在子路径下（`/yukki-rui/`），Cloudflare Pages 部署在根路径（`/`）。同一份源码要同时适配两者，用环境变量解决，不维护两个分支：

- `SITE_BASE` 环境变量，默认 `/`（Cloudflare 构建时使用），GitHub Actions 里设为 `/yukki-rui`。
- `astro.config.mjs` 读取该变量写入 `base`。
- 所有站内链接必须经过 `src/consts.ts` 里的 `withBase(path)` 助手函数，禁止硬编码绝对路径 —— 这是最容易出现「本地好、线上 404」的地方。

---

## 4. 信息架构与路由

```
/                        语言落地页：读浏览器语言 → 跳 /zh/ 或 /en/；禁用 JS 时默认显示中文入口
/zh/                     中文首页：按年份倒序的文章列表
/zh/posts/<slug>/        中文文章页
/zh/about/               中文「关于我」
/zh/tags/                中文标签总览
/zh/tags/<tag>/          中文标签归档
/en/  /en/posts/<slug>/  /en/about/  /en/tags/...   英文镜像
/rss.xml                 中文 RSS
/rss-en.xml              英文 RSS
/sitemap-index.xml       自动生成，含 hreflang 互指
/404.astro               找不到页面
```

**slug 规则**：`<slug>` 取 Markdown 文件名（不含扩展名）。中文文章建议用英文文件名（如 `hello-world.md`），URL 更干净。

**语言落地页**采用「静态落地页 + 极小内联脚本」的方案：

```html
<!-- 伪代码，前端实现时用 -->
<script>
  // 只做一件事：读 navigator.language，命中 /^zh/ 去 /zh/，否则去 /en/
  // 只在 location.pathname === '/' 时执行，避免任何跳转循环
</script>
```

不跳转到 `/zh/` 的原因是：直接 302 或 meta refresh 会让搜索引擎和禁用 JS 的读者都拿到不确定的结果。落地页必须本身就有内容（站名 + 两个入口链接），JS 只是加速。

---

## 5. 数据模型

### 5.1 文章 frontmatter schema（唯一契约）

位置：`src/content.config.ts`。所有字段以此为准，构建时强制校验。

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title:       z.string(),                       // 必填，文章标题
    description: z.string().max(160),              // 必填，摘要；用于列表页、meta description、RSS（写进 frontmatter 时建议加引号，避免 YAML 把冒号解析成键值分隔）
    pubDate:     z.coerce.date(),                  // 必填，发布日期
    lang:        z.enum(['zh', 'en']),             // 必填，决定归属哪个语言站点
    tags:        z.array(z.string()).default([]),  // 可选，标签
    updatedDate: z.coerce.date().optional(),       // 可选，更新日期
    draft:       z.boolean().default(false),       // true 时不出现在任何列表和 RSS
    translationKey: z.string().optional(),         // 同一篇文章的不同语言版本共用此值 → 语言切换跳转
  }),
});

export const collections = { posts };
```

### 5.2 内容筛选与排序规则（数据层契约）

放在 `src/lib/posts.ts`，前端只调用、不重复实现：

| 函数 | 行为 |
|---|---|
| `getPosts(lang)` | 该语言的全部**已发布**文章（`draft !== true`），按 `pubDate` 倒序 |
| `getTags(lang)` | 该语言的标签及各自文章数，按数量倒序 |
| `getTranslations(post)` | 通过 `translationKey` 找到其他语言版本的同一篇文章；找不到则返回空 |

文章文件放在扁平的 `src/content/posts/` 下，**不按语言分目录** —— 语言由 frontmatter 决定。想找一篇文章时，按 slug 全目录搜一次就能定位，比记住它属于哪个语言目录更省心。

**草稿规则**：`draft: true` 的文章在 `npm run dev` 下可预览（便于写作），在 `npm run build` 下完全不产出页面、不出现在列表和 RSS。这是生产环境的硬规则，必须在数据层用 `import.meta.env.PROD` 落实（Astro 的原生 `draft` 字段只过滤列表、仍会生成页面，因此这里用自定义字段自行过滤）。由于 `getStaticPaths` 与数据层共用同一个 `getPosts()`，规则只需实现一次即可覆盖列表页、文章页和 RSS 三处。

**双语文章配对规则**：中英两个版本的 `translationKey` 相同即视为同一篇。语言切换按钮在文章页跳转到对应译文；若译文不存在，则跳转该语言的首页。**不要求每篇文章都有译文** —— 缺译文是正常状态，不是错误。

---

## 6. 质量要求

### 6.1 性能预算

| 项 | 上限 |
|---|---|
| 每个页面自身 JavaScript | 0 字节（语言落地页的内联脚本除外，须 < 500 字节） |
| CSS 总量 | < 50 KB（未压缩），单文件，无 Web Font 阻塞 |
| 字体 | 只用系统字体栈，不加载外部字体文件 |
| 第三方请求 | 0（除 Cloudflare Web Analytics，默认关闭） |
| 图片 | 必须显式声明宽高，禁止布局跳动（CLS） |

### 6.2 无障碍与可用性

- 所有功能可键盘操作，焦点态可见（不许 `outline: none` 了事）。
- 正文与背景对比度 ≥ 4.5:1，深浅两套主题都要满足。
- 尊重 `prefers-reduced-motion`。
- `<html lang>` 与实际内容语言一致（`zh-CN` / `en`）。
- 明暗切换需在首屏渲染前用内联脚本读 `localStorage` 落定 `data-theme`，避免闪烁。

### 6.3 SEO

- 每页唯一的 `<title>` 与 `<meta name="description">`。
- Open Graph + Twitter Card，`og:image` 缺省时回落到站点默认图。
- 中英互指：`<link rel="alternate" hreflang="zh-CN" href="...">`、`hreflang="en"`、`hreflang="x-default"`（指向 `/`）。
- `sitemap-index.xml` 自动生成（`@astrojs/sitemap`）。
- 文章页输出 JSON-LD `BlogPosting` 结构化数据。

---

## 7. 前端实现契约（交给 Kimi 的部分）

> 本节是给前端协作者的接口说明。请勿修改 §5 的 schema 与数据层函数签名 —— 那是全站的数据契约；除此以外，视觉、布局、动效、组件内部结构**完全自由**。

### 7.1 目录结构

```
yukki-rui/
├─ astro.config.mjs              平台配置（base 路径、sitemap、mdx）
├─ src/
│  ├─ consts.ts                  站名、URL、导航项、withBase()
│  ├─ content.config.ts          ← 数据契约，勿改
│  ├─ lib/posts.ts               ← 数据层函数，勿改签名
│  ├─ styles/
│  │  ├─ tokens.css              设计令牌：颜色/字号/间距/圆角/阴影
│  │  └─ global.css              全局基础样式
│  ├─ layouts/
│  │  ├─ BaseLayout.astro        套所有页面的骨架
│  │  └─ PostLayout.astro        文章页骨架，供中英文共用
│  ├─ components/
│  │  ├─ BaseHead.astro          所有 meta/OG/hreflang/JSON-LD
│  │  ├─ Header.astro            站名 + 导航 + 语言切换 + 主题切换
│  │  ├─ Footer.astro            版权 + RSS 入口
│  │  ├─ PostCard.astro          列表里的单篇文章条目
│  │  ├─ TagList.astro           标签渲染（总览页与文章页共用）
│  │  ├─ LangSwitch.astro        语言切换按钮
│  │  ├─ ThemeToggle.astro       明暗切换按钮
│  │  └─ Comments.astro          评论区占位（见 7.3）
│  └─ pages/
│     ├─ index.astro             语言落地页
│     ├─ 404.astro
│     ├─ [lang]/index.astro
│     ├─ [lang]/about.astro
│     ├─ [lang]/posts/[...slug].astro
│     ├─ [lang]/tags/index.astro
│     ├─ [lang]/tags/[tag].astro
│     ├─ rss.xml.ts
│     └─ rss-en.xml.ts
├─ public/                       静态资源（favicon、默认 OG 图）
└─ .github/workflows/deploy.yml  推送到两个平台的 CI
```

### 7.2 组件接口

每个组件只做一件事。props 类型必须显式声明（`interface Props`），不接受的 props 不要加。

| 组件 | 输入 | 职责 |
|---|---|---|
| `BaseHead` | `title` `description` `lang` `ogType` `ogImage?` `alternate?` | 输出全部 `<head>` 内容。**所有 meta 只在这里出现一次**，页面不自己写 meta |
| `BaseLayout` | `title` `description` `lang` | html/body 骨架、引入 tokens.css + global.css、主题脚本、Header、Footer |
| `Header` | `lang` | 站名链接到 `/{lang}/`，导航到首页与关于，右侧放 `LangSwitch` + `ThemeToggle` |
| `PostCard` | `post`（集合条目，含 `slug` `data`） | 一篇文章的列表条目：标题、日期、摘要、标签 |
| `PostLayout` | `post` `translations` | 文章页骨架：标题、日期、正文 slot、标签、`LangSwitch`、`Comments` |
| `TagList` | `tags` `lang` | 标签渲染；带 `count` 时显示计数 |
| `LangSwitch` | `lang` `alternateUrl?` | 有译文跳译文，无译文跳目标语言首页 |
| `ThemeToggle` | 无 | 切换 `<html data-theme>`，写 `localStorage`，带可读的 `aria-label` |
| `Comments` | 无 | 见 7.3 |

**`lang` 参数的取值只有 `'zh'` 和 `'en'`**，`[lang]/` 动态路由需在 `getStaticPaths` 里限定这两个值，否则会为不存在的语言生成页面。

### 7.3 评论区占位

`Comments.astro` 从 `src/consts.ts` 读取：

```ts
export const COMMENTS = {
  enabled: false,
  provider: 'giscus' as const,
  repo: '',        // 例：'<用户名>/yukki-rui'
  repoId: '',
  category: 'Announcements',
  categoryId: '',
};
```

- `enabled === false`（当前状态）→ 组件渲染 `null`，**在 DOM 里不留任何痕迹**，不产生任何第三方请求。
- `enabled === true` → 渲染 giscus 脚本。实现时保留这条分支即可，不用现在调试它。

### 7.4 设计自由度

前端可以自由决定：配色、字体栈、间距节奏、卡片样式、动效、深浅色具体色值、响应式断点、标签的视觉形态。

前端需要遵守：§6 的全部质量要求、只通过 `src/styles/tokens.css` 定义颜色与尺寸（不在组件里写魔法色值）、所有站内链接走 `withBase()`。

### 7.5 本地开发命令

```bash
npm install
npm run dev      # 本地预览，默认 http://localhost:4321/zh/
npm run build    # 产出 dist/
npm run preview  # 用生产产物起本地服务
```

---

## 8. 验收标准

上线前必须逐条验证，每条都要有实际执行证据，不接受「应该没问题」：

1. `npm run build` 成功，`dist/` 产出完整。
2. 本地预览可达，实际点开 `/zh/`、`/en/`、一篇文章页、标签页、`/`，五个页面均正常渲染。
3. 站内链接自检：扫描 `dist/` 中全部页面，无死链、无 404。
4. 四项交互实测通过：语言切换、明暗切换（含刷新后保持、无首屏闪烁）、标签筛选、RSS 输出可被解析。
5. 双语配对规则验证：造一对 `translationKey` 相同的文章，确认互跳成功；再造一篇无译文的，确认降级到首页。
6. `base` 路径双重验证：分别用 `SITE_BASE=/` 和 `SITE_BASE=/yukki-rui` 构建，产物内链均正确。
7. 草稿规则验证：`draft: true` 的文章在 `build` 产物中不存在。

---

## 9. 需要用户本人操作的事项

以下步骤 AI 无法代劳（需要账号授权或人工点击），需用户照做：

1. **配置 Git 提交身份**（本仓库已设好本地配置，若换机器需重设）：
   ```bash
   git config --global user.name "你的名字"
   git config --global user.email "你的邮箱"
   ```
2. **在 GitHub 创建空仓库** `yukki-rui`（公开），**不要**勾选初始化 README。
3. **推送代码**，并在仓库 Settings → Pages → Source 选择 **GitHub Actions**。
4. **Cloudflare Pages**：登录 → Workers & Pages → Create → Pages → 连接该 GitHub 仓库。构建命令 `npm run build`，输出目录 `dist`，环境变量 `SITE_BASE=/`。
5. （可选，以后想开评论时）安装 giscus App，把两个 ID 填进 `src/consts.ts`。

---

## 10. 已知风险

| 风险 | 说明与对策 |
|---|---|
| 大陆访问 GitHub Pages 不稳定 | 这正是同时部署 Cloudflare Pages 的原因；两个地址都写在「关于」页里 |
| Cloudflare 在大陆也可能受限 | 免费方案下无解，属于接受范围内的风险；不做备案的前提下没有更好的选择 |
| 免费额度政策变动 | 两个平台互为主备，任一平台变故时另一处仍在线；源码在本地和 GitHub，随时可迁移 |
| Node 24 与 Astro 版本的兼容性 | 实施第一步就验证 `npm run build` 能否通过；若报兼容错误，降到 Node 22 LTS 或调整 Astro 版本 |
| `translationKey` 手写易错 | 只在需要互跳的文章上写；漏写或写错的后果仅是语言切换降级到首页，不是页面报错 |

---

## 11. 待确认 / 未决事项

- [ ] Cloudflare Web Analytics 是否启用（免费、无 cookie、一行脚本；默认**不启用**）
- [ ] 站点默认 OG 图 —— 需要一张 1200×630 的图，可后补
- [ ] 是否需要自定义 404 页面的文案风格

---

## 附：实施顺序（供规划阶段使用）

1. 脚手架与配置：Astro 初始化、`consts.ts`、`content.config.ts`、`withBase()`、两种 `SITE_BASE` 构建验证
2. 数据层：`lib/posts.ts` 三个函数 + 单元验证
3. 内容：中文示例文章 ×2、英文示例文章 ×1、一对双语配对文章
4. 展示层骨架：`BaseHead` → `BaseLayout` → `Header`/`Footer` → 首页与文章页
5. 交互与增强：语言切换、主题切换、标签页、RSS、sitemap、404
6. 质量收口：性能预算检查、链接自检、无障碍抽查
7. 部署：GitHub Actions 双平台工作流 + 上线检查清单交付
