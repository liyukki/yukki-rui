import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ORIGINS,
  clampLimit,
  corsHeaders,
  normalizeThread,
  onRequestGet as listComments,
  onRequestOptions as commentsOptions,
  onRequestPost as createComment,
  toView,
  validateNewComment,
} from '../functions/api/comments.js';
import {
  clampAdminLimit,
  onRequestDelete as deleteComment,
  onRequestGet as adminListComments,
  onRequestOptions as adminOptions,
  readBearer,
  tokenMatches,
} from '../functions/api/comments-admin.js';
import { commentThread } from '../src/lib/comments';
import { createFakeD1, type FakeD1 } from './helpers/fake-d1';

interface TestEnv {
  DB?: FakeD1;
  COMMENTS_SALT?: string;
  COMMENTS_ADMIN_TOKEN?: string;
}

interface CommentItem {
  id: number;
  parentId: number | null;
  author: string;
  body: string;
  website: string;
  createdAt: string;
  replies?: CommentItem[];
  replyCount?: number;
}

interface ListBody {
  items: CommentItem[];
  total: number;
  nextBefore: number | null;
}

interface CreateBody {
  item: CommentItem;
}

const BASE = 'https://yukki-rui.pages.dev';
const THREAD = '/zh/posts/hello-world/';

function withDb(): TestEnv {
  return { DB: createFakeD1() };
}

function request(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
}

function postRequest(payload: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}/api/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.9',
      'User-Agent': 'vitest',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

function newComment(overrides: Record<string, unknown> = {}) {
  return {
    thread: THREAD,
    author: '路人',
    body: '写得好',
    website: '',
    elapsed: 5000,
    ...overrides,
  };
}

/** 用公开接口种若干条评论，每条用不同 IP，绕开限流。 */
async function seed(env: TestEnv, count: number, thread = THREAD): Promise<number[]> {
  const ids: number[] = [];
  for (let index = 1; index <= count; index += 1) {
    const response = await createComment({
      request: postRequest(newComment({ thread, author: `读友${index}`, body: `第 ${index} 条` }), {
        'CF-Connecting-IP': `198.51.100.${index}`,
      }),
      env,
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as CreateBody;
    ids.push(body.item.id);
  }
  return ids;
}

describe('normalizeThread 与前端 commentThread 对齐', () => {
  it('两种部署下的同一篇文章得到同一个 thread', () => {
    expect(normalizeThread(commentThread('/zh/posts/hello-world/', '/'))).toBe(THREAD);
    expect(normalizeThread(commentThread('/yukki-rui/zh/posts/hello-world/', '/yukki-rui/'))).toBe(THREAD);
  });

  it('拒绝空值、非法字符与超长路径', () => {
    expect(normalizeThread('')).toBeNull();
    expect(normalizeThread('/zh/posts/<script>')).toBeNull();
    expect(normalizeThread(`/${'a'.repeat(300)}`)).toBeNull();
    expect(normalizeThread(undefined)).toBeNull();
    expect(normalizeThread(42)).toBeNull();
  });
});

describe('validateNewComment：服务端说了算', () => {
  it('规整昵称与正文（去首尾空白、保留换行）', () => {
    const result = validateNewComment({ thread: THREAD, author: ' 路人 ', body: ' 写得好\n谢谢 ' });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ thread: THREAD, author: '路人', body: '写得好\n谢谢', website: '', parentId: null });
  });

  it('昵称不能为空或超长', () => {
    expect(validateNewComment({ thread: THREAD, author: '   ', body: 'x' }).error).toBe('invalid-author');
    expect(validateNewComment({ thread: THREAD, author: '字'.repeat(41), body: 'x' }).error).toBe('invalid-author');
  });

  it('正文不能为空或超长', () => {
    expect(validateNewComment({ thread: THREAD, author: 'a', body: '  ' }).error).toBe('invalid-body');
    expect(validateNewComment({ thread: THREAD, author: 'a', body: '字'.repeat(2001) }).error).toBe('invalid-body');
  });

  it('网址必须是 http(s)', () => {
    expect(validateNewComment({ thread: THREAD, author: 'a', body: 'b', website: 'ftp://x' }).error).toBe(
      'invalid-website',
    );
    expect(validateNewComment({ thread: THREAD, author: 'a', body: 'b', website: 'https://example.com' }).ok).toBe(
      true,
    );
  });

  it('thread 缺失或非法直接拒绝', () => {
    expect(validateNewComment({ author: 'a', body: 'b' }).error).toBe('invalid-thread');
    expect(validateNewComment(null).error).toBe('invalid-body');
  });
});

