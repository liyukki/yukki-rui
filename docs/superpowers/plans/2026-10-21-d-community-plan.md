# D 类(单层回复 + 评论表情反应)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 评论支持「回复某条评论」与固定三种表情反应,旧数据与现有行为完全兼容。

**Architecture:** 复用现有 Cloudflare D1 与 Pages Functions。回复用 `comments.parent_id` + `hidden` 两个新列;反应用独立表 `comment_reactions` 与独立的 `functions/api/reactions.js`。写入路径继续只存加盐 IP 哈希,前端继续全部 `textContent` 渲染。

**Tech Stack:** Cloudflare Pages Functions、Cloudflare D1(SQLite)、原生 `fetch`、Vitest + `node:sqlite` 假 D1。

## Global Constraints

- 不引入账号、邮箱、第三方评论服务、Markdown 渲染。
- 只做单层回复,不做无限嵌套;不递归查询超过一层。
- `draft` 之外的现有校验与限流必须保留:昵称 40、正文 2000、网址 200、最短 1.5 秒、60 秒 1 条、24 小时 20 条。
- 不存明文 IP;删除评论时不得泄漏 `ip_hash` 与 `user_agent`。
- 反应类型固定为 `like` / `love` / `useful`,公开后不得改名。
- 反应不接入 Issue 通知。

---

### Task D1: 数据迁移与回复写入校验

**Files:**
- Modify: `functions/api/comments.js`
- Modify: `functions/api/comments-admin.js`
- Test: `tests/comments-functions.test.ts`

**Interfaces:**
- Produces: `comments` 表新增列 `parent_id INTEGER NULL`、`hidden INTEGER NOT NULL DEFAULT 0`
- Produces: `export function normalizeParentId(raw: unknown): number | null`
- Produces: `validateNewComment` 的返回值新增 `parentId: number | null`

- [ ] **Step 1: 写失败测试**

在 `tests/comments-functions.test.ts` 里新增:

```ts
it('回复指向同 thread 的根评论时写入成功', async () => {
  const env = withDb();
  const root = await createComment({ request: postRequest({ thread: THREAD, author: 'a', body: 'root' }), env } as never);
  const rootId = (await root.json() as CreateBody).item.id;
  const reply = await createComment({
    request: postRequest({ thread: THREAD, author: 'b', body: 'reply', parentId: rootId }),
    env,
  } as never);
  expect(reply.status).toBe(201);
  const body = await reply.json() as CreateBody;
  expect(body.item.parentId).toBe(rootId);
});

it('回复不存在的父评论被拒绝', async () => {
  const env = withDb();
  const reply = await createComment({
    request: postRequest({ thread: THREAD, author: 'b', body: 'reply', parentId: 9999 }),
    env,
  } as never);
  expect(reply.status).toBe(400);
  expect((await reply.json() as { error: string }).error).toBe('invalid-parent');
});

it('回复属于其他 thread 的评论被拒绝', async () => {
  const env = withDb();
  const root = await createComment({ request: postRequest({ thread: THREAD, author: 'a', body: 'root' }), env } as never);
  const rootId = (await root.json() as CreateBody).item.id;
  const reply = await createComment({
    request: postRequest({ thread: '/en/posts/other/', author: 'b', body: 'reply', parentId: rootId }),
    env,
  } as never);
  expect(reply.status).toBe(400);
});

it('不能回复一条回复(只允许单层)', async () => {
  const env = withDb();
  const root = await createComment({ request: postRequest({ thread: THREAD, author: 'a', body: 'root' }), env } as never);
  const rootId = (await root.json() as CreateBody).item.id;
  const first = await createComment({ request: postRequest({ thread: THREAD, author: 'b', body: 'r1', parentId: rootId }), env } as never);
  const firstId = (await first.json() as CreateBody).item.id;
  const second = await createComment({ request: postRequest({ thread: THREAD, author: 'c', body: 'r2', parentId: firstId }), env } as never);
  expect(second.status).toBe(400);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/comments-functions.test.ts`
Expected: FAIL —— `parentId` 未被接受,`item.parentId` 为 undefined。

- [ ] **Step 3: 扩展建表与迁移**

`functions/api/comments.js` 与 `functions/api/comments-admin.js` 的 `SCHEMA` 数组,在两条 `CREATE INDEX` 之后追加幂等迁移:

