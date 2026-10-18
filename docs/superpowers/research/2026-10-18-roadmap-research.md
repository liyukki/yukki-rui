# 后续路线（P2/P3/P4）调研结论

> 2026-10-18 三个只读子代理的调研汇总。所有结论均基于当时仓库实测，动手前请复核版本与现状。

## P2-1 站内搜索：Pagefind

- 版本：`pagefind`（CLI 包装器）latest 1.5.2；UI 包 `@pagefind/component-ui`。装成 **devDependency**（构建期工具，浏览器端零 npm 依赖）。
- 命令：`npm i -D pagefind@1.5.2`；`npx pagefind --site dist` 产出 `dist/pagefind/`；`package.json` 的 `"build": "astro build && pagefind --site dist"`。`verify:frontend` 会调用 `npm run build`，索引自动生成。
- 双 base：`--site dist` 与 base 无关；资源路径用 `bundle-path={withBase('pagefind/')}`、结果链接用 `base-url={import.meta.env.BASE_URL}`，不要硬编码 `/pagefind/`。
- 中文：extended 二进制自带 CJK 分词，**不要** `--force-language`（会合并成单索引导致中英混排）。语言按页面 `<html lang>` 自动分索引（本站 zh → zh-CN、en → en）。
- 索引范围：`PostLayout.astro` 的 `<article>` 加 `data-pagefind-body`（否则首页/搜索页自身也会被索引）；`Comments` 外层加 `data-pagefind-ignore`。
- 组件骨架：`src/pages/[lang]/search.astro` 里 `<pagefind-config bundle-path base-url>` + `<pagefind-input>` + `<pagefind-summary>` + `<pagefind-results>`，内联脚本运行时注入 `link`/`module script`（`js.onerror` 显示降级提示），配 `<noscript>`。
- **关键坑**：`scripts/check-base-parity.mjs` 与 `scripts/check-content.mjs` 直接调 `astro build`（不走 `npm run build`），因此这两次构建不会生成 `dist/pagefind/`。若搜索页静态写死资源 `<link>`，`check:links` 会判死链、`npm run check:base` 失败 → 资源必须运行时注入（或让这两个脚本也跑 pagefind）。
- 门禁：`scripts/check-frontend.mjs` 的 required 数组加 `'pagefind/pagefind-entry.json'`。
- 体积/成本：前端资源 pagefind.js 45KB + component-ui.js 175KB + css 42KB + wasm 68KB（未压缩，平台会 br）；平台二进制解压 56MB，CI 首次多下；7 页索引约 0.3–1s。
- 工作量为半天（搜索页 ~40 行 + 文案 + NAV 入口 + check-frontend 一行 + 双 base 手验）。

## P3-1 访问统计：Cloudflare Web Analytics

- 推荐：Pages 控制台一键开启：Workers & Pages → yukki-rui → Metrics → Web Analytics → Enable。下次部署时 Cloudflare 自动注入 beacon，**只对 pages.dev 与绑定自定义域生效**，无需手贴脚本。
- 若要手贴：token 是 `site_token`（Web Analytics → Manage site 的 snippet 里），`data-cf-beacon='{"token":"..."}'`；API：`GET /accounts/{id}/rum/site_info/list`、`POST /accounts/{id}/rum/site_info`。
- GitHub Pages 镜像：边缘注入不生效，只能同 token 另建 site 手贴，或接受不统计（GoatCounter/Umami 需另贴脚本 + 多一个后台，不划算）。
- 验证：`curl.exe -s https://yukki-rui.pages.dev | Select-String cloudflareinsights`，或 DevTools 看 `beacon.min.js`；控制台几分钟出数。
- 前置：需浏览器登录 Cloudflare 控制台（本机 wrangler OAuth 不能代替）。

## P3-2 新评论通知 / 草稿提醒：GitHub Actions

- 推荐方案 A（GitHub Issue）：每 15 分钟调 `GET /api/comments-admin?limit=50`，用 `createdAt` 筛最近 20 分钟（ISO 字符串直接比，免存状态），把新评论写进固定 Issue 的评论并 `@自己`+assignee。前置：`COMMENTS_ADMIN_TOKEN` 存 Actions Secrets、`permissions: issues: write`；约 40 行 YAML + `gh`。
- 手机推送刚需：同一 job 加一条 ntfy `curl -d`（免注册，topic 名即密钥，用 32 位随机串，正文截断）。
- 邮件：Resend 免费 3000 封/月（100/天），不验域名只能 `onboarding@resend.dev` 发到本人邮箱；Gmail SMTP 需应用专用密码；Email Routing 要自有域名。
- 草稿提醒可并入同一 workflow：两个 `on.schedule.cron`，job 内用 `if: github.event.schedule == '0 1 * * 1'` 区分；`grep -l '^draft: true' src/content/posts/*.md`。
- 风险：公共仓 Issue 会公开评论者昵称/正文（需截断或改用 ntfy）；管理令牌泄露可删评论；公共仓 60 天无活动 cron 自动停用。

## P4-1 每篇独立 OG 图：satori + resvg（构建期生成）

- 现状：`src/consts.ts:121` `OG_IMAGE = '/og-default.png'`（`public/og-default.png` 1200×630）；`src/components/BaseHead.astro:22` 默认取 OG_IMAGE、第 27 行 `absoluteHref(withBase(ogImage))`；`src/layouts/PostLayout.astro` 传 `ogType="article"` 但**从不传 ogImage** → 全站共用一张图。唯一断点是 PostLayout。
- 推荐方案 A（构建期静态生成）：`npm i -D satori@0.62.0 @resvg/resvg-js@2.6.2`；新增 `src/pages/og/[...slug].png.ts`（`getStaticPaths` 遍历 posts，satori 出 1200×630 SVG → `new Resvg(svg).render().asPng()`）；`PostLayout.astro` 加 `ogImage={post.data.cover ?? \`/og/${post.id}.png\`}`。
- 否决其它方案：Playwright 截图（CI `npm ci` 装不到 playwright）；GitHub Pages 无 Functions 的运行时生成会 404；现有文章没有封面图。
- 字体是主要成本/风险：satori 不支持 woff2，仓库现在 0 个字体文件 → 需新增 CJK 字体（全量 Noto Sans SC ~10MB；pyftsubset 子集有缺字风险）。
- lockfile 必须含 `@resvg/resvg-linux-x64-gnu`（CI 是 linux），本机 `npm install` 后提交 package-lock.json。
- 回归保护：`scripts/check-frontend.mjs:5` 要求 `dist/og-default.png` 存在；`scripts/check-links.mjs:82-84` 把 og:image 当站内必存在引用，生成路由漏产会卡发布。

## P4-2 结构化数据 JSON-LD

- 新增 `src/components/JsonLd.astro`：`const json = JSON.stringify(data).replace(/</g, '\\u003c')`，`<script type="application/ld+json" is:inline set:html={json} />`（`set:html` 不转义，必须手动把 `<` 变 `\u003c` 防 `</script>` 注入）。
- 文章页 BlogPosting 字段：headline、description、datePublished=pubDate、dateModified=(updatedDate ?? pubDate)、inLanguage（zh-CN/en）、keywords=tags.join(',')、mainEntityOfPage=canonical、image=OG 绝对地址、author+publisher。
- 首页 WebSite（name/url/inLanguage/description）；BreadcrumbList 不做（只有一层，收益低）。
- 验证：schema.org validator 与 Google Rich Results Test（BlogPosting 不出富结果卡片，只看语法与字段）。