describe('小助手', () => {
  it('limit 有默认值与上限', () => {
    expect(clampLimit(null)).toBe(20);
    expect(clampLimit('5')).toBe(5);
    expect(clampLimit('999')).toBe(50);
    expect(clampLimit('abc')).toBe(20);
  });

  it('toView 不泄漏 ip_hash / user_agent / thread', () => {
    const view = toView({
      id: 1,
      author: 'a',
      body: 'b',
      website: '',
      created_at: '2026-10-18T00:00:00.000Z',
      ip_hash: 'secret',
      user_agent: 'ua',
    });
    expect(view).toEqual({ id: 1, parentId: null, author: 'a', body: 'b', website: '', createdAt: '2026-10-18T00:00:00.000Z' });
  });

  it('CORS 只回显白名单来源', () => {
    const allowed = corsHeaders(request(`${BASE}/api/comments`, { headers: { Origin: 'https://liyukki.github.io' } }));
    expect(allowed['Access-Control-Allow-Origin']).toBe('https://liyukki.github.io');
    const evil = corsHeaders(request(`${BASE}/api/comments`, { headers: { Origin: 'https://evil.example' } }));
    expect(evil).toEqual({});
  });

  it('真实 GitHub Pages 站点在白名单里，拼错用户名的来源不放行', () => {
    // 线上真实地址是 https://liyukki.github.io/yukki-rui/（两个 y）
    const real = corsHeaders(request(`${BASE}/api/comments`, { headers: { Origin: 'https://liyukki.github.io' } }));
    expect(real['Access-Control-Allow-Origin']).toBe('https://liyukki.github.io');
    // 曾经把用户名写成 liukki（少一个 y），导致镜像站评论区 403；这条断言防止再退化
    expect(ALLOWED_ORIGINS.has('https://liukki.github.io')).toBe(false);
    const typo = corsHeaders(request(`${BASE}/api/comments`, { headers: { Origin: 'https://liukki.github.io' } }));
    expect(typo).toEqual({});
  });
});

