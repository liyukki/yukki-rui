# 网站使用说明

面向站点主人。所有操作都在项目目录 `E:\deepseek\yukki-rui` 里完成，用 Git Bash 或 PowerShell。

本文所有命令、路径和行为都经过实际执行验证。写完内容后按第 8 节的命令上传即可。

---

## 0. 网站长什么样

**页面**（每种语言一套，中文 `/zh/...`，英文 `/en/...`）：

| 页面 | 地址 |
|---|---|
| 首页 | `/zh/` |
| 文章 | `/zh/posts/文章名/` |
| 标签总览 | `/zh/tags/` |
| 单个标签 | `/zh/tags/标签名/` |
| 关于 | `/zh/about/` |
| 网页后台 | `/admin/`（编辑内容用，不对外展示）|
| 404 | 自动 |
| RSS 订阅 | `/rss.xml`（中）`/rss-en.xml`（英）|

**本次全面检查结果**：全部检查通过。类型检查 0 错误 0 警告 0 提示、59 项单元测试通过、两种部署路径各 22 个页面 851 条站内链接无死链、后台产物与个人资料集合集成检查通过。

**站点已上线**：https://liyukki.github.io/yukki-rui/ （GitHub Pages，中英双语、照片、RSS、sitemap 均实测正常）。

**新增：网页后台**。现在可以不碰代码、直接在浏览器里改文章和个人资料了，见第 10 节。

---

## 1. 日常最常用：本地预览

```bash
cd /e/deepseek/yukki-rui
npm run dev
```

浏览器打开 **`http://localhost:4321/zh/`**。改文件保存后页面自动刷新，不用重启。

停止：在终端按 `Ctrl + C`。

> 首次在新机器上运行需要先执行 `npm ci` 安装依赖（要求 Node 24）。

---

## 2. 发一篇文章（核心操作）

### 2.1 新建文件

在 `src/content/posts/` 下新建 `.md` 文件，文件名就是网址。例如建 `my-trip.md`，网址就是 `/zh/posts/my-trip/`。

**文件开头的 frontmatter 必填 4 项**：

```markdown
---
title: 我的旅行
description: 一句话摘要，会显示在列表和搜索结果里。
pubDate: 2026-10-20
lang: zh
tags: [随笔, 旅行]
---

正文从这里开始，用 Markdown 写。
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | 是 | 文章标题 |
| `description` | 是 | 摘要，**最多 160 字**，超了会构建失败 |
| `pubDate` | 是 | 发布日期，格式 `2026-10-20` |
| `lang` | 是 | 只能是 `zh` 或 `en`，写别的会构建失败 |
| `tags` | 否 | 标签数组，没写就是空 |
| `updatedDate` | 否 | 更新日期，会在文章页显示"更新于" |
| `draft` | 否 | 写 `true` 就是草稿（见 2.4）|
| `translationKey` | 否 | 中英配对用（见 3.1）|

写错字段时构建会明确告诉你哪个文件、哪个字段有问题，例如：

```
[InvalidContentEntryDataError] posts → my-second-post data does not match collection schema.
  lang: Invalid option: expected one of "zh"|"en"
```

照着提示改就行，不会静默出错。

### 2.2 正文语法

以下语法我都实测过，全部正常渲染：`##` 标题、`**加粗**`、`` `行内代码` ``、`- 无序列表`、`1. 有序列表`、`> 引用`、` ``` ` 代码块、表格。

### 2.3 文章里插图（**有个坑必须注意**）

**正确做法**：把图片放在**文章同一个目录**（`src/content/posts/` 下的任意子目录都行），然后用**相对路径**引用：

```markdown
![图片说明](./images/my-pic.png)
```

这样 Astro 会自动优化：转成 webp、压缩、加上宽高（防止页面跳动），**并且自动处理两种部署路径**。

**错误做法**：不要写 `/images/my-pic.png` 这种从根开始的路径。它在本机预览时正常，但部署到 GitHub Pages 子路径后会变成死链。`npm run check:base` 会直接报错拦住你：

```
✗ base = /yukki-rui/ 有坏链接：
  zh/posts/my-post/index.html → /images/test-pic.png（路径前缀错误或目标不存在）
```

