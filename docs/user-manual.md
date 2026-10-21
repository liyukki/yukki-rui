# yukki rui 网站使用说明

这份说明面向站点主人,用于日常写文章、改资料、发布、管理评论和处理常见故障。

当前站点已经上线,不需要自己维护服务器。普通内容保存后会触发 GitHub Pages 和 Cloudflare Pages 重新部署;定时文章由 GitHub Actions 检查 `publishAt` 后触发两平台重建。

- Cloudflare Pages:<https://yukki-rui.pages.dev/>
- GitHub Pages:<https://liyukki.github.io/yukki-rui/>
- 网页后台:<https://yukki-rui.pages.dev/admin/>
- 评论管理:<https://yukki-rui.pages.dev/admin/comments/>
- 完整配置与开发说明:[usage-guide.md](./usage-guide.md)

## 1. 先记住三件事

1. **改文章和个人资料**:打开网页后台,用 GitHub 账号 `liyukki` 登录。保存等于提交 commit,两个平台随后自动部署。
2. **本地写作和预览**:在项目目录运行 `npm run dev`,然后打开 <http://localhost:4321/zh/>。
3. **正式发布**:在后台点保存,或者本地执行 `git add`、`git commit`、`git push`。不要手工修改 `dist/`。

## 2. 网页后台

### 2.1 登录

1. 打开 <https://yukki-rui.pages.dev/admin/>。
2. 点击「使用 GitHub 登录」。
3. 授权后即可编辑内容。

后台登录必须从 Cloudflare Pages 地址进入。GitHub Pages 是纯静态托管,没有服务端函数,不能完成 OAuth 换令牌。若从 GitHub Pages 的 `/admin/` 进入,页面底部会提示正确地址。

登录令牌已配置为长期有效,通常不需要反复登录。

### 2.2 新建或修改文章

进入「文章」集合:

- 修改已有文章:点开文章后直接编辑。
- 新建文章:点「新建文章」,填写字段后保存。
- 保存草稿:打开「草稿」开关再保存。
- 正式发布:关闭「草稿」开关后保存。
- 定时发布:填写「定时发布」字段;到点后等待定时工作流触发重建。
- 首页精选:打开「精选置顶」;它只改变首页列表顺序。

文章字段:

| 字段 | 必填 | 说明 |
|---|---|---|
| 标题 | 是 | 文章标题 |
| 摘要 | 是 | 列表和 RSS 使用的简介,最多 160 字 |
| 发布日期 | 是 | 格式 `YYYY-MM-DD` |
| 语言 | 是 | `zh` 或 `en` |
| 标签 | 否 | 文章标签 |
| 更新日期 | 否 | 填了会显示「更新于」 |
| 草稿 | 否 | 开启后本地可见,正式站点和 RSS 不输出;优先级高于定时发布 |
| 定时发布 | 否 | `publishAt`,按 UTC 判断;留空表示立即发布;日期表示当天 UTC 00:00 |
| 精选置顶 | 否 | `featured`,只影响首页列表;标签页、归档、RSS 和上下篇仍是纯时间序 |
| 中英配对 Key | 否 | 中英文版本填同一个值才会互相链接 |
| 正文 | 是 | 支持标题、列表、引用、代码块、表格和图片 |

保存后,普通文章通常几分钟内完成部署。定时文章要等下一次约 30 分钟一次的检查;GitHub 定时任务本身可能再延迟几分钟到几十分钟,不保证准点。部署完成后刷新线上页面确认。

### 2.3 中英文配对

中英文是两个独立文件。需要互指时,两个文件的「中英配对 Key」必须填完全相同的值。

例如:

- 中文文章 Key:`my-trip`
- 英文文章 Key:`my-trip`

只在一侧填写不会互指。没有译文是正常状态,不要求每篇文章都有英文版。

### 2.4 修改个人资料和独立页面

后台左侧可编辑:

- 「个人资料 → 中文资料」:首页介绍、联系方式、形象照、第二件作品、关于页自我介绍。
- 「个人资料 → English Profile」:英文页面使用的对应内容。
- 「独立页面」:现在、作品、最近在听三个页面的文案和条目。