describe('GET /api/comments', () => {
  it('没有 DB 绑定 → 503', async () => {
    const response = await listComments({ request: request(`${BASE}/api/comments?thread=${THREAD}`), env: {} });
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: string }).error).toBe('db-missing');
  });

  it('thread 非法 → 400', async () => {
    const response = await listComments({
      request: request(`${BASE}/api/comments?thread=${encodeURIComponent('/zh/<x>')}`),
      env: withDb(),
    });
    expect(response.status).toBe(400);
  });

  it('空列表返回 0 条且禁止缓存', async () => {
    const response = await listComments({ request: request(`${BASE}/api/comments?thread=${THREAD}`), env: withDb() });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = (await response.json()) as ListBody;
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.nextBefore).toBeNull();
  });

  it('新→旧分页：limit 截断，nextBefore 作为游标', async () => {
    const env = withDb();
    const ids = await seed(env, 3);

    const first = (await (
      await listComments({ request: request(`${BASE}/api/comments?thread=${THREAD}&limit=2`), env })
    ).json()) as ListBody;
    expect(first.items.map((item) => item.id)).toEqual([ids[2], ids[1]]);
    expect(first.total).toBe(3);
    expect(first.nextBefore).toBe(ids[1]);

    const second = (await (
      await listComments({
        request: request(`${BASE}/api/comments?thread=${THREAD}&limit=2&before=${first.nextBefore}`),
        env,
      })
    ).json()) as ListBody;
    expect(second.items.map((item) => item.id)).toEqual([ids[0]]);
    expect(second.nextBefore).toBeNull();
  });

  it('读取时根评论按分页返回,回复平铺在自己下面', async () => {
    const env = withDb();
    const root = await createComment({ request: postRequest(newComment({ author: 'a', body: 'root' })), env });
    const rootId = ((await root.json()) as CreateBody).item.id;
    await createComment({
      request: postRequest(newComment({ author: 'b', body: 'r1', parentId: rootId }), {
        'CF-Connecting-IP': '198.51.100.41',
      }),
      env,
    });
    const list = await listComments({ request: request(`${BASE}/api/comments?thread=${encodeURIComponent(THREAD)}`), env });
    const body = (await list.json()) as ListBody;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].replies?.map((reply) => reply.body)).toEqual(['r1']);
    expect(body.items[0].replyCount).toBe(1);
  });

  it('回复不单独占用根评论分页名额', async () => {
    const env = withDb();
    const root = await createComment({ request: postRequest(newComment({ author: 'a', body: 'root' })), env });
    const rootId = ((await root.json()) as CreateBody).item.id;
    await createComment({
      request: postRequest(newComment({ author: 'b', body: 'r1', parentId: rootId }), {
        'CF-Connecting-IP': '198.51.100.42',
      }),
      env,
    });
    const list = await listComments({ request: request(`${BASE}/api/comments?thread=${encodeURIComponent(THREAD)}&limit=1`), env });
    const body = (await list.json()) as ListBody;
    expect(body.total).toBe(1);
    expect(body.nextBefore).toBeNull();
  });

  it('删除根评论会级联隐藏其回复', async () => {
    const env = withDb();
    const root = await createComment({ request: postRequest(newComment({ author: 'a', body: 'root' })), env });
    const rootId = ((await root.json()) as CreateBody).item.id;
    await createComment({
      request: postRequest(newComment({ author: 'b', body: 'r1', parentId: rootId }), {
        'CF-Connecting-IP': '198.51.100.43',
      }),
      env,
    });
    const del = await deleteComment({
      request: request(`${BASE}/api/comments-admin?id=${rootId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-token' },
      }),
      env: { ...env, COMMENTS_ADMIN_TOKEN: 'test-token' },
    });
    expect(del.status).toBe(200);
    const list = await listComments({ request: request(`${BASE}/api/comments?thread=${encodeURIComponent(THREAD)}`), env });
    const body = (await list.json()) as ListBody;
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('隐藏的评论不出现在公开列表', async () => {
    const env = withDb();
    await createComment({ request: postRequest(newComment({ author: 'a', body: 'root' })), env });
    env.DB!.raw.prepare('UPDATE comments SET hidden = 1').run();
    const list = await listComments({ request: request(`${BASE}/api/comments?thread=${encodeURIComponent(THREAD)}`), env });
    const body = (await list.json()) as ListBody;
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('不同 thread 的评论互不串台', async () => {
    const env = withDb();
    await seed(env, 1, THREAD);
    const other = (await (
      await listComments({ request: request(`${BASE}/api/comments?thread=/en/posts/other/`), env })
    ).json()) as ListBody;
    expect(other.items).toEqual([]);
  });
});

describe('POST /api/comments', () => {
  it('201 且落库，昵称已规整', async () => {
    const env = withDb();
    const response = await createComment({ request: postRequest(newComment({ author: ' 路人 ' })), env });
    expect(response.status).toBe(201);
    const body = (await response.json()) as CreateBody;
    expect(body.item.id).toBeGreaterThan(0);
    expect(body.item.author).toBe('路人');

    const list = (await (
      await listComments({ request: request(`${BASE}/api/comments?thread=${THREAD}`), env })
    ).json()) as ListBody;
    expect(list.total).toBe(1);
    expect(list.items[0].body).toBe('写得好');
  });

  it('蜜罐字段被填 → 400 且不落库', async () => {
    const env = withDb();
    const response = await createComment({ request: postRequest(newComment({ trap: 'bot' })), env });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('spam-detected');
    // 蜜罐在写库前就被拦下，公开列表里查不到任何条目（这一步也顺便建表）。
    const list = (await (
      await listComments({ request: request(`${BASE}/api/comments?thread=${THREAD}`), env })
    ).json()) as ListBody;
    expect(list.total).toBe(0);
  });

  it('提交过快 → 400 too-fast', async () => {
    const response = await createComment({ request: postRequest(newComment({ elapsed: 10 })), env: withDb() });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('too-fast');
  });

  it('同一 IP 60 秒内第二条 → 429', async () => {
    const env = withDb();
    const first = await createComment({ request: postRequest(newComment()), env });
    expect(first.status).toBe(201);
    const second = await createComment({ request: postRequest(newComment({ body: '再来一条' })), env });
    expect(second.status).toBe(429);
    expect(((await second.json()) as { error: string }).error).toBe('rate-limited');
  });

  it('同一 IP 发完根评论后可以立即回复,但仍不能再发根评论', async () => {
    const env = withDb();
    const root = await createComment({ request: postRequest(newComment({ author: 'a', body: 'root' })), env });
    const rootId = ((await root.json()) as CreateBody).item.id;

    const reply = await createComment({
      request: postRequest(newComment({ author: 'a', body: 'reply', parentId: rootId })),
      env,
    });
    expect(reply.status).toBe(201);

    const secondRoot = await createComment({
      request: postRequest(newComment({ author: 'a', body: 'another root' })),
      env,
    });
    expect(secondRoot.status).toBe(429);
  });

  it('换一个 IP 就能继续发', async () => {
    const env = withDb();
    const first = await createComment({ request: postRequest(newComment()), env });
    const second = await createComment({
      request: postRequest(newComment({ body: '换个人来' }), { 'CF-Connecting-IP': '198.51.100.20' }),
      env,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it('只存 IP 哈希，不存明文', async () => {
    const env = withDb();
    await createComment({ request: postRequest(newComment()), env });
    const row = env.DB!.raw.prepare('SELECT ip_hash, user_agent FROM comments').get() as {
      ip_hash: string;
      user_agent: string;
    };
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.ip_hash).not.toContain('203.0.113.9');
    expect(row.user_agent).toBe('vitest');
  });

  it('来源不在白名单 → 403', async () => {
    const response = await createComment({
      request: postRequest(newComment(), { Origin: 'https://evil.example' }),
      env: withDb(),
    });
    expect(response.status).toBe(403);
  });

  it('白名单来源 → 201 并带回 CORS 头', async () => {
    const response = await createComment({
      request: postRequest(newComment(), { Origin: 'https://liyukki.github.io' }),
      env: withDb(),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://liyukki.github.io');
  });

  it('回复指向同 thread 的根评论时写入成功', async () => {
    const env = withDb();
    const root = await createComment({ request: postRequest(newComment({ author: 'a', body: 'root' })), env });
    const rootId = ((await root.json()) as CreateBody).item.id;
    const reply = await createComment({
      request: postRequest(newComment({ author: 'b', body: 'reply', parentId: rootId }), {
        'CF-Connecting-IP': '198.51.100.31',
      }),
      env,
    });
    expect(reply.status).toBe(201);
    const body = (await reply.json()) as CreateBody;
    expect(body.item.parentId).toBe(rootId);
  });

  it('回复不存在的父评论被拒绝', async () => {
    const env = withDb();
    const reply = await createComment({
      request: postRequest(newComment({ author: 'b', body: 'reply', parentId: 9999 }), {
        'CF-Connecting-IP': '198.51.100.32',
      }),
      env,
    });
    expect(reply.status).toBe(400);
    expect(((await reply.json()) as { error: string }).error).toBe('invalid-parent');
  });

  it('回复属于其他 thread 的评论被拒绝', async () => {
    const env = withDb();
    const root = await createComment({ request: postRequest(newComment({ author: 'a', body: 'root' })), env });
    const rootId = ((await root.json()) as CreateBody).item.id;
    const reply = await createComment({
      request: postRequest(newComment({ thread: '/en/posts/other/', author: 'b', body: 'reply', parentId: rootId }), {
        'CF-Connecting-IP': '198.51.100.33',
      }),
      env,
    });
    expect(reply.status).toBe(400);
    expect(((await reply.json()) as { error: string }).error).toBe('invalid-parent');
  });

  it('不能回复一条回复（只允许单层）', async () => {
    const env = withDb();
    const root = await createComment({ request: postRequest(newComment({ author: 'a', body: 'root' })), env });
    const rootId = ((await root.json()) as CreateBody).item.id;
    const first = await createComment({
      request: postRequest(newComment({ author: 'b', body: 'r1', parentId: rootId }), {
        'CF-Connecting-IP': '198.51.100.34',
      }),
      env,
    });
    const firstId = ((await first.json()) as CreateBody).item.id;
    const second = await createComment({
      request: postRequest(newComment({ author: 'c', body: 'r2', parentId: firstId }), {
        'CF-Connecting-IP': '198.51.100.35',
      }),
      env,
    });
    expect(second.status).toBe(400);
    expect(((await second.json()) as { error: string }).error).toBe('invalid-parent');
  });

  it('坏 JSON → 400', async () => {
    const response = await createComment({
      request: new Request(`${BASE}/api/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{oops',
      }),
      env: withDb(),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('invalid-json');
  });

  it('OPTIONS 预检 → 204 + CORS 头', async () => {
    const response = commentsOptions({
      request: request(`${BASE}/api/comments`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://liyukki.github.io' },
      }),
      env: {},
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://liyukki.github.io');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});

describe('管理 API', () => {
  const ADMIN_URL = `${BASE}/api/comments-admin`;
  function adminEnv(): TestEnv {
    return { DB: createFakeD1(), COMMENTS_ADMIN_TOKEN: 'test-token' };
  }
  function authHeaders(token = 'test-token'): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  it('未配置令牌 → 503', async () => {
    const response = await adminListComments({
      request: request(ADMIN_URL, { headers: authHeaders() }),
      env: { DB: createFakeD1() },
    });
    expect(response.status).toBe(503);
  });

  it('没带令牌或令牌错误 → 401', async () => {
    const noAuth = await adminListComments({ request: request(ADMIN_URL), env: adminEnv() });
    const wrong = await adminListComments({
      request: request(ADMIN_URL, { headers: authHeaders('nope') }),
      env: adminEnv(),
    });
    expect(noAuth.status).toBe(401);
    expect(wrong.status).toBe(401);
  });

  it('带令牌列出最近评论（新在前，含 thread）', async () => {
    const env = adminEnv();
    await seed(env, 2);
    const response = await adminListComments({ request: request(ADMIN_URL, { headers: authHeaders() }), env });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: Array<CommentItem & { thread: string }>; total: number };
    expect(body.total).toBe(2);
    expect(body.items[0].author).toBe('读友2');
    expect(body.items[0].thread).toBe(THREAD);
  });

  it('删除后公开列表里不再出现', async () => {
    const env = adminEnv();
    const ids = await seed(env, 2);

    const removed = await deleteComment({
      request: request(`${ADMIN_URL}?id=${ids[0]}`, { method: 'DELETE', headers: authHeaders() }),
      env,
    });
    expect(removed.status).toBe(200);
    expect(((await removed.json()) as { deleted: number }).deleted).toBe(1);

    const list = (await (
      await listComments({ request: request(`${BASE}/api/comments?thread=${THREAD}`), env })
    ).json()) as ListBody;
    expect(list.total).toBe(1);
    expect(list.items[0].id).toBe(ids[1]);
  });

  it('删除不存在的编号 → deleted 0；编号非法 → 400', async () => {
    const env = adminEnv();
    const missing = await deleteComment({
      request: request(`${ADMIN_URL}?id=999`, { method: 'DELETE', headers: authHeaders() }),
      env,
    });
    expect(((await missing.json()) as { deleted: number }).deleted).toBe(0);

    const invalid = await deleteComment({
      request: request(`${ADMIN_URL}?id=abc`, { method: 'DELETE', headers: authHeaders() }),
      env,
    });
    expect(invalid.status).toBe(400);
  });

  it('DELETE 也要鉴权', async () => {
    const response = await deleteComment({
      request: request(`${ADMIN_URL}?id=1`, { method: 'DELETE' }),
      env: adminEnv(),
    });
    expect(response.status).toBe(401);
  });

  it('OPTIONS → 204', () => {
    expect(adminOptions().status).toBe(204);
  });

  it('令牌比较与解析助手', () => {
    expect(tokenMatches('secret', 'secret')).toBe(true);
    expect(tokenMatches('secret', 'secreu')).toBe(false);
    expect(tokenMatches('secret', 'secret-extra')).toBe(false);
    expect(tokenMatches('', '')).toBe(false);
    expect(readBearer(new Headers({ Authorization: 'Bearer abc' }))).toBe('abc');
    expect(readBearer(new Headers({ Authorization: 'bearer abc' }))).toBe('abc');
    expect(readBearer(new Headers({ Authorization: 'Basic abc' }))).toBe('');
    expect(readBearer(new Headers())).toBe('');
    expect(clampAdminLimit('1000')).toBe(200);
    expect(clampAdminLimit(null)).toBe(50);
  });
});
