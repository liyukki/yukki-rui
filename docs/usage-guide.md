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
| 归档 | `/zh/archive/`（按年份翻旧文）|
| 搜索 | `/zh/search/`（关键词搜标题和正文）|
| 标签总览 | `/zh/tags/` |
| 单个标签 | `/zh/tags/标签名/` |
| 关于 | `/zh/about/` |
| 现在 | `/zh/now/`(最近在忙什么)|
| 作品 | `/zh/works/`(做过的东西)|
| 最近在听 | `/zh/listening/`(循环中的歌)|
| 友链 | `/zh/friends/`(常去看的站点)|
| 网页后台 | `/admin/`（编辑内容用，不对外展示）|
| 评论管理 | `/admin/comments/`（站长删评论用，不对外展示）|
| 404 | 自动 |
| RSS 订阅 | `/rss.xml`（中）`/rss-en.xml`（英），**全文输出** |

**检查结果不写死在文档里**：发布或结构性改动前运行 `npm run verify:frontend`，以当次命令的真实输出为准。该门禁覆盖类型检查、单元测试、两种部署路径、站内链接、内容规则与 RSS、分享图和必需页面；阅读设置、评论区等浏览器功能还要补跑对应端到端检查。

**站点已上线**：https://liyukki.github.io/yukki-rui/ （GitHub Pages）与 https://yukki-rui.pages.dev/ （Cloudflare Pages，中英双语、照片、RSS、sitemap 均实测正常）。

**新增：网页后台**。现在可以不碰代码、直接在浏览器里改文章和个人资料了，见第 10 节。

**新增：评论区**。文章页底部可以留言，读者不用注册、不用登录 GitHub；站长在 `/admin/comments/` 删评论，见第 11 节。

**新增：阅读小工具**。文章页有目录、阅读时长、阅读进度条、代码一键复制、图片放大、上一篇/下一篇，见第 12 节。

**新增：搜索与归档**。页头多了「归档」和「搜索」：归档按年份翻旧文，搜索在浏览器里直接查全文（Pagefind 静态索引，不依赖任何服务器），见第 13 节。


**新增:分享图与结构化数据**。每篇文章在构建时自动生成一张 1200×630 的分享图,页面里同时带 JSON-LD 结构化数据——贴链接到微信/X 时卡片用的是文章自己的标题,见第 14 节。

**新增:运营提醒**。有人评论、或草稿躺太久,GitHub 会主动给你开一条提醒 Issue,不用天天翻后台,见第 15 节。

**新增:三个页面**。页头多了「现在 / 作品 / 在听」:记录最近在忙什么、做过的东西、循环中的歌;内容都在网页后台里改,见第 16 节。

**新增:RSS 全文**。两个订阅源不再只给摘要:阅读器里直接显示完整正文,图片和链接都能正常打开,见第 17 节。
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
| `publishAt` | 否 | 定时发布时间，按 UTC 判断（见 2.7）|
| `featured` | 否 | 首页精选置顶，只影响首页（见 2.8）|
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
### 2.7 定时发布（到点才上线）

frontmatter 加 `publishAt`（日期或完整时间戳，GitHub Actions 按 **UTC** 判断）：

```markdown
---
title: 下周一才发的文章
pubDate: 2026-10-21
publishAt: 2026-10-27T09:30:00Z
---
```

规则：

- `publishAt` 留空 = 和以前一样，构建时就发布。
- `YYYY-MM-DD` 表示当天 UTC 00:00；需要精确到分钟时，用带 `Z` 或时区偏移的完整时间戳。
- 到点后的下一次定时检查（约每 30 分钟一次）才会触发重新构建，文章随后出现在列表、标签、RSS、搜索和文章页里。
- 检查器使用 **Git 提交时间**，不是 Actions checkout 生成的文件修改时间；同一篇文章之后又有提交时，会重新判断是否需要部署。
- 到点后工作流先推送一个空提交触发 Cloudflare Pages，再显式调度 `deploy.yml` 触发 GitHub Pages。默认 `GITHUB_TOKEN` 的推送不会自动触发其他 workflow，因此显式调度这一步不能省。
- **`draft: true` 永远优先**：草稿不会因为到了 `publishAt` 被放出来，必须先关掉草稿。
- 本地 `npm run dev` 不做时间过滤，未来的文章也能预览。
- 静态站没有服务端，所以“到点自动出现”依赖 `.github/workflows/publish-scheduled.yml`；如果 GitHub 连续 60 天没有活动，定时任务会被暂停，需要去仓库 Actions 里手动恢复。
- GitHub 的定时任务本身有延迟，通常几分钟到几十分钟，不保证准点。

### 2.8 精选置顶

frontmatter 加 `featured: true`，这篇文章会排在**首页列表最前**（同语言内）。规则：

- 只影响首页列表顺序；标签页、归档、RSS、上下篇仍然按发布日期排，不会乱。
- 精选文章之间仍按发布日期倒序；同一发布时间再按文章 id 升序保证顺序稳定。
- 中英两个版本是两份文件，想两边都置顶就分别加 `featured: true`。
- 后台「文章」列表里有「精选」筛选器，可以直接筛出来。

