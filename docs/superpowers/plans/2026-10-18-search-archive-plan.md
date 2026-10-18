# P2 搜索与归档：实现计划

> 设计见 `docs/superpowers/specs/2026-10-18-search-archive-design.md`。
>
> **状态（2026-10-18）**：Task 1–4 已完成并通过门禁（`check:search` 本地 19/19）；Task 5 进行中（文档已改，待提交与线上验收）。

## 全局约束

- 零运行时依赖；唯一新增 devDependency：`pagefind@1.5.2`（构建期索引）。
- 所有站内地址用 `withBase` / `postHref` 等既有助手，不硬编码，必须同时通过 `check:base` 两种 base。
- 文案进 `src/consts.ts` 的 `UI.zh` / `UI.en`，组件不写死中文。
- 不内联事件处理器；客户端脚本用 module + 运行时注入。
- 门禁：`npm run verify:frontend`、`npm run check:search`（需 `CMS_OAUTH_CHROME` 指向 Playwright 内核）。

## Task 1：归档分组纯函数 + 单测

- 新增 `src/lib/archive.ts`：`groupPostsByYear(posts: readonly Post[]): Array<{ year: number; posts: Post[] }>`，
  按 `pubDate` 年份倒序分组、组内按发布日期倒序；`Post` 类型复用 `src/lib/posts.ts`。
- 新增 `tests/archive.test.ts`：跨年、同年、空数组、日期排序。
- 验收：`npx vitest run` 新测试通过。

## Task 2：搜索页与归档页

- 新增 `src/pages/[lang]/search.astro`：
  - `getStaticPaths` 两种语言；`<BaseLayout>`；标题/描述走 UI 文案。
  - 正文：`<div id="search" data-bundle={withBase('pagefind/')} data-lang={lang} data-i18n={JSON.stringify(i18n)}>` + `<noscript>` 提示。
  - 内联脚本：注入 `<link rel="stylesheet" href={bundle+'pagefind-ui.css'}>` 与 `<script src={bundle+'pagefind-ui.js'}>`，
    加载成功后 `new PagefindUI({ element: '#search', bundlePath: bundle, showSubResults: true, showImages: false, translations })`；
    `script.onerror` 与初始化异常都显示降级文案。
- 新增 `src/pages/[lang]/archive.astro`：用 `groupPostsByYear` 渲染年份分组列表（日期 + 标题链接，年篇数）。
- `src/consts.ts`：新增 `search` / `archive` 导航键与搜索页文案（占位符、无结果、加载失败、结果计数）。
- Header 导航加两个入口。

## Task 3：索引范围与构建接线

- `src/layouts/PostLayout.astro` 的 `<article>` 加 `data-pagefind-body`；`src/components/Comments.astro` 根节点加 `data-pagefind-ignore`。
- `package.json`：`"build": "astro build && pagefind --site dist"`。
- `scripts/check-frontend.mjs`：required 加 `pagefind/pagefind-entry.json`。
- 验收：`npm run build` 后 `dist/pagefind/pagefind-entry.json` 存在；`npm run check:base`、`npm run check:content` 仍通过（直接 astro build 不产索引也不报错）。

## Task 4：端到端自检

- 新增 `scripts/check-search.mjs`（`npm run check:search`）：
  - 起本地静态服务跑 `dist`（端口 4461），支持 `LIVE_ORIGIN`/`LIVE_BASE`。
  - 断言：搜索页 UI 加载；输入「写作」出结果（≥1）；结果链接可点且指向文章页；
    无结果关键词显示空状态；归档页年份分组与篇数正确；中英两份页面都能打开；无脚本异常。
- 验收：本地 14+ 项通过；线上两个平台各跑一遍。

## Task 5：文档与上线

- README：命令表加 `check:search`；功能介绍加搜索/归档；`## 站内搜索` 小节说明索引怎么生成。
- `docs/usage-guide.md`：新增「搜索与归档」章节（怎么用、索引在哪、为什么本地 `npm run dev` 搜不到）。
- `docs/verification-report.md`：新增 P2 章节（设计、改动、门禁、线上验收）。
- 门禁全绿 → 提交 → 推送 → 等两平台部署 → 线上 `check:search` 各跑一遍 → 汇报。