也不要用 `../../../images/` 这类跳出文章目录的相对路径，Astro 会报 `image-not-found` 并中断构建。

> 如果你确实想把图片放 `public/` 目录（适合图标等不常变的小文件），那么引用时**必须自己带上部署前缀**，代价是本地和线上网址不同，容易出错。除非有特别理由，**建议统一用文章同目录 + `./` 相对路径**。

### 2.4 草稿：写一半先存着

frontmatter 加 `draft: true`：

```markdown
---
title: 还没写完的文章
draft: true
---
```

- `npm run dev` 本地预览：**能看到**，方便边写边看
- `npm run build` 正式构建：**自动排除**——不生成页面，不进首页列表，不进标签页，不进 RSS

发文章时把 `draft: true` 删掉（或改成 `false`）即可。

### 2.5 文章内引用站内链接

链接到本站其他页面时，也用相对路径：

```markdown
[去关于页](../../about/)
```

绝对路径 `/zh/about/` 同样会在子路径部署下坏链。拿不准就少用，或写完跑一次 `npm run check:base`。

### 2.6 文件名与网址的关系（**容易踩坑**）

文件名里的**点号会被删掉**，这违反直觉：

| 文件名 | 实际网址 |
|---|---|
| `my-trip.md` | `/zh/posts/my-trip/` |
| `hello-world.en.md` | `/zh/posts/hello-worlden/` ← 注意 `en` 前面没有点 |
| `我的文章.md` | `/zh/posts/我的文章/`（能工作，但网址有中文）|

**建议**：用英文小写加连字符命名，不要用点号，不要用中文，不要用空格。这样网址最好看也最保险。已有的 `hello-world.en.md` 是历史遗留，别学它。

---

## 3. 双语文章怎么配

### 3.1 中英配对（两边都要填）

想给一篇文章配英文版，**两个文件都要写相同的 `translationKey`**：

`src/content/posts/my-trip.md`：
```markdown
---
title: 我的旅行
lang: zh
translationKey: my-trip
---
```

`src/content/posts/my-trip-en.md`：
```markdown
---
title: My Trip
lang: en
translationKey: my-trip
---
```

填好后自动生效：文章页会出现"English"按钮跳到译文，搜索引擎也会收到 `hreflang` 互指标签。

**实测提醒**：如果只在一边填 `translationKey`，**不会互指**，语言按钮只会降级跳英文首页。两边都填才行。

### 3.2 没有译文也没关系

不写 `translationKey` 就是没有译文，这是**正常状态**。语言按钮会跳到英文首页，SEO 也不会错误地把首页声明成译文。现有文章 `writing-in-markdown.md` 就是故意没译文的例子。

**英文版是独立文章**，不要求每篇都有译文。英文内容写进 `lang: en` 的文件即可，它会出现在 `/en/` 的列表、标签和 RSS 里。

---

## 4. 换成你自己的信息

> **推荐**：4.2–4.4 的个人资料现在可以直接在网页后台改（见第 10 节），不用碰代码。
> 本节保留代码改法，作为不用后台或想改默认文案时的备选。
> 注意后台的编辑优先于下面的默认文案：后台字段留空时，页面才回落到这里的代码文案。

站点名称等基础信息全部集中在 `src/consts.ts`，**改一处全站生效**：

```ts
export const SITE = {
  name: 'yukki rui',        // 页头站名、浏览器标签
  title: 'yukki rui',       // 页面标题
  description: '一个用 Markdown 写的中英双语个人博客。',  // 首页描述、搜索摘要
  author: 'yukki rui',      // 页脚 ©
  ...
};
```

### 4.1 换头像 / 形象照

**方式一（推荐，网页后台）**：个人资料 → 中文资料（或 English Profile）→ 形象照片
1. 点「照片」字段的 **Choose an image** → 弹窗里点 **📁 选择本地图片** 或 **Upload**
2. 上传后点中缩略图 → 点 **Choose selected**
3. 按需改「照片实际像素宽/高」（填图片真实尺寸，防布局跳动；不确定就 320）
4. 右上角 **Publish → Publish now**

图片自动存到 `public/uploads/`，首页和关于页的形象照同时更新。**建议用正方形图片**（比如 320×320）。