### 2.9 为什么 RSS 不受精选影响

RSS 的排序契约是**纯时间倒序**：订阅者看到的顺序应该只由发布时间决定。精选只是站内展示优先级，因此 `createFeed()` 直接使用 `getPostsByDate()`；标签页、归档页和上下篇也走同一套日期排序，不再依赖生成后的正则重排。

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

这一条命令跑完全部检查。全绿才往下走。它验证：类型、全部单测、**两种部署路径**下所有页面和链接、Markdown 渲染、RSS 全文输出与地址补全、必需页面、死链。

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

### 6.1 部署现状（两个平台均已上线）

**当前状态**：仓库在 <https://github.com/liyukki/yukki-rui>，两个平台都连着它，**推送即自动构建**：

| 平台 | 地址 | 作用 |
|---|---|---|
| GitHub Pages | <https://liyukki.github.io/yukki-rui/> | 展示（纯静态，无法登录后台）|
| Cloudflare Pages | <https://yukki-rui.pages.dev/> | 展示 + **网页后台** `/admin/` |

已完成的一次性配置：

1. ~~在 GitHub 创建公开仓库并推送~~ ✓
2. ~~仓库 Pages → Source 选 GitHub Actions~~ ✓
3. ~~Cloudflare Pages 连接仓库~~ ✓（构建命令 `npm run verify:frontend`、输出目录 `dist`、环境变量 `SITE_BASE=/`、`SITE_URL=https://yukki-rui.pages.dev/`、`NODE_VERSION=24`）
4. ~~GitHub OAuth App + Cloudflare 环境变量 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`~~ ✓（后台登录用，步骤见 10.2）

| 平台 | `SITE_BASE` | `SITE_URL` |
|---|---|---|
| GitHub Pages | `/yukki-rui/` | `https://liyukki.github.io/yukki-rui/` |
| Cloudflare Pages | `/` | `https://yukki-rui.pages.dev/` |

两个值**不要写进代码**：GitHub Pages 的在 `.github/workflows/deploy.yml` 里按仓库名推导，Cloudflare 的在它自己的项目设置里。

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
| `npm run cms` | 旧后台（Decap）的本地文件桥，只在回滚时用；现在的后台本地编辑改成「使用本地仓库」，不需要它（第 10.1 节）|
| `npm run check:links` | 只查死链（需先 build）|
| `npm run check:base` | 只查两种部署路径 |
| `npm run check:cms-config` | 可选：用真实浏览器加载 `public/admin/config.yml`，确认后台配置没有错误（需先 `npm i -D playwright`，不参与发布检查）|
| `npm run check:cms-oauth` | 可选：用真实 Sveltia 客户端在本地跑一遍后台登录握手（需先 `npm i -D playwright`，不参与发布检查）|
| `npm run check:comments` | 可选：评论区端到端（wrangler 本地 D1；需先 `npm i -D playwright` 与 `npm run build`，不参与发布检查）|
| `npm run check:comments-live` | 可选：线上评论区只读检查（`-- --write` 时连发→查→删一起验）|
| `npm run check:reading` | 可选：阅读体验端到端（需先 `npm i -D playwright` 与 `npm run build`；设 `LIVE_ORIGIN`/`LIVE_BASE` 可跑线上）|
| `npm run check:search` | 可选：搜索与归档端到端（归档分组、Pagefind 检索、无结果文案、索引隔离、移动端；需先 `npm i -D playwright` 与 `npm run build`）|
| `npm run check:og` | 只查分享图与结构化数据(解码每张 PNG 确认不是空白卡片、逐项核对 JSON-LD 字段;需先 build,已包含在 `verify:frontend` 里)|
| `npm run check:pages` | 检查「现在 / 作品 / 最近在听 / 友链」四页(导航、条目、状态徽章、外链、双语对应页、窄屏;需先 build)|

---

## 9. 常见问题

**问：改了文章，线上没变化？**
先确认 `git push` 成功了，再去平台的 Actions/Deployments 页面看构建状态。构建失败会显示原因。

**问：中文标签页的网址为什么是中文？**
标签名直接进网址（如 `/zh/tags/指南/`），这是正常设计。浏览器会自动编码，不影响使用。

**问：想加评论？**
评论区已经做好了：读者填昵称就能发，不用登录。站长在 `/admin/comments/` 删除，详见第 11 节。

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

## 10. 网页后台：不碰代码改内容（Sveltia CMS）

站点自带一个浏览器后台，能编辑**所有文章**和**个人资料**（首页文案、联系方式、第二件作品、关于页自我介绍），不用开编辑器、不用记 frontmatter 格式。

> 后台程序是 **Sveltia CMS**（`public/admin/index.html` 里加载的脚本）。它和之前的 Decap CMS 读同一份 `config.yml`，也继续用同一个 GitHub OAuth App；回滚只要把那个脚本地址换回 Decap 即可（配置不用动）。

