# 评论区实现计划（Cloudflare D1 + Pages Functions）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给文章页加一个免登录、免费、无第三方的评论区（Cloudflare D1 存储），并带站长管理页。

**Architecture:** 前端 `Comments.astro` 直接 fetch Pages Functions；`functions/api/comments.js` 负责公开的列表/新建，`functions/api/comments-admin.js` 负责令牌鉴权的查看/删除；数据落 D1（SQLite）。GitHub Pages 镜像用绝对地址跨域访问主站 API。

**Tech Stack:** Astro 7、TypeScript、Cloudflare Pages Functions（ES module `onRequest*`）、Cloudflare D1、vitest、Playwright（已有，可选）。

## Global Constraints

- 门禁命令：`npm run check`、`npm test`、`npm run verify:frontend`、`npm run check:cms-config`、`npm run check:cms-oauth`（后两个需要 `$env:CMS_OAUTH_CHROME`）。
- 站点支持两种 base：Cloudflare `/`、GitHub Pages `/yukki-rui/`；所有渲染期 URL 都要经 `withBase()`/`import.meta.env.BASE_URL`，评论 thread 必须去掉 base。
- 评论渲染只用 `textContent`，禁止 innerHTML 拼接。
- 不引入任何第三方评论服务、追踪脚本或新的运行时依赖；`package.json` 依赖零新增。
- 所有交互文案中英双语（`src/consts.ts` 的 `UI`）。
- 不使用内联事件属性（`onclick=`），脚本集中在 `<script>` 里。
- 线上数据源固定 `https://yukki-rui.pages.dev`；同源（Cloudflare 域名、localhost）走相对路径。

---

### Task 1: 构建期助手 + 单测

**Files:**
- Create: `src/lib/comments.ts`
- Test: `tests/comments.test.ts`

**Interfaces:**
- Produces:
  - `commentThread(pathname: string, base: string): string` — 去掉 base、合并多余斜杠、保证首尾斜杠；非法返回 `/`。
  - `commentsEndpoint(siteOrigin: string, productionOrigin: string): string` — 构建期返回空串（同源）或绝对 URL（跨源部署）。
  - `formatCommentTime(iso: string, lang: 'zh' | 'en'): string` — 客户端可复用的时间文案（`Intl.DateTimeFormat`，无效输入返回 ''）。

- [ ] **Step 1: 写失败测试**（`tests/comments.test.ts`：`commentThread('/zh/posts/a/', '/')` → `/zh/posts/a/`；`commentThread('/yukki-rui/zh/posts/a/', '/yukki-rui/')` → `/zh/posts/a/`；`commentThread('/zh//posts/a', '/')` → `/zh/posts/a/`；`commentThread('nope', '/')` → `/`；`commentsEndpoint('https://yukki-rui.pages.dev','https://yukki-rui.pages.dev')` → `''`；`commentsEndpoint('https://liyukki.github.io','https://yukki-rui.pages.dev')` → `'https://yukki-rui.pages.dev/api/comments'`；`formatCommentTime('bad','zh')` → `''`）
- [ ] **Step 2: 运行 `npx vitest run tests/comments.test.ts` 确认失败**
- [ ] **Step 3: 实现 `src/lib/comments.ts`**
- [ ] **Step 4: 重跑确认通过**
- [ ] **Step 5: 提交**（`git add src/lib/comments.ts tests/comments.test.ts`）

### Task 2: 公开 API + 管理 API + Functions 单测

**Files:**
- Create: `functions/api/comments.js`、`functions/api/comments-admin.js`
- Create: `tests/helpers/fake-d1.ts`（`node:sqlite` 实现的 D1 替身：`prepare().bind().first()/all()/run()`、`exec()`）
- Test: `tests/comments-functions.test.ts`

**Interfaces:**
- `functions/api/comments.js` 导出 `onRequestGet`、`onRequestPost`、`onRequestOptions`，并导出纯助手供测试：`normalizeThread(raw)`, `validateNewComment(input)`, `clampLimit(raw)`, `corsHeaders(origin)`, `toView(row)`, `sha256Hex(text)`, `ensureSchema(db, state)`, `ALLOWED_ORIGINS`。
- `functions/api/comments-admin.js` 导出 `onRequestGet`、`onRequestDelete`、`onRequestOptions`，助手 `tokenMatches(expected, got)`。
- 常量：`AUTHOR_MAX=40`, `BODY_MAX=2000`, `WEBSITE_MAX=200`, `PAGE_SIZE_DEFAULT=20`, `PAGE_SIZE_MAX=50`, `MIN_ELAPSED_MS=1500`, `RATE_WINDOW_MAX=1/60s`, `RATE_DAY_MAX=20/24h`。
- D1 表：`comments(id, thread, author, body, website, created_at, ip_hash, user_agent)`（见设计文档第 4 节）。

