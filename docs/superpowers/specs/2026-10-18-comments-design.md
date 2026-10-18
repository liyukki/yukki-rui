# 评论区设计（免登录、免费、无第三方）

- 日期：2026-10-18
- 状态：已与站长确认方向（Cloudflare 自建），待实现
- 相关：`src/components/Comments.astro`、`src/consts.ts`、`functions/api/`、`docs/usage-guide.md` §9/§10

## 1. 背景与目标

站点是 Astro 静态站，双部署：Cloudflare Pages（主站，有 Functions 与后台）与 GitHub Pages（镜像，纯静态）。
早先 `src/consts.ts` 的 `COMMENTS` 开关是关的，`Comments.astro` 里预埋了 giscus。站长要求：**开启评论，并且不要求评论者登录 GitHub**。

目标：

1. 读者只需填「昵称 + 正文」即可评论，不注册、不登录、不填邮箱。
2. 完全免费、无第三方评论服务、无追踪脚本；数据存在站长自己的 Cloudflare 账号里。
3. 文章页底部出现一个与站点像素风主题一致的「评论区」板块（深浅色自适应、窄屏可用）。
4. 站长能查看与删除评论（含防刷机制），不写代码就能管理。

## 2. 非目标（本期不做）

- 楼中楼回复 / 点赞 / 表情包 / Markdown 渲染 / 邮件通知。
- 评论先审后发（当前是「先发 + 可删除」；若垃圾评论变多再启用审核或 Turnstile）。
- 评论数统计、文章列表显示评论数、RSS 里带评论。
- 迁移历史 giscus 数据（从未开启过，没有历史数据）。

## 3. 架构

```
浏览器（文章页 Comments.astro 客户端脚本）
   │  fetch JSON
   ▼
Cloudflare Pages Functions（仅 Cloudflare 部署执行）
   ├─ functions/api/comments.js        公开：GET 列表 / POST 新建（+ OPTIONS 预检）
   └─ functions/api/comments-admin.js  管理：GET 最近评论 / DELETE 删除（Bearer 令牌）
   │  env.DB（D1 绑定）
   ▼
Cloudflare D1（SQLite）表 comments
```

- GitHub Pages 镜像没有 Functions：前端对非同源部署自动改用绝对地址
  `https://yukki-rui.pages.dev/api/comments`（走 CORS 白名单），两个站点共用同一份评论。
- `/admin/comments/` 是纯静态管理页（`public/admin/comments/index.html`），只调管理 API。

## 4. 数据模型

D1 数据库名 `yukki-rui-comments`，绑定变量名 `DB`。首次请求时幂等建表（模块级开关只跑一次）：

```sql
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread TEXT NOT NULL,              -- 站内路径（已去部署 base），如 /zh/posts/hello-world/
  author TEXT NOT NULL,              -- 昵称 1..40
  body TEXT NOT NULL,                -- 正文 1..2000，保留换行
  website TEXT NOT NULL DEFAULT '',  -- 可选，http(s) URL
  created_at TEXT NOT NULL,          -- ISO 8601 UTC
  ip_hash TEXT NOT NULL,             -- sha256(ip + salt)，不存明文 IP
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments (thread, id);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments (ip_hash, created_at);
```

限制依据：D1 免费额度 5 GB 存储，每天百万级行读取与十万级行写入量级；个人博客的评论量远低于此。

## 5. API 契约

统一 JSON；响应头 `Cache-Control: no-store`。

**GET `/api/comments?thread=<path>&before=<id>&limit=20`** → 200

```json
{ "items": [{ "id": 12, "author": "路人", "body": "写得好", "website": "", "createdAt": "2026-10-18T05:00:00.000Z" }],
  "total": 3, "nextBefore": null }
```

- `thread` 必填，须匹配 `^/[A-Za-z0-9._~/-]{1,200}$`，否则 400。
- 新→旧排序；`before` 是游标（取 id 更小的），`limit` 1..50 默认 20；`nextBefore` 为 null 表示没有更早的。

**POST `/api/comments`** 请求体 JSON `{ thread, author, body, website?, trap?, elapsed? }`

- 201 `{ "item": {...} }`
- 400 校验失败（缺字段/超长/thread 非法/website 非 http(s)）；429 触发限流；503 未配置 `DB`。
- `trap`（蜜罐）必须为空；`elapsed` 若提供须 ≥1500（毫秒，前端从聚焦表单开始计时）。
- 防刷：同一 `ip_hash` 60 秒内最多 1 条、24 小时内最多 20 条，超出 429。

**OPTIONS** → 204，CORS 白名单：`https://yukki-rui.pages.dev`、`https://liyukki.github.io`（按实际用户名）、`http://localhost:4321`、`http://127.0.0.1:4321`；无 Origin（同源）不限制。

**GET `/api/comments-admin?limit=50`**（Header `Authorization: Bearer <COMMENTS_ADMIN_TOKEN>`）
→ 200 `{ "items": [{ ...评论字段..., "thread": "..." }] }`，按时间新→旧，含全部文章。