### 10.1 本地用（不登录，直接改本地文件）

```bash
npm run dev
```

然后用 **Chromium 系浏览器**（Edge / Chrome；Firefox、Safari 不行，需要 File System Access API）打开
**`http://localhost:4321/admin/index.html`**，点 **「使用本地仓库」**，在弹出的对话框里选中项目根目录
`E:\deepseek\yukki-rui`。之后保存会**直接写进你电脑上的 `src/content/` 文件**，dev 服务器自动刷新，
你立刻能在 `http://localhost:4321/zh/` 看到效果（不需要 `npm run cms`，Sveltia 不支持 decap-server）。

> 注意两点：
> - 本地 dev 模式下 `/admin/`（短地址）会 404，这是 Astro 开发服务器对 public 目录的已知怪癖；用带 `index.html` 的完整地址。线上部署没这个问题。
> - 后台必须放在 `public/admin/index.html` 这种静态文件里，不要做成 `src/pages/admin.astro`——由框架渲染的页面会让 CMS 加载失败。
> - 想让本地保存也直接提交到 git，可在浏览器里授权后进 Settings → Developer 打开「Commit Changes to Git」（需要先 `git config --local user.name/user.email`）。不打开也行，改完照常自己 `git add` + `commit` + `push`。

### 10.2 线上用（任何设备打开网页就能改）

**地址：<https://yukki-rui.pages.dev/admin/>** —— 用你的 GitHub 账号（`liyukki`）登录（按钮写的是**「使用 GitHub 登录」**），保存时 CMS 直接往仓库提交 commit，两个平台自动重新部署，几分钟后生效。手机浏览器同样可用。

一次性配置**已经做完了**（记录在此，换域名或换平台时照做）：

1. **仓库在 GitHub**：<https://github.com/liyukki/yukki-rui>（后台的保存动作 = 往这个仓库 commit）。
2. **`public/admin/config.yml`**：`repo: liyukki/yukki-rui`、`base_url: https://yukki-rui.pages.dev`、`auth_endpoint: /api/auth`。
3. **GitHub OAuth App**（Settings → Developer settings → OAuth Apps）：
   - Homepage URL：`https://yukki-rui.pages.dev`
   - Authorization callback URL：`https://yukki-rui.pages.dev/api/callback`
   - 用它的 **Client ID** 和 **Client Secret** 填下一步。
4. **Cloudflare Pages 环境变量**：项目 Settings → Variables and secrets → Production：
   - `GITHUB_CLIENT_ID`（类型 Text）
   - `GITHUB_CLIENT_SECRET`（类型 **Secret**）
   - 改完必须重新部署一次（Deployments → 最新部署 → Manage deployment → **Retry deployment**）才会生效。
5. 打开 `https://yukki-rui.pages.dev/admin/` → **使用 GitHub 登录** → 授权 → 开始编辑。

**为什么只有 Cloudflare 地址能登录**：换登录令牌需要服务端代码（`functions/api/` 里的两个 Cloudflare Function），GitHub Pages 是纯静态托管跑不了函数。所以**后台固定从 Cloudflare 地址进**；GitHub Pages 那份部署只展示内容。保存的内容两边都会更新（改的是同一个仓库）。

> 从别的地址（例如 `liyukki.github.io/yukki-rui/admin/`）打开后台时，页面底部会自动出现一条提示，告诉你正确地址——因为那种情况下登录按钮点了不会有反应。本机预览不会出现这条提示（本地用「使用本地仓库」，不需要登录）。

> 登录令牌的有效期：创建 OAuth App 时**没有**勾选「Expire user access tokens」，所以登录一次可以长期使用，不用反复登录。想更保守可以去 GitHub 那个 App 的设置里勾上（代价是每 8 小时要重新登录一次）。

### 10.3 后台里能改什么

| 集合 | 内容 | 改完影响 |
|---|---|---|
| 文章 | 全部 `.md` 文章：标题、摘要、日期、语言、标签、草稿、定时发布、精选、正文、插图 | 首页列表、标签页、归档、RSS、文章页 |
| 个人资料 → 中文资料 | 首页一句话介绍/副文案/页尾签名、**形象照片**、联系方式文字+链接列表、第二件作品（标题/介绍/链接/状态）、关于页自我介绍 | `/zh/` 各页 |
| 个人资料 → English Profile | 同上，英文版 | `/en/` 各页 |

#### 怎么写正文（工具栏）

正文编辑器是所见即所得，右栏是实时预览（想放大预览点中间分隔条上的**交换面板**图标，左右对调）。工具栏从左到右：
段落样式（显示「段落」的那个下拉）、**加粗**、*斜体*、~~删除线~~、`代码`、链接、图片、**以 Markdown 编辑**。