```js
'ALTER TABLE comments ADD COLUMN parent_id INTEGER',
'ALTER TABLE comments ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0',
```

`ensureSchema` 改为逐条容错执行,已存在的列(`duplicate column name`)静默跳过,其余错误照旧抛出:

```js
const task = (async () => {
  for (const sql of SCHEMA) {
    try {
      await db.prepare(sql).run();
    } catch (error) {
      if (!/duplicate column name/i.test(String(error?.message ?? error))) throw error;
    }
  }
})().catch((error) => {
  schemaReady.delete(db);
  throw error;
});
```

- [ ] **Step 4: 写入校验**

`functions/api/comments.js` 增加:

```js
/** 父评论编号:空 / 缺省 = 根评论;非法输入返回 null 但由调用方区分「未填」与「填错」。 */
export function normalizeParentId(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : NaN;
}
```

`validateNewComment` 返回值改为:

```js
const parentId = normalizeParentId(input.parentId);
if (Number.isNaN(parentId)) return { ok: false, error: 'invalid-parent', message: '回复对象不合法' };
return { ok: true, value: { thread, author, body, website, parentId } };
```

`onRequestPost` 在 `ensureSchema` 之后、写入之前插入父评论校验:

```js
let parentId = value.parentId;
if (parentId !== null) {
  const parent = await env.DB
    .prepare('SELECT id, thread, parent_id, hidden FROM comments WHERE id = ?')
    .bind(parentId)
    .first();
  if (!parent || parent.thread !== value.thread || parent.hidden === 1 || parent.parent_id !== null) {
    return errorResponse(request, 400, 'invalid-parent', '回复对象不合法');
  }
}
```

`INSERT` 语句与绑定增加 `parent_id`。`toView` 增加 `parentId: record.parent_id == null ? null : Number(record.parent_id)`。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/comments-functions.test.ts`
Expected: PASS,含原有全部评论用例。

- [ ] **Step 6: 提交**

```
git add functions/api/comments.js functions/api/comments-admin.js tests/comments-functions.test.ts
git commit -m "feat(comments): 单层回复的数据迁移与写入校验"
```

---

### Task D2: 回复读取与父评论级联隐藏

**Files:**
- Modify: `functions/api/comments.js`
- Modify: `functions/api/comments-admin.js`
- Test: `tests/comments-functions.test.ts`

**Interfaces:**
- Consumes: `comments.parent_id`、`comments.hidden`(Task D1)
- Produces: `GET /api/comments` 返回的每个根评论带 `replies: CommentView[]` 与 `replyCount: number`
- Produces: `DELETE /api/comments-admin?id=N` 同时把自己与直接子回复标记 `hidden = 1`

- [ ] **Step 1: 写失败测试**

```ts
it('读取时根评论按分页返回,回复平铺在自己下面', async () => {
  const env = withDb();
  const root = await createComment({ request: postRequest({ thread: THREAD, author: 'a', body: 'root' }), env } as never);
  const rootId = (await root.json() as CreateBody).item.id;
  await createComment({ request: postRequest({ thread: THREAD, author: 'b', body: 'r1', parentId: rootId }), env } as never);
  const list = await listComments({ request: request(`${BASE}/api/comments?thread=${encodeURIComponent(THREAD)}`), env } as never);
  const body = await list.json() as { items: Array<CommentItem & { replies: CommentItem[]; replyCount: number }> };
  expect(body.items).toHaveLength(1);
  expect(body.items[0].replies.map((r) => r.body)).toEqual(['r1']);
  expect(body.items[0].replyCount).toBe(1);
});

it('回复不单独占用根评论分页名额', async () => {
  const env = withDb();
  const root = await createComment({ request: postRequest({ thread: THREAD, author: 'a', body: 'root' }), env } as never);
  const rootId = (await root.json() as CreateBody).item.id;
  await createComment({ request: postRequest({ thread: THREAD, author: 'b', body: 'r1', parentId: rootId }), env } as never);
  const list = await listComments({ request: request(`${BASE}/api/comments?thread=${encodeURIComponent(THREAD)}&limit=1`), env } as never);
  const body = await list.json() as ListBody;
  expect(body.total).toBe(1);
  expect(body.nextBefore).toBeNull();
});