**DELETE `/api/comments-admin?id=<id>`**（同一鉴权）→ 200 `{ "deleted": 1 }`；401 鉴权失败；503 未配置令牌。

## 6. 前端 UI（`src/components/Comments.astro`）

构建时注入：`thread`（`Astro.url.pathname` 去掉 `import.meta.env.BASE_URL`）、`lang`。

- `<section class="comments" id="comments">`：标题「评论 (N)」、列表、表单。
- 单条：首字头像（渐变方块，无第三方）+ 昵称（有网站则 `rel="nofollow ugc noopener"`）+ 相对时间（`<time datetime>`）+ 正文（`white-space: pre-wrap`，**textContent 渲染**）。
- 状态：加载中骨架、空状态、加载失败 + 重试、「加载更早的评论」。
- 表单：昵称、网址（选填）、正文 textarea、提交；隐藏蜜罐字段；成功后置顶插入并清空正文；昵称记 localStorage。
- 错误提示：400 显示具体文案、429「发得太快了，稍后再试」、503「评论服务还没配置好」、网络错误可重试。
- 样式只使用 `tokens.css` 变量（`--card` `--line` `--text` `--accent` …），深浅色与 390px 窄屏自适应。
- `COMMENTS.enabled === false` 时渲染 null（同现状），API 继续可用。

`src/consts.ts`：

```ts
export const COMMENTS = {
  enabled: true,
  /** 主站源；同源部署（Cloudflare / 本地 wrangler）用相对路径，其他源走这个绝对地址 */
  origin: 'https://yukki-rui.pages.dev',
  pageSize: 20,
} as const;
```

`UI[lang]` 增加评论区文案（标题、空状态、加载更多、各字段标签、按钮、错误与限流提示）。

## 7. 管理页（`public/admin/comments/index.html`）

静态页，与后台同一套像素风基础样式：

- 输入管理令牌（存 localStorage）→ 加载最近 50 条（显示文章路径、昵称、时间、正文）→ 每条「删除」按钮。
- 令牌错误时提示；页面 `<meta name="robots" content="noindex">`，robots.txt 已 `Disallow: /admin/`。

## 8. 安全

- 渲染全部走 textContent，不拼 HTML；不自动把正文里的链接变成 `<a>`。
- 长度上限 + 蜜罐 + 最小填写时间 + 按 IP 哈希限流。
- 只存 IP 哈希（`sha256(ip + salt)`，salt 取 `COMMENTS_SALT` 环境变量，缺省用固定串）。
- 管理令牌为 Cloudflare Secret，常数时间比较；无令牌时删除接口 503。
- 无 Cookie 鉴权 → 无 CSRF 面；令牌只在管理员浏览器 localStorage。
- 不引入任何第三方脚本或追踪。

## 9. 部署步骤（站长点 3 下）

1. Cloudflare Dashboard → Storage & Databases → D1 → Create database，名字 `yukki-rui-comments`。
2. Pages 项目 `yukki-rui` → Settings → Functions → D1 database bindings → Add：变量名 `DB`，选该库，Save。
3. Settings → Variables and secrets → 新增 `COMMENTS_ADMIN_TOKEN`（Secret，随机长串）→ Save → Deployments 里 Retry deployment。

顺序要求：先建库并绑定，再推送代码（评论开关打开），否则线上会短暂显示「评论服务还没配置好」。

## 10. 测试与验收

- 单测（vitest）：`tests/comments-lib.test.ts`（校验、游标分页、URL 白名单、CORS 判断）、`tests/comments-functions.test.ts`（用 `node:sqlite` 做 D1 替身：列表分页、POST 校验/蜜罐/限流/201、admin 鉴权 401/503/删除、CORS 预检、无 DB 503）。
- 端到端（`scripts/check-comments.mjs`，`npm run check:comments`）：`wrangler pages dev dist --d1=DB=comments_dev --binding COMMENTS_ADMIN_TOKEN=test-token` → Playwright 打开文章页 → 发布评论 → 立刻可见 → 刷新仍在 → XSS 串按文本显示 → 管理 API 删除 → 页面不再显示。
- 线上验收：受控浏览器打开 https://yukki-rui.pages.dev/zh/posts/... 发一条评论 → 刷新仍在 → 镜像站 https://liyukki.github.io/yukki-rui/... 同一篇也能看到 → `/admin/comments/` 删除掉。
- 门禁：`astro check`、`vitest`、`verify:frontend`、`check:cms-config`、`check:cms-oauth` 全绿。
- 文档：README（命令与功能）、`docs/usage-guide.md` §9/§10（开启/关闭、管理评论、本地全栈调试）、`docs/verification-report.md` 新增章节。

## 11. 回滚

- `COMMENTS.enabled = false` 重新部署即隐藏评论区，API 与数据保留，随时可再开。
- 删除 D1 绑定或整库即可彻底清除；不涉及其他系统。