- **代码块**：打开样式下拉 → 选 **代码块** → 右上角选语言（默认「纯文本」）。**推荐顺序：先把整篇正文写完，再把光标放到要变成代码的那一段、用样式下拉把它转成代码块**——块后面只要有段落，按 ↓ 就能接着写。反过来，代码块是全文最后一段时光标会留在块里（点下方空白也没用），此时用工具栏的 **以 Markdown 编辑** 在围栏后面另起一段即可。
- **表格**：工具栏没有表格按钮。用 **以 Markdown 编辑** 切到源码模式，手写或粘贴 Markdown 表格，再点一次切回富文本看效果。
- **标题 / 列表 / 引用块**：同一个样式下拉里选。
- **字段提示**：每个字段下面那行小字就是填写说明（草稿开关、中英配对 Key、更新日期等）。

#### 怎么上传照片（实测流程）

**形象照**（首页 + 关于页）：
1. 个人资料 → 中文资料 → 「形象照片」区块 → 点照片字段的 **选择图片**
2. 对话框里把图片**拖进去**，或点 **浏览** 选文件，也可以直接**粘贴**剪贴板里的截图
3. 需要的话填「替代文本」，确认上传
4. 右上角 **保存**（= 提交到仓库）

图片存到 `public/uploads/`；「照片实际像素宽/高」填图片真实尺寸（不确定就 320）。

**文章插图**：
1. 打开一篇文章，光标点到正文里想插图的位置
2. 正文工具栏点**图片**按钮 → 拖入 / 浏览 / 粘贴 → 确认
3. 右上角 **保存**

图片存到 `src/content/posts/images/`，正文自动插入相对路径（`./images/文件名`）。实测两种部署路径都正确：构建时 Astro 会自动优化图片并配好前缀。

几个要点：

- **保存与发布**：这个站用的是「保存即发布」——`保存` 就是把改动提交到仓库，平台随后自动重建（几分钟）。想先存着不发布，把「草稿」开关打开再保存。
- **草稿**：编辑文章时打开「草稿」开关，保存后本地能看到、正式构建自动排除——和第 2.4 节是同一个开关。
- **中英配对**：两篇文章的「中英配对 Key」填同一个值才会互指，规则同第 3.1 节。中英是两个文件，改完一边记得改另一边。
- **字段留空 = 用默认文案**：个人资料里任何字段清空，页面会回落到代码里写的默认文案，不会开天窗。
- **联系方式链接**：链接列表填了就显示成可点击链接（`https://` 或 `mailto:` 开头），空列表则保持"待补充"占位。
- **形象照自动同步**：传一次，中英两边页面都显示（本语言优先，没有就借用另一语言的）。想分语言各用一张，在对应语言的资料里各传一张即可。
- **手机上也能改**：后台在手机宽度下正常显示并保存（字段单列、提示文字保留），但没有键盘快捷键，长文建议还是电脑上写。
- **后台管不到的地方**：站点名称（`src/consts.ts` 的 `SITE`）和评论开关（`COMMENTS`）仍是代码配置；形象照的代码兜底入口是 `HERO_IMAGE`（见 4.1）。

### 10.4 安全边界（CMS 改不坏站）

CMS 保存的数据要经过三道关：

1. **schema 校验**：`src/content.config.ts` 定义了每个字段的类型，CMS 写出的数据过不了校验会在构建期明确报错（哪个文件哪个字段），不会静默出坏页面。
2. **集成测试**：`npm run verify:frontend` 里的 check-content 会实际构建并断言个人资料真的渲染进了首页和关于页、空链接列表不会渲染出坏卡片。
3. **Git 历史**：每次保存都是一个 commit，改错了 `git revert` 就能回滚。

### 10.5 常见问题

**问：本地后台点了「使用本地仓库」没反应 / 报错？**
Firefox、Safari 不支持 File System Access API，请用 Edge 或 Chrome 打开；地址要用完整的 `http://localhost:4321/admin/index.html`（短地址 `/admin/` 在 dev 下会 404）。回滚到旧后台（Decap）时才需要 `npm run cms` 那条命令。

**问：代码块写完，光标怎么继续往下写？**
代码块后面还有段落时，按 ↓ 就出来了。如果代码块是全文最后一个块，光标会留在块里：用样式下拉选「段落」能出来，但代码块会变成普通段落（代码要重贴）；稳妥做法是点 **以 Markdown 编辑** 切到源码，在围栏（```）后面另起一段。最省事的习惯是：先把整篇正文写完，最后回头把某一段转成代码块。

**问：想插表格？**
工具栏没有表格按钮，用**以 Markdown 编辑**手写/粘贴 Markdown 表格，再切回富文本。

**问：线上登录弹窗报 `GITHUB_CLIENT_ID 未配置`？**
第 10.2 节第 4 步的环境变量没配或没重新部署。

**问：线上登录后提示仓库不存在？**
`config.yml` 里的 `repo` 没改成你的真实仓库，或 OAuth App 授权的账号没有这个仓库的写权限。

**问：线上点了「使用 GitHub 登录」没反应（弹窗闪一下就没了）？**
先看地址栏：登录只在 Cloudflare 地址有效，从 GitHub Pages 那份 `/admin/` 进会没反应——页面底部会有提示条写出正确地址。地址对的话，再确认 Cloudflare 环境变量 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` 配好并重新部署过（见 10.2 第 4 步）。

