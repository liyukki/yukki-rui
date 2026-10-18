# yukki rui

免费托管的中英双语个人网站，文章用 Markdown 管理，Astro 7 在构建时输出静态 HTML，不需要购买服务器或域名。

**当前阶段：已上线。** 两个地址都在跑，网页后台可用（浏览器登录后直接改文章和个人资料，不碰代码）。后台是 [Sveltia CMS](https://sveltiacms.app/) + 项目里的 Cloudflare Functions（`functions/api/`）换登录令牌。

文章页有**免登录评论区**：读者填昵称即可留言，数据存在 Cloudflare D1，站长在 <https://yukki-rui.pages.dev/admin/comments/> 删除；配置与使用见 [使用说明第 11 节](docs/usage-guide.md)。

文章页还有**阅读小工具**：自动目录、阅读时长、顶部阅读进度、代码块一键复制、图片放大、上一篇/下一篇（见[使用说明第 12 节](docs/usage-guide.md)）。

| 平台 | 地址 | 说明 |
|---|---|---|
| GitHub Pages | <https://liyukki.github.io/yukki-rui/> | 展示用；纯静态，没有登录函数 |
| Cloudflare Pages | <https://yukki-rui.pages.dev/> | 展示 + **后台登录**（`/admin/`）|

两个平台都连着同一个 GitHub 仓库：**推送即自动构建部署**。后台保存内容 = 往仓库提交 commit，两个平台随后各自重新部署。

日常操作看 [网站使用说明](docs/usage-guide.md)；历次审核与实测记录见 [验证报告](docs/verification-report.md)。

## 本地使用

要求 Node >= 22.12.0，推荐 Node 24；使用 npm 和已提交的 `package-lock.json`。

```bash
npm ci
npm run dev
```

打开 `http://localhost:4321/zh/`。本地默认地址只用于预览；正式部署通过环境变量配置公开地址。

| 命令 | 验证内容 |
|---|---|
| `npm run check` | Astro 与 TypeScript 类型检查 |
| `npm test` | 数据规则、配置及检查器回归测试 |
| `npm run build` | 构建到 `dist/` |
| `npm run check:links` | 检查当前 dist 全部 HTML、RSS、sitemap、robots 的站内引用 |
| `npm run check:base` | 两种部署路径下分别构建，并检查全部真实页面与引用 |
| `npm run check:content` | 真实构建验证 Markdown、草稿页面、草稿译文和 RSS |
| `npm run check:frontend` | 前端必需路由、404、分享图等发布门槛 |
| `npm run check:cms-config` | 可选：用真实 Sveltia 客户端加载 `public/admin/` 的真实配置，检查配置错误与登录入口（需 playwright；不参与发布检查）|
| `npm run check:cms-oauth` | 可选：用真实 Sveltia 客户端在本地跑一遍后台登录握手（需 playwright；不参与发布检查）|
| `npm run check:comments` | 可选：用 wrangler 本地 Pages 运行时 + 真实 D1 模拟跑评论区端到端（发评论/XSS/限流/管理删除/CORS；需 playwright 与先 `npm run build`；不参与发布检查）|
| `npm run check:comments-live` | 可选：对线上两个站点做评论区只读检查（渲染、接口、CORS、管理页；加 `-- --write` 且设 `COMMENTS_ADMIN_TOKEN` 时再跑一次发→查→删闭环）|
| `npm run check:reading` | 可选：阅读体验端到端检查（本地跑 `dist/`；设 `LIVE_ORIGIN`/`LIVE_BASE` 可对线上部署跑），覆盖目录、阅读时长、上下篇、进度条、返回顶部、代码复制、灯箱与 View Transitions（需 playwright 与先 `npm run build`；不参与发布检查）|
| `npm run verify` | 类型、单测、双路径与内容集成检查，适用于当前数据层阶段 |
| `npm run verify:frontend` | 上述检查加当前构建、链接检查及前端必需路由/分享图检查 |
| `npm run preview` | 预览已有 `dist/` |

`check:base` 在系统临时目录构建，保留现有 `dist/`；`--keep` 会打印临时产物地址。`check:content` 在临时源码副本中新增测试文章，原始 src 与 dist 均不改动。本轮不把“后端检查通过”等同于“前端已完成”。

`check:cms-*` 与 `check:comments` 都要用 Playwright 启动真实浏览器；若本机 Playwright 缺少匹配的 headless shell（会报找不到 `chromium_headless_shell-*`），用环境变量指向已装好的 Chromium 或 Edge 可执行文件即可：

```powershell
$env:CMS_OAUTH_CHROME = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run check:cms-config
npm run check:cms-oauth
npm run check:comments
```

## 写文章

在 `src/content/posts/` 新建 `.md`：

```markdown
---
title: 文章标题
description: 一句话摘要
pubDate: 2026-10-10
lang: zh
tags: [随笔]
---

正文从这里开始。
```

| 可选字段 | 说明 |
|---|---|
| `updatedDate` | 更新日期 |
| `draft: true` | 开发可预览；生产页面、列表、标签、RSS、译文目标均排除 |
| `translationKey` | 同一篇文章中英版本填相同的值 |

没有译文时，语言导航可跳目标语言首页，但 SEO 的 `hreflang` 不把首页声明成文章译文。

文章链接使用真实 `post.id`。默认 glob loader 会将文件名转换为 slug：当前 `hello-world.en.md` 的 ID 是 `hello-worlden`，不是 `hello-world` 或 `hello-world.en`。使用 `getTranslations()` 和 `postHref()`，不要推测另一语言的 URL。

## 评论区

评论免登录：读者填昵称和正文即可，不需要 GitHub 或第三方账号。数据存 Cloudflare D1，不走 Git 仓库，因此也不在 Sveltia 后台的集合里——管理入口是 `/admin/comments/`（网页后台右下角「💬 评论管理」）。

| 部分 | 位置 |
|---|---|
| 前端 | `src/components/Comments.astro`、`src/lib/comments.ts`（文章页底部自动出现）|
| 公开接口 | `functions/api/comments.js`（GET 分页 / POST 写入：蜜罐、1.5 秒最小耗时、同 IP 60 秒 1 条与 24 小时 20 条限流、CORS 白名单）|
| 管理接口 | `functions/api/comments-admin.js`（Bearer `COMMENTS_ADMIN_TOKEN`，列表与删除）|
| 管理页 | `public/admin/comments/index.html`（令牌存本机 localStorage）|
| 站点配置 | `src/consts.ts` 的 `COMMENTS`（enabled / origin / pageSize）|

Cloudflare 侧一次性配置（**已于 2026-10-18 配好**）：建 D1 库 `yukki-rui-comments` → Pages 项目 Settings → Functions 加 D1 binding（**变量名必须是 `DB`**）→ Variables and secrets 加 `COMMENTS_ADMIN_TOKEN`（Secret）→ Retry deployment。步骤与排错见[使用说明第 11 节](docs/usage-guide.md)。

本地端到端自检：`npm run build && npm run check:comments`（脚本自己起 `wrangler pages dev`，在 `.tmp-comments-check/` 里建本地 D1，跑完自动关掉）。上线后可用 `npm run check:comments-live` 做线上只读检查（带 `-- --write` 时会真的发一条再删掉，需要 `COMMENTS_ADMIN_TOKEN`）。

## 部署地址

| 平台 | `SITE_BASE` | `SITE_URL` |
|---|---|---|
| GitHub Pages | `/yukki-rui/` | `https://liyukki.github.io/yukki-rui/` |
| Cloudflare Pages | `/` | `https://yukki-rui.pages.dev/` |

配置只从环境变量进入 `astro.config.mjs`，随后注入 `Astro.site` / `import.meta.env.SITE`。页面元信息、RSS、robots 和 sitemap 共用此地址。不要手改 `SITE.url`，不要再创建 `public/robots.txt`。

当前实际配置：GitHub Pages 的值写在 `.github/workflows/deploy.yml` 里（按仓库名自动推导），Cloudflare Pages 的值写在 Cloudflare 项目 Settings → Variables and secrets 里（`SITE_BASE` / `SITE_URL` / `NODE_VERSION`）。

Windows 本地预演 GitHub 部署：

```powershell
$env:SITE_BASE = '/yukki-rui/'
$env:SITE_URL = 'https://你的用户名.github.io/yukki-rui/'
npm run build
npm run check:links
Remove-Item Env:\SITE_BASE
Remove-Item Env:\SITE_URL
```

两个平台使用同一份源码分别构建；由于 base 不同，不能直接复用完全相同的构建产物。平台访问情况应在目标网络实际测试。

## 上线步骤（均已完成，留作换平台时的参考）

1. ✅ 前端完成并跑 `npm run verify:frontend`。
2. ✅ GitHub 公开仓库 <https://github.com/liyukki/yukki-rui>，主分支 `master`。
3. ✅ GitHub 仓库 Settings → Pages → Source 选 GitHub Actions；工作流按仓库名自动配置 base 与地址。
4. ✅ Cloudflare Pages 连接同一仓库：构建命令 `npm run verify:frontend`、输出 `dist`、环境变量 `SITE_BASE=/`、`SITE_URL=https://yukki-rui.pages.dev/`、`NODE_VERSION=24`。
5. ✅ Cloudflare 项目另加两个密钥（`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`，来自 GitHub OAuth App），后台登录靠它们换令牌，见 [使用说明第 10 节](docs/usage-guide.md)。
6. ✅ 两个地址实测：首页、文章、RSS、后台登录与写入。

GitHub 发布前会检查前端必需产物（关于页、标签页、404 与分享图），缺失会阻止发布。`npm run check:frontend` 是结构检查；视觉与可用性要在浏览器核验。

将来更换自有域名，需要在所选托管平台配置 DNS，并同步更新 `SITE_URL` 与必要的 `SITE_BASE`、重新构建；同时要改 GitHub OAuth App 的 Homepage / callback 地址，以及 `public/admin/config.yml` 里的 `base_url`。