it('删除根评论会级联隐藏其回复', async () => {
  const env = withDb();
  const root = await createComment({ request: postRequest({ thread: THREAD, author: 'a', body: 'root' }), env } as never);
  const rootId = (await root.json() as CreateBody).item.id;
  await createComment({ request: postRequest({ thread: THREAD, author: 'b', body: 'r1', parentId: rootId }), env } as never);
  const del = await deleteComment({ request: request(`${BASE}/api/comments-admin?id=${rootId}`, { method: 'DELETE', headers: { Authorization: 'Bearer test-token' } }), env: { ...env, COMMENTS_ADMIN_TOKEN: 'test-token' } } as never);
  expect(del.status).toBe(200);
  const list = await listComments({ request: request(`${BASE}/api/comments?thread=${encodeURIComponent(THREAD)}`), env } as never);
  const body = await list.json() as ListBody;
  expect(body.items).toEqual([]);
});

it('隐藏的评论不出现在公开列表', async () => {
  const env = withDb();
  await createComment({ request: postRequest({ thread: THREAD, author: 'a', body: 'root' }), env } as never);
  const list = await listComments({ request: request(`${BASE}/api/comments?thread=${encodeURIComponent(THREAD)}`), env } as never);
  const body = await list.json() as ListBody;
  expect(body.items).toEqual([]);
});
```

最后一条用例需要先在库中手工写入一条 `hidden = 1` 的记录(用 `env.DB.raw` 直接 INSERT),再断言列表为空。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/comments-functions.test.ts`
Expected: FAIL —— 没有 `replies` / `hidden`。

- [ ] **Step 3: 读取根评论分页 + 回复平铺**

`onRequestGet` 改为只对根评论分页:

```js
const totalRow = await env.DB
  .prepare('SELECT COUNT(*) AS n FROM comments WHERE thread = ? AND parent_id IS NULL AND hidden = 0')
  .bind(thread)
  .first();

const rootSql = `SELECT id, parent_id, author, body, website, created_at, hidden
  FROM comments WHERE thread = ? AND parent_id IS NULL AND hidden = 0`;
const rows = before
  ? await env.DB.prepare(`${rootSql} AND id < ? ORDER BY id DESC LIMIT ?`).bind(thread, before, limit + 1).all()
  : await env.DB.prepare(`${rootSql} ORDER BY id DESC LIMIT ?`).bind(thread, limit + 1).all();
```

取到根评论后,一次查回它们的全部可见回复并按 `parent_id` 归组:

```js
const rootIds = items.map((item) => item.id);
let repliesByParent = new Map();
if (rootIds.length > 0) {
  const placeholders = rootIds.map(() => '?').join(',');
  const replyRows = await env.DB
    .prepare(`SELECT id, parent_id, author, body, website, created_at
      FROM comments WHERE hidden = 0 AND parent_id IN (${placeholders}) ORDER BY id ASC`)
    .bind(...rootIds)
    .all();
  for (const row of replyRows?.results ?? []) {
    const view = toView(row);
    const list = repliesByParent.get(view.parentId) ?? [];
    list.push(view);
    repliesByParent.set(view.parentId, list);
  }
}
const items = roots.map((row) => {
  const view = toView(row);
  const replies = repliesByParent.get(view.id) ?? [];
  return { ...view, replies, replyCount: replies.length };
});
```

`jsonResponse` 的 `total` 改用根评论计数,`nextBefore` 逻辑保持不变。

- [ ] **Step 4: 级联隐藏**

`onRequestDelete` 改为事务式两条语句:

```js
await env.DB.prepare('UPDATE comments SET hidden = 1 WHERE parent_id = ?').bind(id).run();
const result = await env.DB.prepare('UPDATE comments SET hidden = 1 WHERE id = ?').bind(id).run();
return jsonResponse({ deleted: Number(result?.meta?.changes ?? 0) }, 200);
```

管理端列表查询也加 `WHERE hidden = 0` 过滤(避免站长重复看到已隐藏项)。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/comments-functions.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```
git add functions/api/comments.js functions/api/comments-admin.js tests/comments-functions.test.ts
git commit -m "feat(comments): 回复读取与删除级联隐藏"
```

---

### Task D3: 评论表情反应

**Files:**
- Create: `functions/api/reactions.js`
- Create: `tests/reactions-functions.test.ts`
- Modify: `functions/api/comments-admin.js`(删除时清理反应)