**问：改完配置后后台打不开，只显示「CMS 配置中存在错误」？**
新后台对配置更严格：`media_folder` / `public_folder` 必须是以 `/` 开头的绝对路径，file collection 的 `name` 不能带点号。改完可以跑 `npm run check:cms-config`（需先装 playwright）确认没有配置错误。

**问：在后台改了内容，前台没变？**
本地模式：确认文件确实被改了（`git status` 能看到），dev 服务器会自动刷新。线上模式：保存 = 提交 commit，等平台重新部署完（GitHub Actions / Cloudflare 部署记录可查），通常几分钟。

---

## 11. 评论区与评论管理

文章页底部有评论区：**不用注册、不用登录 GitHub、不用第三方账号**，填个昵称和正文就能发。评论不放在 Git 仓库里，而是存在 Cloudflare D1 数据库，所以 Sveltia 后台（第 10 节）里看不到评论——评论有独立的管理页。

### 11.1 评论存在哪、怎么运转

| 部分 | 位置 |
|---|---|
| 数据 | Cloudflare D1（SQLite），表 `comments`：昵称、正文、可选网址、时间、文章路径、IP 哈希（不存原始 IP）|
| 接口 | `functions/api/comments.js`（公开读/写）、`functions/api/comments-admin.js`（管理，需要令牌）|
| 前端 | `src/components/Comments.astro` + `src/lib/comments.ts`（文章页自动出现）|
| 管理页 | `public/admin/comments/index.html`，线上地址 `/admin/comments/` |

防护（都在服务端，改成绕过前端也没用）：

- 蜜罐字段：机器人只要填了隐藏字段就拒收；
- 提交过快：从页面加载到点「发表」不足 1.5 秒拒收；
- 限流：同一 IP 60 秒只能发 1 条，24 小时最多 20 条；
- 长度：昵称 1–40 字、正文 1–2000 字、网址必须 `http(s)://` 开头（可留空）；
- 渲染：所有内容按纯文本插入页面，`<img onerror>` 之类只会显示成文字，执行不了。

两个平台都能看到、都能发：Cloudflare 上是同源请求；GitHub Pages 镜像没有 Functions，会跨域调主站（服务端 CORS 白名单只放行站点域名与本机预览），数据都落在主站。

### 11.2 Cloudflare 侧配置（已完成，改动时参考）

平时不用再动；迁到别的账号、重建项目或本次代码更新后，部署前必须确认下面四项齐全：

1. **建 D1 数据库**：Cloudflare 控制台 → Workers & Pages → **D1** → Create database，名字填 `yukki-rui-comments`。
2. **给 Pages 项目绑定**：Workers & Pages → `yukki-rui` → Settings → **Functions** → D1 database bindings → Add binding，**Variable name 必须是 `DB`**，再选刚建的库。
3. **加管理令牌**：同页 Settings → Variables and secrets → Add，name `COMMENTS_ADMIN_TOKEN`，值随便一串长随机字符（Type 选 Secret）。
4. **加评论哈希盐（必填）**：同页再加 `COMMENTS_SALT`（Type 选 Secret），同样使用一段独立的长随机值。它用于给 IP 哈希加盐；缺失时评论和 reactions 接口会返回 `503 salt-missing`，不会退回复用管理令牌或无盐哈希。

上述绑定和变量加完后，点 **Retry deployment** 重新部署一次。修改 `COMMENTS_SALT` 只会改变之后的 IP 限流哈希，不会删除已有评论；但更换后旧的限流记录不再对应新哈希。

令牌只在配置时出现一次，请自己存到密码管理器里；丢了不要紧，在 Cloudflare 里重新生成一个、再把管理页里存的旧值换掉即可（评论数据不受影响）。

自检：`npm run check:comments-live`（只读，检查两个平台的渲染、接口、CORS 和管理页）；想连「发一条再删掉」一起验，设 `COMMENTS_ADMIN_TOKEN` 后加 `-- --write`。

### 11.3 怎么删评论（管理页）

打开 <https://yukki-rui.pages.dev/admin/comments/>（网页后台右下角也有「💬 评论管理」入口）：

1. 第一次填 `COMMENTS_ADMIN_TOKEN` 的值，点「保存并加载」——令牌只存在这台设备的浏览器里，不会上传。
2. 列表先显示最近 50 条评论，点「加载更多」可继续按游标读取更早的评论，不再有 200 条硬上限；文章路径、昵称、时间、正文都能看到，可按路径/昵称/正文筛选。
3. 筛选只作用于**当前已经加载**的评论；要找更早的评论，先点「加载更多」。
4. 点「删除 #编号」确认即可；删除根评论会连同其直接回复一起隐藏。只有删除后重新加载列表成功，页面才显示“已删除”，前台刷新后消失。

### 11.4 常见问题