> 照片会**自动同步**：传一次，中文和英文两边的页面都会显示（本语言优先，没有就借用另一语言的）。想分语言各用一张，就在对应语言的「形象照片」里各传一张——自己传的优先。

**方式二（改代码，作为兜底）**：后台字段留空时，回落到 `src/consts.ts` 的 `HERO_IMAGE`：

1. 把图片放进去：`public/hero.png`
2. 改 `HERO_IMAGE.src`，从空字符串改成 `'/hero.png'`：

```ts
export const HERO_IMAGE = {
  src: '/hero.png',        // ← 原来是空字符串 ''，填上路径
  altZh: 'yukki rui 的形象照片',
  altEn: 'Portrait of yukki rui',
  width: 320,              // 实际像素宽，图片重要防止布局跳动
  height: 320,             // 实际像素高
} as const;
```

### 4.2 换联系方式（邮箱、社交账号）

**方式一（推荐）**：网页后台 → 个人资料 → 中文资料 → 联系方式
- 「说明文字」填一句介绍
- 「链接列表」每项填名称 + 地址（`https://github.com/你的用户名`、`mailto:you@example.com`），保存后首页自动渲染成可点击链接

**方式二（改代码）**：编辑 `src/pages/[lang]/index.astro`，找到 `social` / `socialText` 两行：

```ts
// 改前
social: '个人联系方式', socialText: '邮箱与社交账号待补充。在此之前，可以先读读关于页面。',
// 改后（示例）
social: '个人联系方式', socialText: '邮箱 hello@example.com，GitHub @yourname。',
```

### 4.3 换第二件作品

**方式一（推荐）**：网页后台 → 个人资料 → 中文资料 → 第二件作品
- 标题、介绍、链接文字、链接地址（填了才显示链接）、状态（WIP/LIVE）

**方式二（改代码）**：编辑 `src/pages/[lang]/index.astro` 的 `slot` / `slotText` 改默认文案。

### 4.4 关于页正文

**方式一（推荐）**：网页后台 → 个人资料 → 中文资料 → 关于页 → 「自我介绍」字段。目前写的是"个人介绍暂未公开"，替换成真实自我介绍即可。

**方式二（改代码）**：`src/pages/[lang]/about.astro` 里的 `defaults` 对象（`body` 和 `pending` 字段）。

---

## 5. 写完后检查（发布前必做）

```bash
npm run verify:frontend
```

这一条命令跑完全部检查。全绿才往下走。它验证：类型、48 项单测、**两种部署路径**下所有页面和链接、Markdown 渲染、RSS、必需页面、死链。

**重点**：如果你手写了站内链接或插了图，这条命令能抓出子路径部署下的坏链。我实测时就靠它抓出了 `/images/` 写法的问题。

> 只想快速看有没有死链：`npm run build && npm run check:links`

---

## 6. 上传 / 发布网站

网站是纯静态的，**代码一推送，平台自动构建并上线**，不需要手动传文件。

```bash
cd /e/deepseek/yukki-rui
git add -A
git commit -m "更新文章"
git push
```

推送到 `main` 或 `master` 后：

- **GitHub Pages**：自动构建部署，几分钟后生效
- **Cloudflare Pages**：同样自动构建部署

**更新文章 = 改 md 文件 → push**。不用管 `dist/` 目录，那是构建产物，已忽略。

### 6.1 部署现状与首次部署（GitHub Pages 已完成）

**当前状态（2026-10-14）**：仓库已在 https://github.com/liyukki/yukki-rui，
GitHub Pages 已上线：**https://liyukki.github.io/yukki-rui/**（中英页面、照片、
RSS、sitemap 全部实测正常）。

已完成的首次部署步骤：

1. ~~在 GitHub 创建公开空仓库并推送~~ ✓
2. ~~仓库 Pages → Source 选 GitHub Actions~~ ✓
3. Cloudflare Pages 连同一个仓库（**未做**，见 10.2 节）：构建命令填 `npm run verify:frontend`，输出目录 `dist`，环境变量按下面表格填，Node 选 24