个人资料字段留空时会回落到代码中的默认文案,不会出现空白页面。

### 2.5 上传图片

**形象照**

在「个人资料」中打开对应语言,上传形象照片。建议使用正方形图片,例如 320×320。图片会保存到 `public/uploads/`。

**文章插图**

在文章正文里把光标放到插图位置,使用编辑器工具栏的图片按钮上传。图片会保存到 `src/content/posts/images/`,正文自动使用相对路径。

不要手工写成 `/images/图片.png`。这种根路径在 GitHub Pages 子路径部署下会变成死链。优先让后台插入图片,或使用 `./images/图片.png` 这样的相对路径。

### 2.6 后台保存后没有更新

依次检查:

1. 文章是否仍处于草稿状态。
2. 是否已经点击保存。
3. GitHub Actions 或 Cloudflare Deployments 是否部署成功。
4. 浏览器是否缓存了旧页面,尝试强刷新。

## 3. 本地写作和预览

### 3.1 环境要求

- Node.js 22.12.0 或更高版本,推荐 Node 24
- npm
- 项目目录:`E:\deepseek\yukki-rui`

第一次在新机器上使用:

```powershell
cd E:\deepseek\yukki-rui
npm ci
npm run dev
```

打开 <http://localhost:4321/zh/>。修改文件后页面会自动刷新,按 `Ctrl+C` 停止。

### 3.2 Markdown 文章位置

本地新建文章时,在 `src/content/posts/` 下创建 `.md` 文件:

```markdown
---
title: 文章标题
description: 一句话摘要,最多 160 字
pubDate: 2026-10-19
lang: zh
tags: [随笔]
---

正文从这里开始。
```

建议文件名只使用英文小写字母、数字和连字符,例如 `my-first-post.md`。文件名中的点号会被移除,不要依赖它生成网址。

### 3.3 本地链接规则

文章内引用本站其他页面时使用相对路径:

```markdown
[去关于页](../../about/)
```

不要写 `/zh/about/` 这类从站点根目录开始的链接。两种平台的部署 base 不同,根路径容易在 GitHub Pages 下变成死链。

### 3.4 内容检查

发布前运行:

```powershell
npm run verify:frontend
```

这条命令会检查类型、单元测试、两种部署路径、页面链接、内容规则、RSS、分享图和必需页面。全部通过再提交。

只想快速检查死链:

```powershell
npm run build
npm run check:links
```

## 4. 发布、回滚和部署状态

### 4.1 通过后台发布

后台保存会自动向 `liyukki/yukki-rui` 仓库提交 commit。推送后:

- GitHub Pages 由 `.github/workflows/deploy.yml` 自动构建。
- Cloudflare Pages 由仓库连接自动构建。
- 两个平台使用同一份内容,但分别使用自己的 `SITE_BASE` 和 `SITE_URL`。

定时发布同样走这条链路:`.github/workflows/publish-scheduled.yml` 每 30 分钟检查一次,到点后推一个空提交触发 Cloudflare Pages,再显式调度 `deploy.yml` 并等待 GitHub Pages 部署完成。默认 `GITHUB_TOKEN` 产生的 push 不会递归触发其他 workflow,所以显式调度不能删。GitHub 连续 60 天没有活动时,定时任务可能被暂停,需要到仓库 Actions 页手动恢复。

### 4.2 通过本地 Git 发布

```powershell
cd E:\deepseek\yukki-rui
npm run verify:frontend
git status
git add -A
git commit -m "更新文章"
git push
```

`dist/` 是构建产物,不要提交。

### 4.3 查看部署

GitHub Actions:

```powershell
gh run list --limit 5
gh run watch <run-id> --exit-status
```

Cloudflare Pages:

```powershell
npx wrangler pages deployment list --project-name yukki-rui
```

线上地址:

- <https://liyukki.github.io/yukki-rui/>
- <https://yukki-rui.pages.dev/>

### 4.4 回滚一次改动

内容保存在 Git 历史中。若某次修改有问题,可以回滚对应 commit:

```powershell
git log --oneline
git revert <commit-id>
git push
```

回滚也会触发两个平台重新部署。

## 5. 评论管理

读者在文章底部填写昵称和正文即可评论,不需要注册或登录 GitHub。

站长打开 <https://yukki-rui.pages.dev/admin/comments/>:

1. 第一次输入 `COMMENTS_ADMIN_TOKEN`,点「保存并加载」。令牌只保存在当前浏览器本地,不会上传。
2. 列表每页 50 条,点「加载更多」用游标继续读取更早评论;200 只是单次 API 上限,不是管理页总量上限。
3. 路径、昵称、正文筛选只作用于已经加载的评论;要找更早内容,先加载更多。
4. 删除根评论会连同它的直接回复一起隐藏;删除单条回复只隐藏那一条。

读者可以回复评论,形成单层回复;每条评论支持赞、喜欢、有用三种 reactions,同一 IP 对同一种反应只计一次,再次点击取消。反应不会触发新评论通知。

评论和 reactions 的公开接口依赖 D1 binding `DB` 与独立的 Cloudflare Secret `COMMENTS_SALT`;缺少盐时发布会返回 503。不能把管理令牌当盐使用。`COMMENTS_ADMIN_TOKEN` 只用于管理页。

评论数据存储在 Cloudflare D1,不在 Git 仓库中,所以 Sveltia CMS 的文章列表里看不到评论。评论区默认开启;需要整体关闭时,修改 `src/consts.ts` 中 `COMMENTS.enabled`,然后重新部署。

## 6. RSS 订阅

站点提供全文 RSS:

- 中文:<https://yukki-rui.pages.dev/rss.xml>
- 英文:<https://yukki-rui.pages.dev/rss-en.xml>
- GitHub Pages 版本把域名替换为 `https://liyukki.github.io/yukki-rui/`。

RSS 会自动:

- 使用 Astro 渲染后的完整正文。
- 把图片和站内链接转换为带部署前缀的绝对地址。
- 排除 `draft: true` 的文章。
- 区分中文和英文内容。
- 按发布时间纯时间倒序;`featured` 不会改变 RSS 顺序。

修改文章后无需维护 RSS 文件,重新部署即可。定时文章要等 `publishAt` 到点并完成重建后才会进入 RSS。阅读器有缓存时,手动刷新订阅。

## 7. 常改配置

以下配置仍需改代码,改完执行 `npm run verify:frontend` 后再推送。

| 配置 | 位置 | 用途 |
|---|---|---|
| 站点名称、简介、作者 | `src/consts.ts` 的 `SITE` | 页头、标题、页脚和默认描述 |
| 界面文案 | `src/consts.ts` 的 `UI` | 搜索、归档、阅读工具等文案 |
| 评论开关和主站地址 | `src/consts.ts` 的 `COMMENTS` | 评论功能配置 |
| 访问统计 | `src/consts.ts` 的 `WEB_ANALYTICS` | Cloudflare Web Analytics |
| 后台集合与字段 | `public/admin/config.yml` | Sveltia CMS 表单 |
| GitHub Pages 部署 | `.github/workflows/deploy.yml` | 子路径构建和发布 |
| 新评论、草稿提醒 | `.github/workflows/ops-reminders.yml` | 定时运营提醒 |
| 定时发布 | `.github/workflows/publish-scheduled.yml` | 检查 `publishAt` 并触发两平台重建 |

Cloudflare 中的敏感配置:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `COMMENTS_ADMIN_TOKEN`
- `COMMENTS_SALT`(必填,且不能与管理令牌共用)
- D1 binding 变量 `DB`

这些密钥不要写进仓库。修改 Cloudflare 环境变量或 D1 binding 后,需要重新部署一次才会生效。

## 8. 换自定义域名

需要同时修改以下位置:

1. 托管平台的 `SITE_URL`,必要时修改 `SITE_BASE`。
2. GitHub OAuth App 的 Homepage URL。
3. GitHub OAuth App 的 Authorization callback URL。
4. `public/admin/config.yml` 中的 `base_url`。
5. Cloudflare 环境和 D1 配置无需迁移,但需要重新部署。