- **「评论加载失败，稍后再试」**：多半是 D1 还没绑定（11.2 第 2 步）或那次部署没成功；点重试。
- **「发得太快了，歇一分钟再来」**：60 秒限流，正常现象。
- **「评论服务还没配置好」**：公开评论和 reactions 依赖 D1 binding `DB` 与 `COMMENTS_SALT`；缺任意一项，发布评论和读取 reactions 会返回 `503 salt-missing` / `503 db-missing`。`COMMENTS_ADMIN_TOKEN` 只影响管理页，不应拿来当盐。
- **想整体关掉评论区**：把 `src/consts.ts` 里 `COMMENTS.enabled` 改成 `false` 再推送，页面就不再渲染评论区、也不发请求。
- **想换成别的评论系统**：改 `src/components/Comments.astro` 和 `src/lib/comments.ts` 两个文件就行，别处不依赖具体实现。

**回复与互动**：

- 读者可以点任意一条评论下的「回复」，形成**单层回复**（回复不能再被回复），回复平铺在原评论下面，不单独占用分页名额。
- 站长在管理页**删除根评论时，会连同它的回复一起隐藏**（服务端标记 `hidden = 1`，数据保留，便于以后恢复）；删除单条回复只会隐藏那一条。
- 每条评论有三种固定反应：赞 / 喜欢 / 有用。同一个 IP 对同一种反应只记一次，再点一次是取消。
- 反应**不会**进入 Issue 通知，避免每点一次就刷屏。
- **已知精度上限**：同一个 NAT / 校园网出口会被当成同一来源，可能少计；机器人仍可能刷量。这套机制只求“轻量参与”，不追求精确统计。

---

## 12. 读文章时的小工具

这些是读者在文章页会看到的功能，**不需要任何配置**，文章写完就自动生效：

| 功能 | 读者看到的样子 | 说明 |
|---|---|---|
| 目录 | 宽屏时在文章右侧常驻；窄屏时收在正文上方，点一下展开 | 由正文里的 `##` / `###` 标题自动生成，少于 2 个标题时不显示 |
| 阅读时长 | 标题下方「约 3 分钟」 | 中文按约 300 字/分钟、英文按约 200 词/分钟估算，向上取整 |
| 阅读进度 | 页面顶部一条随滚动变长的细线 | 纯视觉提示，不影响阅读 |
| 代码复制 | 代码块右上角「复制」按钮 | 手机上也能用；复制失败会显示「复制失败」 |
| 图片放大 | 点正文里的图片，全屏显示原图，Esc 或点空白处关闭 | 键盘 Enter / 空格也能打开 |
| 返回顶部 | 往下读一屏后，右下角出现 ↑ | 点击平滑回到顶部 |
| 上一篇 / 下一篇 | 文章末尾两张卡片 | 按发布日期算：更早的一篇是「上一篇」，更新的一篇是「下一篇」 |

写法上要注意的几点：

- **想让小标题出现在目录里，用 `##` 或 `###`**；`#` 一级标题不要用在正文里（页面标题已经是一级标题）。标题文字改了没关系，目录每次构建都会重算。
- 文章里插图不用管尺寸（见 2.3 节），放大会按原图比例显示。
- 文章太短、没有小标题时，目录会自然隐藏，不算错误。
- **隐私**：首页联系方式里原先明文公开的 QQ 与微信已经从页面删除，改成指向评论区和 X；以后想公开再加（4.2 节）。

想改文案或样式：文案在 `src/consts.ts` 的 `UI.zh` / `UI.en` 里（`toc`、`readingTime`、`copyCode`、`backToTop` 等键），颜色自动跟主题变量走。
### 12.1 阅读设置

文章页正文上方有一个「阅读设置」面板，三组按钮各自独立：

| 分组 | 档位 | 说明 |
|---|---|---|
| 字号 | 小 / 中 / 大 | 只改正文，不影响标题的像素字体 |
| 行高 | 紧凑 / 标准 / 宽松 | 长文阅读舒适度 |
| 正文宽度 | 窄 / 标准 / 宽 | 宽屏时控制每行字数 |

选择保存在浏览器 `localStorage`（键名 `reading-settings`），刷新和站内跳转后仍然生效；换设备或清空浏览器数据会回到默认。隐私模式或存储配额不足导致写入失败时，本次页面会话仍会保留刚选的档位，不会静默回滚；刷新后无法持久化时才回到默认，也不报错。

### 12.2 相关文章

文章底部会按**标签重合度**推荐最多 3 篇同语言文章：重合标签越多越靠前，重合数相同按发布时间倒序。

- 只推荐已发布文章，不会推荐草稿，也不会推荐自己。
- **一篇文章和当前文章没有任何共同标签时，整个区块不显示**，避免为了“有推荐”而硬凑。
- 推荐区块带 `data-pagefind-ignore`，不会污染站内搜索的正文索引。
- 想提高推荐质量，最直接的办法是给文章认真打标签（2.2 节与后台「标签」字段）。

---

## 13. 搜索与归档