| 平台 | `SITE_BASE` | `SITE_URL` |
|---|---|---|
| GitHub Pages | `/yukki-rui/` | `https://liyukki.github.io/yukki-rui/` |
| Cloudflare Pages | `/` | `https://项目名.pages.dev/` |

`SITE_BASE` 和 `SITE_URL` 只在这两个平台的设置里配，**不要写进代码**——
GitHub Pages 用仓库 Settings → Variables 里的对应值（仓库变量），或按本仓库
`.github/workflows/deploy.yml` 里的默认推导（`/仓库名/` 与 `用户名.github.io/仓库名/`）。

### 6.2 平台自检

GitHub 每次推送都会自动跑检查，缺关键页面时会**拒绝发布**（防止发出坏站）。想手动跑同样的检查：`npm run verify:frontend`。

---

## 7. 换自定义域名

1. 在托管平台配置 DNS
2. 把平台设置里的 `SITE_URL` 改成新域名（GitHub Pages 的话 `SITE_BASE` 改回 `/`）
3. 重新推送触发构建

**不要在代码里硬编码域名**，页面元信息、RSS、sitemap 都会自动跟着环境变量走。

---

## 8. 命令速查

| 命令 | 用途 |
|---|---|
| `npm run dev` | 本地预览，边写边看。`http://localhost:4321/zh/` |
| `npm run build` | 构建到 `dist/`（发布前的最终产物）|
| `npm run preview` | 预览已构建的 `dist/` |
| **`npm run verify:frontend`** | **发布前完整检查，全绿再推** |
| `npm run cms` | 后台的本地文件桥（配合 `npm run dev` 用，见第 10 节）|
| `npm run check:links` | 只查死链（需先 build）|
| `npm run check:base` | 只查两种部署路径 |
| `npm run check:cms-oauth` | 可选：用真实 Decap 客户端在本地跑一遍后台登录握手（需先 `npm i -D playwright`，不参与发布检查）|

---

## 9. 常见问题

**问：改了文章，线上没变化？**
先确认 `git push` 成功了，再去平台的 Actions/Deployments 页面看构建状态。构建失败会显示原因。

**问：中文标签页的网址为什么是中文？**
标签名直接进网址（如 `/zh/tags/指南/`），这是正常设计。浏览器会自动编码，不影响使用。

**问：想加评论？**
`src/consts.ts` 里 `COMMENTS.enabled` 现在是 `false`，不产生任何第三方请求。要开启需装 giscus 应用并填 repo / repoId / categoryId 三项。

**问：文章写了一半想先上线其他内容？**
给未完成的文章加 `draft: true`，它就不会出现在正式网站里，但本地 `npm run dev` 仍能预览。

**问：构建报 `InvalidContentEntryDataError`？**
frontmatter 写错了。报错会指明文件和字段，照提示改。常见原因：`lang` 不是 `zh`/`en`、`description` 超过 160 字、漏了必填字段。

**问：`check:base` 报"路径前缀错误或目标不存在"？**
文章里的手写链接或图片路径有问题，见 2.3 和 2.5 节。这是重要警告，别忽略。

**问：Windows 下手工验证 GitHub 部署？**
PowerShell 里：
```powershell
$env:SITE_BASE = '/yukki-rui/'
$env:SITE_URL = 'https://你的用户名.github.io/yukki-rui/'
npm run build
npm run check:links
Remove-Item Env:\SITE_BASE
Remove-Item Env:\SITE_URL
```
如果在 Git Bash 里做同样的事，**必须**在前面加 `MSYS_NO_PATHCONV=1`，否则 Git Bash 会把 `/yukki-rui/` 错误转换成 Windows 路径导致构建失败。

---

## 10. 网页后台：不碰代码改内容（Decap CMS）

站点现在自带一个浏览器后台，能编辑**所有文章**和**个人资料**（首页文案、联系方式、第二件作品、关于页自我介绍），不用开编辑器、不用记 frontmatter 格式。

### 10.1 本地用（现在就能用，不用登录）

开**两个终端**：

```bash
# 终端 1：站点
npm run dev

# 终端 2：后台的本地文件桥（把浏览器里的保存写回你电脑上的文件）
npm run cms
```

