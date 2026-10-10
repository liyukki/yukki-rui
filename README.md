# yukki rui

一个中英双语、零成本的静态个人博客。不买服务器，不买域名。

- 文章是 Markdown 文件，提交后自动构建成静态 HTML
- 同时发布到 GitHub Pages 与 Cloudflare Pages 两个免费地址
- 两个地址都是平台赠送的二级域名，**都不需要备案**

## 快速开始

```bash
npm install
npm run dev
```

本地预览默认地址：http://localhost:4321/zh/

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发（草稿文章也能预览） |
| `npm run build` | 构建生产产物到 `dist/`（草稿不会产出页面） |
| `npm run preview` | 用生产产物起本地服务 |
| `npm test` | 跑数据层与工具的单测 |
| `npm run check:links` | 检查构建产物的站内链接是否有死链 |
| `node scripts/check-base-parity.mjs` | 验证两个部署路径（`/` 与 `/yukki-rui/`）都正确 |

## 目录结构

```
src/
├─ consts.ts            站名、导航、界面文案、评论区开关
├─ content.config.ts    文章 frontmatter 的 schema（改字段要同步改 lib/post-select.ts）
├─ content/posts/       文章（纯 Markdown，扁平存放，语言由 frontmatter 决定）
├─ lib/
│  ├─ post-select.ts    纯函数数据层（筛选、排序、标签、译文查找），被单测覆盖
│  ├─ posts.ts          集合读取包装
│  └─ url.ts            站内链接助手（withBase / langHref / postHref / tagHref）
├─ components/          Astro 组件
├─ layouts/             页面骨架
├─ pages/               路由
└─ styles/              设计令牌与全局样式
scripts/                构建产物检查工具
tests/                  单元测试
```

## 写一篇文章

在 `src/content/posts/` 新建一个 `.md` 文件，frontmatter 必须包含这些字段：

```markdown
---
title: 文章标题
description: 一句话摘要，用于列表页、搜索结果和 RSS（建议加引号）
pubDate: 2026-10-20
lang: zh
tags: [随笔]
---

正文从这里开始。
```

可选字段：

| 字段 | 说明 |
|---|---|
| `updatedDate` | 更新日期，会显示在标题下面 |
| `draft: true` | 草稿。`npm run dev` 能看到，`npm run build` 完全不产出 |
| `translationKey` | 同一篇文章的不同语言版本填**同一个值**，语言切换按钮就会互跳 |

**关于英文版**：不是每篇都必须有译文。没有译文的文章，语言切换按钮会跳到英文首页 —— 这是正常行为，不是错误。

## 上线

1. **建仓库**：在 GitHub 建一个空仓库 `yukki-rui`（公开，**不要**勾选初始化 README）
2. **推送**：

   ```bash
   git remote add origin https://github.com/<你的用户名>/yukki-rui.git
   git push -u origin main
   ```

3. **开启 GitHub Pages**：仓库 Settings → Pages → Source 选 **GitHub Actions**
4. **连接 Cloudflare Pages**：Cloudflare 后台 → Workers & Pages → Create → Pages → 连接该仓库
   - 构建命令：`npm run build`
   - 输出目录：`dist`
   - 环境变量：`SITE_BASE` = `/`
5. **改真实地址**：把 `src/consts.ts` 里的 `SITE.url`、`public/robots.txt` 里的 `Sitemap` 行改成你的真实地址

## 上线检查清单

- [ ] `npm test` 全绿
- [ ] `npm run build` 成功
- [ ] `node scripts/check-base-parity.mjs` 输出 5 个 ✓
- [ ] 两个地址都亲手打开过（GitHub Pages 与 Cloudflare Pages）
- [ ] 手机宽度下看过首页与一篇文章
- [ ] 明暗切换能用，刷新后保持
- [ ] RSS（`/rss.xml`）能被阅读器解析
- [ ] `src/consts.ts` 与 `public/robots.txt` 里没有残留 `example` 字样

## 以后想加的东西

**评论区**：把 `src/consts.ts` 里的 `COMMENTS.enabled` 改成 `true`，装 giscus App，填好 `repo` / `repoId` / `categoryId` 三项即可。在此之前 `Comments.astro` 渲染 `null`，不产生任何第三方请求。

**自己的域名**：买一个几十块一年的域名，在 GitHub Pages 和 Cloudflare Pages 后台各加一次 CNAME 就行。**不需要改任何代码。**
