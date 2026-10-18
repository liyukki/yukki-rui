# P2 搜索与归档：设计文档

> 2026-10-18。属于站长批准的 A/B/C/D 四组改进中的 **B 组（搜索与归档）**。上游调研见
> `docs/superpowers/research/2026-10-18-roadmap-research.md` 的「P2-1 站内搜索」一节。

## 目标

1. **站内搜索**：读者在站内能搜文章标题与正文，中英双语都能用，结果可直接点开。
2. **归档页**：按年份列出全部文章（带数量），比标签页更适合「想翻旧文」的读者。
3. 两件事都保持「零服务器、零第三方账号、构建期产物」的既有边界。

## 方案

### 搜索：Pagefind（构建期索引）

- 依赖：`pagefind` 只装成 **devDependency**（构建期工具），浏览器端零 npm 依赖。
- 流程：`npm run build` = `astro build && pagefind --site dist`；索引产物 `dist/pagefind/`。
- 页面：`src/pages/[lang]/search.astro`（中英各一份，`/zh/search/`、`/en/search/`）。
  用 Pagefind **classic UI**（`pagefind-ui.js` + `pagefind-ui.css`），运行时注入脚本与样式：
  - 静态 HTML 里不写死 `<link href="/pagefind/...">`，因为 `check:base` / `check:content`
    直接调用 `astro build` 不产索引，写死会被 `check:links` 判成死链。
  - 注入地址用 `withBase('pagefind/')`，两种部署路径（`/` 与 `/yukki-rui/`）都正确。
  - 加载失败时页面显示降级说明（不白屏）。
- 双语：Pagefind 按页面 `<html lang>` 自动分索引（实测 Indexed 2 languages），
  `PagefindUI` 的文案按当前语言传 `translations`；**不**传 `--force-language`（会让中英混排）。
- 索引范围：`PostLayout.astro` 的 `<article>` 加 `data-pagefind-body`（只索引文章正文），
  评论区容器加 `data-pagefind-ignore`；这样首页、搜索页自身不会被索引。

### 归档：构建期静态页

- 页面：`src/pages/[lang]/archive.astro`，`getPosts(lang)` 按年份分组（`pubDate` 年份倒序），
  每组内按发布日期倒序；每条显示日期、标题，链接到文章；显示每年篇数与总数。
- 纯静态，无新增依赖。

### 导航与文案

- Header 导航新增「搜索」「归档」两个入口（中英）。
- `src/consts.ts` 的 `UI.zh` / `UI.en` 增加 `search`、`archive`、搜索页文案（占位符、空结果、
  加载失败、结果计数），全部走常量，不散写。
- 搜索页与归档页都用 `BaseLayout`，标题与 description 走同一套 SEO 组件。

## 门禁与测试

| 项 | 内容 |
|---|---|
| 单测 | `tests/search.test.ts`：归档分组纯函数（`groupPostsByYear`）+ 搜索页文案键存在性 |
| 构建门槛 | `scripts/check-frontend.mjs` 的 required 数组加 `pagefind/pagefind-entry.json` |
| 端到端 | `scripts/check-search.mjs`（`npm run check:search`）：起本地静态服务跑 `dist/`，验证搜索页加载、输入关键词出结果、点结果能到文章、归档页年份分组与数量、无脚本异常 |
| 双路径 | `npm run check:base` 必须仍然通过（搜索页资源运行时注入，直接 build 不产索引也不报错） |
| 线上 | `check:search` 支持 `LIVE_ORIGIN`/`LIVE_BASE`，两个平台各跑一遍 |

## 风险与对策

| 风险 | 对策 |
|---|---|
| CI 里 `pagefind` 二进制不在 lockfile（linux/x64） | `npm i -D pagefind` 会写入全部平台 optionalDependencies，提交 `package-lock.json`；CI 用 `npm ci` 实测 |
| 直接 `astro build` 的产物没有索引 → 死链 | 资源一律运行时注入；`check:base`/`check:content` 保持直调 `astro build` |
| 中文分词 | Pagefind extended 自带 CJK；不指定 `force-language`，语言按 `<html lang>` 分 |
| 索引体积 | 当前 23 页索引 < 1 MB；平台压缩后更小，可接受 |

## 不做

- 不做站内搜索的实时搜索框（Header 里加输入框、弹出层）——先给独立搜索页，等站长用了再决定。
- 不做分页/无限滚动归档（文章量小，一年一组的列表足够）。
- 不引入第三方搜索服务（Algolia 等）或 Cloudflare Workers 搜索接口。