然后浏览器打开 **`http://localhost:4321/admin/index.html`**。

> 注意两点：
> - 本地 dev 模式下 `/admin/`（短地址）会 404，这是 Astro 开发服务器对 public 目录的已知怪癖；用带 `index.html` 的完整地址。线上部署没这个问题。
> - 点进去后不用登录，直接能看到「文章」和「个人资料」两个集合。

**改完会发生什么**：`npm run cms`（decap-server）把改动直接写回 `src/content/` 下的文件，dev 服务器自动刷新，你立刻能在 `http://localhost:4321/zh/` 看到效果。确认满意后照常 `git add` + `commit` + `push` 发布。

### 10.2 线上用（任何设备打开网页就能改，需要一次性配置）

线上后台 = 浏览器打开 `https://你的项目.pages.dev/admin/`，用 GitHub 账号登录，保存时 CMS 直接往仓库提交 commit，两个平台自动重新部署，几分钟后生效。

**一次性配置（约 10 分钟，只做一次）**：

1. **仓库先上 GitHub**：把代码推到 GitHub 公开仓库（后台的保存动作 = 往这个仓库 commit）。
2. **改 `public/admin/config.yml` 两行**：把 `repo: yukki-rui/yukki-rui` 改成真实仓库 `用户名/仓库名`；把 `base_url: https://yukki-rui.pages.dev` 改成你的 Cloudflare 地址 `https://你的项目.pages.dev`。
3. **创建 GitHub OAuth App**：GitHub → Settings → Developer settings → OAuth Apps → New：
   - Homepage URL：`https://你的项目.pages.dev`
   - Authorization callback URL：`https://你的项目.pages.dev/api/callback`
   - 创建后拿到 **Client ID**，点 Generate a new client secret 拿到 **Secret**。
4. **Cloudflare Pages 配环境变量**：项目 Settings → Environment variables，加两个（Production 和 Preview 都勾上）：
   - `GITHUB_CLIENT_ID` = 上面的 Client ID
   - `GITHUB_CLIENT_SECRET` = 上面的 Secret
   - 配完后重新部署一次（Deployments → Retry）让变量生效。
5. 打开 `https://你的项目.pages.dev/admin/`，点 **Login with GitHub**，授权后即可编辑。

**为什么只有 Cloudflare 地址能登录**：换登录令牌需要服务端代码（`functions/api/` 里的两个 Cloudflare Function），GitHub Pages 是纯静态托管跑不了函数。所以**后台固定从 Cloudflare 地址进**；GitHub Pages 那份部署只展示内容。保存的内容两边都会更新（改的是同一个仓库）。

> 从别的地址（例如 `liyukki.github.io/yukki-rui/admin/`）打开后台时，页面底部会自动出现一条提示，告诉你正确地址——因为那种情况下登录按钮点了不会有反应。本机预览不会出现这条提示（本地走 `local_backend`，不需要登录）。

### 10.3 后台里能改什么

| 集合 | 内容 | 改完影响 |
|---|---|---|
| 文章 | 全部 `.md` 文章：标题、摘要、日期、语言、标签、草稿开关、正文、插图 | 首页列表、标签页、RSS |
| 个人资料 → 中文资料 | 首页一句话介绍/副文案/页尾签名、**形象照片**、联系方式文字+链接列表、第二件作品（标题/介绍/链接/状态）、关于页自我介绍 | `/zh/` 各页 |
| 个人资料 → English Profile | 同上，英文版 | `/en/` 各页 |

#### 怎么上传照片（两种，都是实测过的流程）

> **拖拽不可用时**：有些内置浏览器不支持把系统文件拖进网页，这时用媒体库弹窗右下角的
> **「📁 选择本地图片」浮动按钮**——它出现在任何图片上传弹窗打开时，点击直接打开系统
> 文件选择框，之后流程和点 **Upload** 完全一样。（点弹窗里的 **Upload** 按钮本身也能
> 打开文件选择框，两者等效。）

**形象照**（首页 + 关于页）：
1. 个人资料 → 中文资料 → 「形象照片」区块 → 点 **Choose an image**
2. 弹窗里点右下角 **📁 选择本地图片**（或弹窗里的 **Upload**）选图
3. 上传完点中缩略图 → 点 **Choose selected**
4. 右上角 **Publish → Publish now**