不要把手写域名写进页面代码。页面元信息、RSS、robots 和 sitemap 都从环境变量读取。

## 9. 常见问题

| 现象 | 原因和处理 |
|---|---|
| 后台点登录没有反应 | 确认使用的是 `https://yukki-rui.pages.dev/admin/`,不要从 GitHub Pages 后台登录 |
| 登录提示 `GITHUB_CLIENT_ID 未配置` | 检查 Cloudflare 的 `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`,修改后重新部署 |
| 保存后线上没有变化 | 检查草稿开关、部署状态和浏览器缓存 |
| 文章本地能看到、线上没有 | 文章仍是 `draft: true`,或 `publishAt` 还没到点 |
| 到了 `publishAt` 仍未上线 | 检查 Actions 的 `publish-scheduled` 与 `deploy` 是否成功;GitHub 定时任务可能延迟,60 天无活动还可能被暂停 |
| 评论或 reactions 提示服务未配置 | 确认 D1 binding 为 `DB`,并配置独立的 `COMMENTS_SALT`;管理页还需要 `COMMENTS_ADMIN_TOKEN` |
| `check:base` 报路径错误 | 文章中有根路径链接或图片,改成相对路径 |
| 评论加载失败 | 检查 Cloudflare D1 binding 是否为 `DB`、D1 是否正常,以及最近部署是否成功 |
| RSS 图片打不开 | 运行 `npm run verify:frontend`,检查 RSS 地址补全 |
| 后台只提示 CMS 配置错误 | 运行 `npm run check:cms-config`,检查 `public/admin/config.yml` |
| 搜索在本地不可用 | 搜索依赖构建索引,先运行 `npm run build` |
| GitHub Actions 提示 Node.js 20 弃用 | 当前不影响部署,后续升级 Action 版本即可 |

## 10. 不要做的事情

- 不手工编辑 `dist/`。
- 不提交 `GITHUB_CLIENT_SECRET`、`COMMENTS_ADMIN_TOKEN`、`COMMENTS_SALT` 等密钥。
- 不手写 `/zh/...` 或 `/images/...` 这类站点根路径。
- 不在页面代码里硬编码域名。
- 不再创建 `public/robots.txt`,站点会自动生成。
- 不回滚到旧后台前,不需要运行 `npm run cms`。
- 不在未运行 `npm run verify:frontend` 的情况下直接推送结构性改动。

## 11. 命令速查

| 命令 | 用途 |
|---|---|
| `npm ci` | 首次安装依赖 |
| `npm run dev` | 本地预览,地址 `http://localhost:4321/zh/` |
| `npm run build` | 构建到 `dist/` |
| `npm run preview` | 预览已构建的 `dist/` |
| `npm run verify:frontend` | 发布前完整检查 |
| `npm run check:links` | 检查当前 `dist/` 的站内死链 |
| `npm run check:base` | 检查两种部署路径 |
| `npm run check:content` | 检查内容规则、草稿和 RSS |
| `npm run check:comments` | 用本地 Pages + D1 检查评论端到端,需要 Playwright |
| `npm run check:comments-live` | 只读检查线上评论区 |
| `npm run check:reading` | 检查阅读工具,需要 Playwright |
| `npm run check:search` | 检查搜索和归档,需要 Playwright |
| `npm run check:pages` | 检查现在、作品、在听页面 |
| `npm run check:og` | 检查分享图和结构化数据 |

网络不通时,推送可临时使用:

```powershell
$env:GIT_SSL_BACKEND = 'openssl'
git -c http.version=HTTP/1.1 push origin master
```

## 12. 需要继续查看的文档

- 完整操作、后台字段和开发细节:[usage-guide.md](./usage-guide.md)
- 历次验证与实测记录:[verification-report.md](./verification-report.md)
- 项目概览和开发命令:[README.md](../README.md)

如果只记一条工作流:**打开后台写内容,保存,等两个平台部署完成,刷新线上页面确认。**
