import { describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPost, REACTIONS } from '../functions/api/reactions.js';
import { createFakeD1, type FakeD1 } from './helpers/fake-d1';

const BASE = 'https://yukki-rui.pages.dev';
const IP = '203.0.113.9';

function req(url: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: { 'CF-Connecting-IP': IP, ...(init.headers ?? {}) },
  });
}

async function seedComment(db: FakeD1, id = 1) {
  await db.exec(
    'CREATE TABLE comments (id INTEGER PRIMARY KEY, thread TEXT, author TEXT, body TEXT, website TEXT, created_at TEXT, ip_hash TEXT, user_agent TEXT, parent_id INTEGER, hidden INTEGER DEFAULT 0)',
  );
  await db
    .prepare(
      "INSERT INTO comments (id, thread, author, body, created_at, ip_hash) VALUES (?, '/zh/posts/x/', 'a', 'b', '2026-01-01T00:00:00Z', 'h')",
    )
    .bind(id)
    .run();
}

describe('评论表情反应', () => {
  it('三种反应固定', () => {
    expect(REACTIONS).toEqual(['like', 'love', 'useful']);
  });

  it('同一 IP 重复点同一反应不重复计数', async () => {
    const db = createFakeD1();
    await seedComment(db);
    const env = { DB: db, COMMENTS_SALT: 'salt' };
    for (let index = 0; index < 2; index += 1) {
      const response = await onRequestPost({
        request: req(`${BASE}/api/reactions`, {
          method: 'POST',
          body: JSON.stringify({ commentId: 1, reaction: 'like' }),
        }),
        env,
      });
      expect(response.status).toBe(200);
    }
    const res = await onRequestGet({ request: req(`${BASE}/api/reactions?ids=1`), env });
    const body = (await res.json()) as { counts: Record<string, Record<string, number>> };
    expect(body.counts['1'].like).toBe(1);
  });

  it('不同 IP 各计一次', async () => {
    const db = createFakeD1();
    await seedComment(db);
    const env = { DB: db, COMMENTS_SALT: 'salt' };
    for (const ip of ['198.51.100.1', '198.51.100.2']) {
      await onRequestPost({
        request: req(`${BASE}/api/reactions`, {
          method: 'POST',
          body: JSON.stringify({ commentId: 1, reaction: 'love' }),
          headers: { 'CF-Connecting-IP': ip },
        }),
        env,
      });
    }
    const res = await onRequestGet({ request: req(`${BASE}/api/reactions?ids=1`), env });
    const body = (await res.json()) as { counts: Record<string, Record<string, number>> };
    expect(body.counts['1'].love).toBe(2);
  });

  it('active=false 时取消自己的反应', async () => {
    const db = createFakeD1();
    await seedComment(db);
    const env = { DB: db, COMMENTS_SALT: 'salt' };
    await onRequestPost({
      request: req(`${BASE}/api/reactions`, {
        method: 'POST',
        body: JSON.stringify({ commentId: 1, reaction: 'useful' }),
      }),
      env,
    });
    const removed = await onRequestPost({
      request: req(`${BASE}/api/reactions`, {
        method: 'POST',
        body: JSON.stringify({ commentId: 1, reaction: 'useful', active: false }),
      }),
      env,
    });
    const body = (await removed.json()) as { counts: Record<string, number>; mine: string[] };
    expect(body.counts.useful).toBe(0);
    expect(body.mine).toEqual([]);
  });

  it('不存在的评论拒绝反应', async () => {
    const db = createFakeD1();
    await seedComment(db);
    const res = await onRequestPost({
      request: req(`${BASE}/api/reactions`, {
        method: 'POST',
        body: JSON.stringify({ commentId: 999, reaction: 'like' }),
      }),
      env: { DB: db, COMMENTS_SALT: 'salt' },
    });
    expect(res.status).toBe(404);
  });

  it('未知反应类型拒绝', async () => {
    const db = createFakeD1();
    await seedComment(db);
    const res = await onRequestPost({
      request: req(`${BASE}/api/reactions`, {
        method: 'POST',
        body: JSON.stringify({ commentId: 1, reaction: 'angry' }),
      }),
      env: { DB: db, COMMENTS_SALT: 'salt' },
    });
    expect(res.status).toBe(400);
  });

  it('恶意 ID / 反应 / active 类型返回 400 而不是 500', async () => {
    const db = createFakeD1();
    await seedComment(db);
    const env = { DB: db, COMMENTS_SALT: 'salt' };
    for (const payload of [
      { commentId: { valueOf: null }, reaction: 'like' },
      { commentId: '1e2', reaction: 'like' },
      { commentId: 1, reaction: { toString: null } },
      { commentId: 1, reaction: 'like', active: 'false' },
    ]) {
      const res = await onRequestPost({
        request: req(`${BASE}/api/reactions`, { method: 'POST', body: JSON.stringify(payload) }),
        env,
      });
      expect(res.status).toBe(400);
    }
  });

  it('未配置盐时即使 ids 为空，读取也返回 503', async () => {
    const db = createFakeD1();
    const env = { DB: db };
    const read = await onRequestGet({ request: req(`${BASE}/api/reactions`), env });
    expect(read.status).toBe(503);
    expect(((await read.json()) as { error: string }).error).toBe('salt-missing');
  });

  it('没有盐且没有管理令牌兜底 → 503', async () => {
    const db = createFakeD1();
    await seedComment(db);
    const env = { DB: db };
    const read = await onRequestGet({ request: req(`${BASE}/api/reactions?ids=1`), env });
    const write = await onRequestPost({
      request: req(`${BASE}/api/reactions`, {
        method: 'POST',
        body: JSON.stringify({ commentId: 1, reaction: 'like' }),
      }),
      env,
    });
    expect(read.status).toBe(503);
    expect(write.status).toBe(503);
  });
});
