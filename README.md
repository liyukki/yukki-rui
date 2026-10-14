# yukki rui

免费托管的中英双语个人网站，文章用 Markdown 管理，Astro 7 在构建时输出静态 HTML，不需要购买服务器或域名。

**当前阶段：前端已完成，组件、布局、页面、样式与默认 OG 图齐全；仅真实个人素材（头像、联系方式、第二件作品）待用户提供。**

Kimi 从 [前端交接说明](docs/frontend-handoff.md) 开始，配套 [设计文档](docs/superpowers/specs/2026-10-10-yukki-rui-blog-design.md) 与 [实施计划](docs/superpowers/plans/2026-10-10-yukki-rui-blog.md)。实际审核记录见 [验证报告](docs/verification-report.md)。

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
| `npm run check:cms-oauth` | 可选：用真实 Decap 客户端在本地跑一遍后台登录握手（需 playwright；不参与发布检查）|
| `npm run verify` | 类型、单测、双路径与内容集成检查，适用于当前数据层阶段 |
| `npm run verify:frontend` | 上述检查加当前构建、链接检查及前端必需路由/分享图检查 |
| `npm run preview` | 预览已有 `dist/` |

`check:base` 在系统临时目录构建，保留现有 `dist/`；`--keep` 会打印临时产物地址。`check:content` 在临时源码副本中新增测试文章，原始 src 与 dist 均不改动。本轮不把“后端检查通过”等同于“前端已完成”。

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

## 部署地址

| 平台 | `SITE_BASE` | `SITE_URL` |
|---|---|---|
| GitHub Pages | `/yukki-rui/` | `https://你的用户名.github.io/yukki-rui/` |
| Cloudflare Pages | `/` | Cloudflare 实际分配的 `https://项目名.pages.dev/` |

配置只从环境变量进入 `astro.config.mjs`，随后注入 `Astro.site` / `import.meta.env.SITE`。页面元信息、RSS、robots 和 sitemap 共用此地址。不要手改 `SITE.url`，不要再创建 `public/robots.txt`。

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

## 上线步骤

1. Kimi 完成前端，并运行 `npm run verify:frontend`，在浏览器完成手机、主题、语言和标签交互验收。
2. 在 GitHub 创建公开空仓库，将代码推送到 `main` 或 `master`；工作流支持这两个分支。实际分支名用 `git branch --show-current` 查看。
3. GitHub 仓库 Settings → Pages → Source 选择 GitHub Actions。工作流根据仓库名自动配置 base 与地址。
4. Cloudflare Pages 连接同一仓库：构建命令 `npm run verify:frontend`，输出 `dist`，环境变量填上表中的两项，并选择兼容的 Node 24。
5. 实际打开两个地址，检查首页、文章、RSS 与分享链接。免费域名使用平台分配的实际名字，不能保证指定名字可用。

GitHub 发布前会检查前端必需产物，当前关于页、标签页、404 与分享图均已具备，结构门槛通过；若将来缺失，该检查仍会阻止发布。`npm run check:frontend` 是结构检查；视觉与可用性要在浏览器核验。

将来更换自有域名，需要在所选托管平台配置 DNS，并同步更新 `SITE_URL` 与必要的 `SITE_BASE`、重新构建。
