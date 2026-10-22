import { describe, expect, it } from 'vitest';
import {
  onRequestGet,
  onRequestOptions,
  onRequestPost,
} from '../functions/api/post-likes.js';
import { createFakeD1, type FakeD1 } from './helpers/fake-d1';

const BASE = 'https://yukki-rui.pages.dev';
const POST = 'translation:hello-world';
const IP = '203.0.113.9';

function req(url: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: { 'CF-Connecting-IP': IP, ...(init.headers ?? {}) },
  });
}

async function read(response: Response) {
  return (await response.json()) as { count?: number; liked?: boolean; error?: string };
}

async function like(db: FakeD1, env: Record<string, unknown>, ip = IP, post = POST) {
  return onRequestPost({
    request: req(`${BASE}/api/post-likes`, {
      method: 'POST',
      body: JSON.stringify({ post, action: 'like' }),
      headers: { 'CF-Connecting-IP': ip },
    }),
    env: { DB: db, COMMENTS_SALT: 'salt', ...env },
  });
}

describe('文章点赞 API', () => {
  it('首次点赞为 1，重复点赞仍为 1', async () => {
    const db = createFakeD1();
    for (let index = 0; index < 2; index += 1) {
      const response = await like(db, {});
      expect(response.status).toBe(200);
      expect(await read(response)).toMatchObject({ count: 1, liked: true });
    }
    const response = await onRequestGet({
      request: req(`${BASE}/api/post-likes?post=${encodeURIComponent(POST)}`),
      env: { DB: db, COMMENTS_SALT: 'salt' },
    });
    expect(await read(response)).toEqual({ count: 1, liked: true });
  });

  it('取消点赞后为 0，重复取消保持幂等', async () => {
    const db = createFakeD1();
    await like(db, {});
    for (let index = 0; index < 2; index += 1) {
      const response = await onRequestPost({
        request: req(`${BASE}/api/post-likes`, {
          method: 'POST',
          body: JSON.stringify({ post: POST, action: 'unlike' }),
        }),
        env: { DB: db, COMMENTS_SALT: 'salt' },
      });
      expect(response.status).toBe(200);
      expect(await read(response)).toEqual({ count: 0, liked: false });
    }
  });

  it('不同 IP 分别计数，同 IP 在不同语言页面共享', async () => {
    const db = createFakeD1();
    await like(db, {}, '198.51.100.1');
    await like(db, {}, '198.51.100.2');
    const response = await onRequestGet({
      request: req(`${BASE}/api/post-likes?post=${encodeURIComponent(POST)}`, {
        headers: { 'CF-Connecting-IP': '198.51.100.1' },
      }),
      env: { DB: db, COMMENTS_SALT: 'salt' },
    });
    expect(await read(response)).toEqual({ count: 2, liked: true });
  });

  it('不同文章键互不影响', async () => {
    const db = createFakeD1();
    await like(db, {}, IP, 'translation:hello-world');
    const response = await like(db, {}, IP, 'post:another-post');
    expect(await read(response)).toEqual({ count: 1, liked: true });
  });

  it('非法 JSON、文章键与 action 返回 400', async () => {
    const db = createFakeD1();
    const env = { DB: db, COMMENTS_SALT: 'salt' };
    const payloads: Array<{ body: string }> = [
      { body: '{' },
      { body: JSON.stringify({ post: '', action: 'like' }) },
      { body: JSON.stringify({ post: 'https://evil', action: 'like' }) },
      { body: JSON.stringify({ post: POST, action: 'clap' }) },
    ];
    for (const payload of payloads) {
      const response = await onRequestPost({
        request: req(`${BASE}/api/post-likes`, { method: 'POST', body: payload.body }),
        env,
      });
      expect(response.status).toBe(400);
    }
  });

  it('GET 缺少或非法文章键返回 400', async () => {
    const db = createFakeD1();
    const env = { DB: db, COMMENTS_SALT: 'salt' };
    for (const query of ['', '?post=', '?post=https%3A%2F%2Fevil']) {
      const response = await onRequestGet({ request: req(`${BASE}/api/post-likes${query}`), env });
      expect(response.status).toBe(400);
    }
  });

  it('缺少 D1 或盐返回 503', async () => {
    const db = createFakeD1();
    const readUrl = `${BASE}/api/post-likes?post=${encodeURIComponent(POST)}`;
    const noDb = await onRequestGet({ request: req(readUrl), env: {} });
    expect(noDb.status).toBe(503);
    expect((await read(noDb)).error).toBe('db-missing');

    const noSalt = await onRequestGet({ request: req(readUrl), env: { DB: db } });
    expect(noSalt.status).toBe(503);
    expect((await read(noSalt)).error).toBe('salt-missing');
  });

  it('CORS 允许白名单并拒绝未知来源', async () => {
    const db = createFakeD1();
    const env = { DB: db, COMMENTS_SALT: 'salt' };
    const allowed = await onRequestGet({
      request: req(`${BASE}/api/post-likes?post=${encodeURIComponent(POST)}`, {
        headers: { Origin: 'https://liyukki.github.io' },
      }),
      env,
    });
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://liyukki.github.io');

    const denied = await onRequestGet({
      request: req(`${BASE}/api/post-likes?post=${encodeURIComponent(POST)}`, {
        headers: { Origin: 'https://evil.example' },
      }),
      env,
    });
    expect(denied.status).toBe(403);
  });

  it('OPTIONS 返回 204 与 CORS 头', async () => {
    const response = await onRequestOptions({
      request: req(`${BASE}/api/post-likes`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://liyukki.github.io' },
      }),
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://liyukki.github.io');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('响应禁用缓存', async () => {
    const db = createFakeD1();
    const response = await onRequestGet({
      request: req(`${BASE}/api/post-likes?post=${encodeURIComponent(POST)}`),
      env: { DB: db, COMMENTS_SALT: 'salt' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