**Interfaces:**
- Produces: `export const REACTIONS = ['like', 'love', 'useful']`
- Produces: `POST /api/reactions { commentId, reaction }` → `{ counts: Record<string, number>, mine: string[] }`
- Produces: `GET  /api/reactions?ids=1,2,3` → `{ counts: Record<string, Record<string, number>> }`

- [ ] **Step 1: 写失败测试**

新建 `tests/reactions-functions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPost, REACTIONS } from '../functions/api/reactions.js';
import { createFakeD1 } from './helpers/fake-d1';

const BASE = 'https://yukki-rui.pages.dev';
const IP = '203.0.113.9';

function req(url: string, init: RequestInit = {}) {
  return new Request(url, { headers: { 'CF-Connecting-IP': IP, ...(init.headers ?? {}) }, ...init });
}

async function seedComment(db: ReturnType<typeof createFakeD1>, id = 1) {
  await db.exec('CREATE TABLE comments (id INTEGER PRIMARY KEY, thread TEXT, author TEXT, body TEXT, website TEXT, created_at TEXT, ip_hash TEXT, user_agent TEXT, parent_id INTEGER, hidden INTEGER DEFAULT 0)');
  await db.prepare("INSERT INTO comments (id, thread, author, body, created_at, ip_hash) VALUES (?, '/zh/posts/x/', 'a', 'b', '2026-01-01T00:00:00Z', 'h')").bind(id).run();
}

it('三种反应固定', () => {
  expect(REACTIONS).toEqual(['like', 'love', 'useful']);
});

it('同一 IP 重复点同一反应不重复计数', async () => {
  const db = createFakeD1();
  await seedComment(db);
  const env = { DB: db, COMMENTS_SALT: 'salt' };
  for (let i = 0; i < 2; i += 1) {
    await onRequestPost({ request: req(`${BASE}/api/reactions`, { method: 'POST', body: JSON.stringify({ commentId: 1, reaction: 'like' }) }), env } as never);
  }
  const res = await onRequestGet({ request: req(`${BASE}/api/reactions?ids=1`), env } as never);
  expect((await res.json() as { counts: Record<string, Record<string, number>> }).counts['1'].like).toBe(1);
});

it('不同 IP 各计一次', async () => {
  const db = createFakeD1();
  await seedComment(db);
  const env = { DB: db, COMMENTS_SALT: 'salt' };
  await onRequestPost({ request: req(`${BASE}/api/reactions`, { method: 'POST', body: JSON.stringify({ commentId: 1, reaction: 'love' }), headers: { 'CF-Connecting-IP': '198.51.100.1' } }), env } as never);
  await onRequestPost({ request: req(`${BASE}/api/reactions`, { method: 'POST', body: JSON.stringify({ commentId: 1, reaction: 'love' }), headers: { 'CF-Connecting-IP': '198.51.100.2' } }), env } as never);
  const res = await onRequestGet({ request: req(`${BASE}/api/reactions?ids=1`), env } as never);
  expect((await res.json() as { counts: Record<string, Record<string, number>> }).counts['1'].love).toBe(2);
});

it('不存在的评论拒绝反应', async () => {
  const db = createFakeD1();
  await seedComment(db);
  const res = await onRequestPost({ request: req(`${BASE}/api/reactions`, { method: 'POST', body: JSON.stringify({ commentId: 999, reaction: 'like' }) }), env: { DB: db, COMMENTS_SALT: 'salt' } } as never);
  expect(res.status).toBe(404);
});

it('未知反应类型拒绝', async () => {
  const db = createFakeD1();
  await seedComment(db);
  const res = await onRequestPost({ request: req(`${BASE}/api/reactions`, { method: 'POST', body: JSON.stringify({ commentId: 1, reaction: 'angry' }) }), env: { DB: db, COMMENTS_SALT: 'salt' } } as never);
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/reactions-functions.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 reactions Function**

新建 `functions/api/reactions.js`,复用 `comments.js` 的 `ensureSchema`、`isAllowedOrigin`、`corsHeaders`、`sha256Hex`、`clientIp` 语义(直接从 `./comments.js` import 已导出的部分;`clientIp` 若未导出则在本文件本地实现同样的取值顺序 `CF-Connecting-IP` → `x-forwarded-for` → `0.0.0.0`)。

建表:

```js
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS comment_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    reaction TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(comment_id, reaction, ip_hash)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_reactions_comment ON comment_reactions (comment_id)',
];
```

写入用 `INSERT OR IGNORE`,返回该评论的三种计数与当前 IP 已点过的类型:

```js
export const REACTIONS = ['like', 'love', 'useful'];
```

读取 `GET ?ids=1,2,3` 支持批量(最多 50 个 id),返回 `{ counts: { '1': { like: 2, love: 0, useful: 0 } } }`。

- [ ] **Step 4: 删除评论时清理反应**

`functions/api/comments-admin.js` 的 `onRequestDelete` 增加:

```js
await env.DB.prepare('DELETE FROM comment_reactions WHERE comment_id = ?').bind(id).run();
```

对回复的 id 也要清理;若 `comment_reactions` 表尚未创建(评论功能从未被使用过),用与 `ensureSchema` 相同的「表不存在则忽略」容错。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/reactions-functions.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```
git add functions/api/reactions.js functions/api/comments-admin.js tests/reactions-functions.test.ts
git commit -m "feat(comments): 评论表情反应接口与计数"
```

---

### Task D4: 前端回复与反应 UI

**Files:**
- Modify: `src/components/Comments.astro`
- Modify: `src/lib/comments.ts`
- Modify: `src/consts.ts`
- Modify: `scripts/check-comments.mjs`

**Interfaces:**
- Consumes: `GET /api/comments` 的 `replies` / `replyCount`(Task D2)
- Consumes: `POST /api/reactions`(Task D3)
- Produces: `export function reactionsEndpoint(commentsApiBase: string): string` in `src/lib/comments.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/comments.test.ts` 增加:

```ts
it('reactionsEndpoint 由评论地址推导同源 reactions 地址', () => {
  expect(reactionsEndpoint('')).toBe('/api/reactions');
  expect(reactionsEndpoint('https://yukki-rui.pages.dev/api/comments')).toBe('https://yukki-rui.pages.dev/api/reactions');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/comments.test.ts`
Expected: FAIL —— `reactionsEndpoint` 未导出。

- [ ] **Step 3: 实现地址推导**

`src/lib/comments.ts` 增加:

```ts
export function reactionsEndpoint(commentsApiBase: string): string {
  const base = String(commentsApiBase ?? '').trim();
  if (!base) return '/api/reactions';
  return base.replace(/\/api\/comments\/?$/, '/api/reactions');
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/comments.test.ts`
Expected: PASS。

- [ ] **Step 5: 前端渲染回复与反应**

`src/components/Comments.astro`:

- `CommentItem` 增加 `parentId: number | null`、`replies?: CommentItem[]`、`replyCount?: number`。
- 每条根评论渲染一个「回复」按钮,点击后在原评论下方展开一个**复用同一套字段**的小表单(`author` / `body` / `website` / `trap`),提交时带上 `parentId`。同一时间只允许打开一个回复框。
- 回复列表渲染在根评论正文下方,缩进一级,视觉上与其他评论区分。
- 每条评论渲染三个反应按钮(赞/喜欢/有用)与计数;点击调用 `POST /api/reactions`,成功后按返回值就地更新按钮计数与选中态。重复点击同一反应视为取消(服务端返回最新 `counts` 与 `mine`,前端以返回值覆盖)。
- 继续全部使用 `textContent` / `dataset`,不得拼 HTML。
- 文案键在 `src/consts.ts` 的 `UI.zh` / `UI.en` 对称补齐:`commentsReply`、`commentsReplyTo`、`commentsReactionLike`、`commentsReactionLove`、`commentsReactionUseful`、`commentsReplyPosted`。

- [ ] **Step 6: 端到端自检**

`scripts/check-comments.mjs` 增加:发根评论 → 点回复并提交 → 刷新后回复仍在根评论下 → 点「赞」计数为 1 → 刷新后计数仍为 1 → 删除根评论后回复与反应一并消失。

- [ ] **Step 7: 文档**

`README.md` 与 `docs/usage-guide.md` 补一小节:回复是单层、父评论删除会级联隐藏、反应类型固定三种、反应不触发通知、共享 IP 会误去重的已知限制。

- [ ] **Step 8: 提交**

```
git add src/components/Comments.astro src/lib/comments.ts src/consts.ts tests/comments.test.ts scripts/check-comments.mjs README.md docs/usage-guide.md
git commit -m "feat(comments): 前端回复与表情反应 UI"
```