- [ ] **Step 1: 写失败测试**（覆盖：GET 分页与 `nextBefore`、thread 非法 400、POST 201 入库、蜜罐/超时/超长 400、同 IP 60 秒第二条 429、admin 无令牌 401、令牌错误 401、未配置令牌 503、DELETE 后 GET 不再出现、OPTIONS 204 + CORS 头、无 DB 503、`toView` 不泄漏 ip_hash）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现两个 Functions 文件**
- [ ] **Step 4: 重跑确认通过**
- [ ] **Step 5: 提交**

### Task 3: 评论区组件 + 配置 + 文案

**Files:**
- Modify: `src/consts.ts`（`COMMENTS` 改为 `{ enabled: true, origin: 'https://yukki-rui.pages.dev', pageSize: 20 }`；`UI[lang]` 增加 `comments` 相关文案）
- Modify: `src/components/Comments.astro`（重写：服务端渲染标题/列表骨架/表单 + 客户端 `<script>`；`data-thread`、`data-api`、`data-lang`、`data-page-size`）
- Test: `tests/frontend-readiness.test.ts` 现有断言保持通过（必要时只加断言，不改行为）

**Interfaces:**
- Consumes: `commentThread`、`commentsEndpoint`（Task 1）。
- Produces: DOM 契约（`#comments`、`[data-comments-count]`、`[data-comments-list]`、`form[data-comment-form]`、`[data-comments-status]`、`button[data-load-more]`）供 Task 5 的 E2E 使用。

- [ ] **Step 1: 改 `consts.ts`（配置 + 中英文案）**
- [ ] **Step 2: 重写 `Comments.astro`**：列表渲染、表单（昵称/网址/正文 + 蜜罐 + 计时）、加载中/空/错误/加载更多、限流与校验错误文案、localStorage 记昵称、样式全部用 tokens 变量、390px 自适应
- [ ] **Step 3: `npm run check` + `npm test` + `npm run build` 确认通过**
- [ ] **Step 4: 提交**

### Task 4: 站长管理页

**Files:**
- Create: `public/admin/comments/index.html`（静态：令牌输入、最近评论列表、删除按钮、错误提示、noindex）

**Interfaces:**
- Consumes: `GET/DELETE /api/comments-admin`（Task 2）。

- [ ] **Step 1: 写页面**（风格与 `public/admin/index.html` 一致；令牌存 `localStorage['comments-admin-token']`）
- [ ] **Step 2: 本地 `wrangler pages dev` 冒烟：无令牌跟有令牌各一次**
- [ ] **Step 3: 提交**

### Task 5: 端到端检查脚本

**Files:**
- Create: `scripts/check-comments.mjs`
- Modify: `package.json`（`"check:comments": "node scripts/check-comments.mjs"`）
- Modify: `.gitignore`（加 `.wrangler/`）

- [ ] **Step 1: 写脚本**：`npm run build`（dist 缺失时）→ `npx wrangler pages dev dist --port 8788 --persist-to .tmp-comments-check --d1=DB=comments_dev --binding COMMENTS_ADMIN_TOKEN=test-token --binding COMMENTS_SALT=test-salt` → Playwright 打开 `/zh/posts/<任一文章>/` → 发评论 → 断言立刻可见 → 刷新仍在 → XSS 串按文本显示 → 管理 API 删除 → 刷新消失 → 退出码 0/1
- [ ] **Step 2: 跑通 `npm run check:comments`**
- [ ] **Step 3: 提交**

### Task 6: 文档

**Files:**
- Modify: `README.md`（命令表 + 功能列表）
- Modify: `docs/usage-guide.md`（§9 评论已开启；§10 新增「怎么管理评论」与本地全栈调试；关闭方法 = `COMMENTS.enabled=false`）
- Modify: `docs/verification-report.md`（新增「免登录评论区（DSH，2026-10-18）」章节：架构、免费额度、验证记录）
- Modify: `docs/frontend-handoff.md`（`Comments.astro` 说明更新）

- [ ] **Step 1: 改文档**
- [ ] **Step 2: 提交**

### Task 7: 上线与验收

**前置（站长操作，逐条指引）：**

1. Cloudflare → Storage & Databases → D1 → Create database `yukki-rui-comments`。
2. Pages 项目 `yukki-rui` → Settings → Functions → D1 database bindings → Add：`DB` → 选库 → Save。
3. Settings → Variables and secrets → 新增 `COMMENTS_ADMIN_TOKEN`（Secret，随机长串）→ Save → Retry deployment。

- [ ] **Step 1: 推送代码 → GitHub Actions 成功 → Cloudflare 新部署成功**
- [ ] **Step 2: 线上发一条评论 → 刷新仍在 → 镜像站同篇可见 → `/admin/comments/` 删除**
- [ ] **Step 3: 复跑全部门禁，更新 verification-report 的线上记录，提交收尾**
