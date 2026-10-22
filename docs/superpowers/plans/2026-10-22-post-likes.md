# 文章点赞 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在文章底部加入免登录、可取消、中英文共享计数的点赞功能。

**Architecture:** 使用 Cloudflare D1 的独立 `post_likes` 表和 `/api/post-likes` Pages Function；前端由 `PostLayout.astro` 渲染 `PostLikes.astro`，通过 `translationKey` 生成共享文章键。

**Tech Stack:** Astro 7、Cloudflare Pages Functions、D1、TypeScript、Vitest、Node 22

## Global Constraints

- 复用 `COMMENTS_SALT`、CORS 白名单和 IP 哈希，不保存原始 IP。
- 同 IP 同文章最多一条记录，点赞与取消都必须幂等。
- 中英文已有译文通过 `translationKey` 共享计数。
- 页面内容只通过 `textContent` 写入，不拼 HTML。
- 不提交 API Key 或其他秘密。
- 必须支持 Cloudflare 同源与 GitHub Pages 跨域镜像。

---

### Task 1: 纯函数与接口契约

**Files:**
- Create: `src/lib/post-likes.ts`
- Test: `tests/post-likes.test.ts`

**Interfaces:**
- `postLikeKey(post: { id: string; data: { translationKey?: string } }): string`
- `postLikesEndpoint(commentsApiBase: string): string`

- [ ] 写 `translationKey` 合并、无译文回退、接口地址替换测试。
- [ ] 运行测试确认失败。
- [ ] 实现两个纯函数并导出。
- [ ] 运行测试确认通过。

### Task 2: D1 点赞 API

**Files:**
- Create: `functions/api/post-likes.js`
- Modify: `functions/api/comments.js`（导出 `clientIp`）
- Test: `tests/post-likes-functions.test.ts`

**Interfaces:**
- `GET /api/post-likes?post=<key>` → `{ count: number, liked: boolean }`
- `POST /api/post-likes { post, action: 'like' | 'unlike' }` → 同一响应结构
- `OPTIONS /api/post-likes` → `204`

- [ ] 写重复点赞、取消、不同 IP、不同文章、CORS、缺配置、非法输入测试。
- [ ] 运行测试确认失败。
- [ ] 自动建 `post_likes` 表并实现 GET/POST/OPTIONS。
- [ ] 运行测试确认通过。

### Task 3: 页面组件与样式

**Files:**
- Create: `src/components/PostLikes.astro`
- Modify: `src/consts.ts`
- Modify: `src/layouts/PostLayout.astro`
- Test: `tests/post-likes-ui.test.ts`

**Interfaces:**
- 组件 props：`lang: Lang`, `postKey: string`
- DOM 契约：`[data-post-likes]`, `[data-like-button]`, `[data-like-count]`, `[data-like-label]`, `[data-like-status]`

- [ ] 写模板顺序、双语文案、`aria-pressed`、错误回滚和请求锁测试。
- [ ] 运行测试确认失败。
- [ ] 实现组件、文案和布局接入。
- [ ] 运行测试确认通过。

### Task 4: 全量验证与发布

**Files:**
- Verify only.

- [ ] 运行 `npm run check`。
- [ ] 运行 `npm test`。
- [ ] 运行 `npm run check:base`、`npm run check:content`、`npm run build`。
- [ ] 运行 `npm run check:links`、`npm run check:frontend`。
- [ ] 提交并推送。
- [ ] 部署 Cloudflare Pages 并访问文章页验证计数和中英文共享。