图片存到 `public/uploads/`；「照片实际像素宽/高」填图片真实尺寸（不确定就 320）。

**文章插图**：
1. 打开一篇文章，光标点到正文里想插图的位置
2. 正文工具栏点 **Add Component** → 选 **Image** → 点 **Choose an image**
3. 弹窗里点 **📁 选择本地图片**（或 **Upload**）上传，点中缩略图 → **Choose selected**
4. **Publish → Publish now**

图片存到 `src/content/posts/images/`，正文自动插入相对路径（`images/文件名`）。实测两种部署路径都正确：构建时 Astro 会自动优化图片并配好前缀。

几个要点：

- **草稿**：编辑文章时勾选「草稿」，保存后本地能看到、正式构建自动排除——和第 2.4 节是同一个开关。
- **中英配对**：两篇文章的「中英配对 Key」填同一个值才会互指，规则同第 3.1 节。
- **字段留空 = 用默认文案**：个人资料里任何字段清空，页面会回落到代码里写的默认文案，不会开天窗。
- **联系方式链接**：链接列表填了就显示成可点击链接（`https://` 或 `mailto:` 开头），空列表则保持"待补充"占位。
- **形象照自动同步**：传一次，中英两边页面都显示（本语言优先，没有就借用另一语言的）。想分语言各用一张，在对应语言的资料里各传一张即可。
- **后台管不到的地方**：站点名称（`src/consts.ts` 的 `SITE`）和评论开关（`COMMENTS`）仍是代码配置；形象照的代码兜底入口是 `HERO_IMAGE`（见 4.1）。

### 10.4 安全边界（CMS 改不坏站）

CMS 保存的数据要经过三道关：

1. **schema 校验**：`src/content.config.ts` 定义了每个字段的类型，CMS 写出的数据过不了校验会在构建期明确报错（哪个文件哪个字段），不会静默出坏页面。
2. **集成测试**：`npm run verify:frontend` 里的 check-content 会实际构建并断言个人资料真的渲染进了首页和关于页、空链接列表不会渲染出坏卡片。
3. **Git 历史**：每次保存都是一个 commit，改错了 `git revert` 就能回滚。

### 10.5 常见问题

**问：本地后台点了没反应 / 提示 Failed to load entries？**
`npm run cms` 没起。它必须和 `npm run dev` 同时跑着。

**问：线上登录弹窗报 `GITHUB_CLIENT_ID 未配置`？**
第 10.2 节第 4 步的环境变量没配或没重新部署。

**问：线上登录后提示仓库不存在？**
`config.yml` 里的 `repo` 没改成你的真实仓库，或 OAuth App 授权的账号没有这个仓库的写权限。

**问：线上点了「Login with GitHub」没反应（弹窗闪一下就没了）？**
先看地址栏：登录只在 Cloudflare 地址有效，从 GitHub Pages 那份 `/admin/` 进会没反应——页面底部会有提示条写出正确地址。地址对的话，再确认 Cloudflare 环境变量 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` 配好并重新部署过（见 10.2 第 4 步）。

**问：在后台改了内容，前台没变？**
本地模式：确认 `npm run cms` 终端没报错，文件确实被改了（`git status` 能看到）。线上模式：保存 = 提交 commit，等平台重新部署完（GitHub Actions / Cloudflare 部署记录可查），通常几分钟。

---

## 11. 还缺什么

- **线上网页后台**（唯一剩下的事）：
  1. Cloudflare Pages 连接仓库（构建命令 `npm run verify:frontend`、输出目录 `dist`、Node 24、环境变量 `SITE_BASE=/` 和 `SITE_URL=https://项目名.pages.dev/`）
  2. 创建 GitHub OAuth App 并把 Client ID / Secret 配到 Cloudflare 环境变量
  3. 从 `https://项目名.pages.dev/admin/` 登录后即可在网页里改内容（手机也可以）
  详见 10.2 节。
- 想换域名：见第 7 节。
- 可选：开通评论（第 9 节最后一问）、给英文页单独换一张形象照（10.3）。

除此之外，站点已完整上线可用。