页头导航现在是「首页 / 现在 / 作品 / 在听 / 归档 / 标签 / 搜索 / 关于」，中英两套各自独立。

| 页面 | 做什么 | 地址 |
|---|---|---|
| 归档 | 按年份列出全部已发布文章，新的年份在上、组内按日期倒序 | `/zh/archive/`、`/en/archive/` |
| 搜索 | 输入关键词即搜标题与正文，结果可点进文章；结果为空会提示「没有找到相关内容」 | `/zh/search/`、`/en/search/` |

**搜索是怎么实现的**：用 [Pagefind](https://pagefind.app/) 在 `npm run build` 末尾对 `dist/` 做一次静态索引，生成 `dist/pagefind/`。范围是「构建时已经存在」的文章，所以：

- 不需要服务器、不需要数据库，**Cloudflare 和 GitHub Pages 两个站点都能用**（索引随构建产物一起部署）。
- 新增/修改文章后，**先构建再部署**，搜索才会更新；`npm run dev` 本地开发时不产索引，搜索页会提示「搜索暂时不可用」，这是正常的，跑一次 `npm run build` 即可。
- 草稿（`draft: true`）不进索引；评论、目录、上一篇/下一篇这些界面元素也不进索引，只索引文章正文。

**改文案**：`src/consts.ts` 的 `UI.zh` / `UI.en` 里 `search`、`archive`、`searchHint`、`searchPlaceholder`、`searchEmpty`、`searchError`、`archiveHint`、`archiveCount` 这几项。

**发布前自查**：`npm run build && npm run check:search`，或对线上跑 `LIVE_ORIGIN=https://yukki-rui.pages.dev LIVE_BASE=/ npm run check:search`。

---

## 14. 分享图与结构化数据

在微信 / X / 群里贴文章链接时,平台会抓一张卡片图。现在**每篇文章都有自己的一张**(像素风,和站点同一套配色与字体),页面里还带一份 JSON-LD 结构化数据(给搜索引擎看的机器可读信息)。

| 部分 | 位置 | 说明 |
|---|---|---|
| 卡片外观 | `src/lib/og.ts` | 1200×630、配色、字号,以及标题/摘要的字数上限(中文 20/40,英文 52/88)|
| 生成时机 | 构建期(`npm run build`)| `src/pages/og/[...slug].png.ts` 用 satori + resvg 出图,产物在 `dist/og/`;两个平台都不需要额外服务 |
| 字体 | `src/assets/fonts/ark-pixel-12px-proportional-zh_hans.ttf` | Ark Pixel 12px(OFL 授权);只用于构建,不进产物、不占访客带宽 |
| 结构化数据 | 文章页 `BlogPosting`、首页 `WebSite` | 组件是 `src/components/JsonLd.astro` |

**改外观**:配色在 `src/lib/og.ts` 顶部的 `COLORS`;字号都取 12 的整数倍(像素字体在整数倍下最清晰)。想换字体:把 ttf 放进 `src/assets/fonts/`,再改 `src/pages/og/[...slug].png.ts` 里的文件名(satori 不支持 woff2)。

**图上的网址**来自 `SITE_URL`:线上是各平台的域名,本地构建默认是 `localhost:4321`,所以本地预览看到 localhost 是正常的。

**发布前自查**:`npm run build && npm run check:og`——它会解码每张 PNG 确认不是空白卡片,再核对 JSON-LD 字段;已包含在 `npm run verify:frontend` 里。

---

## 15. 运营提醒:新评论通知与草稿提醒

不想天天翻后台?仓库里有一个定时工作流(`.github/workflows/ops-reminders.yml`)替你看两件事:

| 提醒 | 什么时候 | 出现在哪 |
|---|---|---|
| 新评论 | 每 30 分钟查一次 | 固定的 GitHub Issue「新评论提醒」,新评论以评论形式追加进去 |
| 草稿躺太久 | 每周一早上 | Issue「草稿提醒:待发布的文章」;草稿处理完后这条 Issue 会自动关闭 |

- **已读位置**记在 Issue 正文的 HTML 注释里(`<!-- lastId: N -->`),不需要额外的数据库;第一次运行只看最近 45 分钟,不会把历史评论一次性刷出来。
- **想在手机上收**:仓库 Settings → Secrets → 新增 `NTFY_TOPIC`(随便取一个 32 位随机串当密码),手机装 [ntfy](https://ntfy.sh/) App 订阅同一个名字。不配就只在 Issue 里提醒。
- **必需密钥**:`COMMENTS_ADMIN_TOKEN`(已于 2026-10-19 配好);评论区还需要 Cloudflare Pages 上的 `COMMENTS_SALT` Secret。
- **想立刻跑一次**:`gh workflow run ops-reminders.yml -f job=comments`(也可以 `job=drafts` 或 `job=auto`)。
- **想改频率 / 想关掉**:改工作流里的 `cron`,或在 GitHub 的 Actions 页面禁用这个工作流。
- **两个注意点**:公开仓库的 Issue 也是公开的(评论本来就公开在页面上);仓库连续 60 天没有活动时 GitHub 会自动暂停定时任务,有新提交后恢复。

## 16. 现在 / 作品 / 最近在听 / 友链

页头导航现在是「首页 / 现在 / 作品 / 在听 / 友链 / 归档 / 标签 / 搜索 / 关于」。新增的四页都是**构建期静态页**,内容存在 `src/content/site/pages/` 下,网页后台里就能改,不用碰代码。

| 页面 | 地址 | 内容 |
|---|---|---|
| 现在 | `/zh/now/`、`/en/now/` | 最近在忙什么,可带「更新于」日期 |
| 作品 | `/zh/works/`、`/en/works/` | 做过的东西,可带状态徽章(筹备中 / 已上线 / 暂停)与外链 |
| 最近在听 | `/zh/listening/`、`/en/listening/` | 循环中的歌,带序号与艺人 |
| 友链 | `/zh/friends/`、`/en/friends/` | 常去看的站点,卡片可带简介与外链 |

**怎么改**:后台 → 独立页面 → 选对应语言的那一份,改「引言」和「条目」列表即可:

- 条目的**标题必填**;没填标题的条目不会显示(后台点了「添加」但没填的半成品不会把页面弄脏)。
- 链接要**文字 + 地址都填**才会出现,只填一半就当作没填。
- 「更新日期」填了才会显示成「更新于 …」。
- 某个语言没有条目时会显示兜底文案,不会开天窗。

**发布前自查**:`npm run build && npm run check:pages`(浏览器里核对导航、标题、条目、状态徽章、外链、双语对应页与窄屏布局);线上:`LIVE_ORIGIN=https://yukki-rui.pages.dev LIVE_BASE=/ npm run check:pages`。

---

## 17. RSS 订阅(全文输出)

`/rss.xml`(中)和 `/rss-en.xml`(英)现在输出**完整正文**:在阅读器里(Feedly、Inoreader、NetNewsWire 等)直接读全文,不用点回网站;列表里仍显示摘要。

| 部分 | 位置 | 说明 |
|---|---|---|
| 入口 | `src/pages/rss.xml.ts`、`src/pages/rss-en.xml.ts` | 中英各一路,地址跟着部署环境自动变成 `https://.../` 或 `https://.../yukki-rui/` |
| 正文生成 | `src/lib/feed.ts` | 用 Astro 自己的渲染管线(Container API)渲染每篇文章,所以代码高亮、优化后的图片、扩展语法都和网页端一模一样 |
| 地址补全 | `src/lib/feed-html.ts` | 订阅器没有「当前页面」概念,正文里的图片和站内链接必须补成绝对地址(含部署前缀),否则阅读器里图片会 404;作者手写的 `/zh/about/` 根路径会补上部署 base,已经带前缀的地址不会重复加,`srcset` 里的 `data:` 地址也不会被逗号拆坏 |
| 摘要 | 文章 `description` 字段 | 阅读器列表里显示的那句话;正文单独放在 `content:encoded` |

**排序**:RSS 与归档、标签页、上下篇一样使用纯时间倒序;精选置顶只影响首页。同一发布时间按文章 id 升序,顺序稳定。

**发布前自查**:`npm run verify:frontend`(其中的 `check:content` 会在两种部署路径下分别断言中英 RSS:正文是渲染后的 HTML、根路径链接与图片带站点前缀、`srcset` 保持完整、没有残留的站内相对地址)。

**改什么会影响订阅**:文章标题、摘要、日期、正文都会进订阅源,改了推送即可;`draft: true` 的文章不进订阅源。阅读器有缓存,新文章可能不会立刻出现,手动刷新订阅即可。

---

## 18. 还缺什么

**上线工作已全部完成**：两个平台在跑，网页后台可以登录并改内容（新建/删除文章都已实测，提交真的进了仓库）。

剩下都是可选项：

- **个人素材**：想换真实的自我介绍、邮箱、社交账号、第二件作品，直接在后台「个人资料」里改，不用碰代码（第 4 节）。

- **看访问量**:已于 2026-10-19 开通 Cloudflare Web Analytics(免费、无 cookie)。控制台 → Web analytics → `yukki-rui.pages.dev`;两个平台的访问汇总在一起。脚本与开关在 `src/consts.ts` 的 `WEB_ANALYTICS`(token 是公开的,不是密钥);想关掉把 `enabled` 改成 false。
- **加友链**:后台 →「独立页面」→「友链(中文 / English)」,新增条目并填站点名、简介、链接文字与地址即可。
- **想换域名**：见第 7 节，注意还要同步改 GitHub OAuth App 的两个地址和 `config.yml` 的 `base_url`。
- **可选功能**：给英文页单独换一张形象照（10.3）。
- **本轮已补齐**：定时发布 + 精选置顶（2.7–2.9）、阅读设置 + 相关文章（12.1–12.2）、评论回复 + 表情反应（第 11 节）、独立友链页（第 16 节）。

日常只用记两件事：写内容用后台，或者本地写好 `git push`。
