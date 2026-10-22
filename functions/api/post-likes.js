/**
 * 文章点赞 API（Cloudflare Pages Functions）。
 *
 *   GET  /api/post-likes?post=<postKey>
 *   POST /api/post-likes { post, action: 'like' | 'unlike' }
 *   OPTIONS /api/post-likes
 *
 * 免登录；同一 IP 对同一篇文章只保存一条记录，只存加盐 IP 哈希。
 * postKey 由构建期根据 translationKey / 文章 id 生成，中英文译文共享计数。
 */
import {
  clientIp,
  commentHashSalt,
  corsHeaders,
  isAllowedOrigin,
  sha256Hex,
} from './comments.js';

const POST_KEY_RE = /^(?:translation|post):[^\s\u0000-\u001f\u007f]{1,180}$/u;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS post_likes (
    post_key TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_key, ip_hash)
  )`,
];

const schemaReady = new WeakMap();

async function ensurePostLikesSchema(db) {
  const pending = schemaReady.get(db);
  if (pending) return pending;
  const task = (async () => {
    for (const sql of SCHEMA) await db.prepare(sql).run();
  })().catch((error) => {
    schemaReady.delete(db);
    throw error;
  });
  schemaReady.set(db, task);
  return task;
}

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request),
    },
  });
}

function errorResponse(request, status, error, message) {
  return jsonResponse(request, { error, message }, status);
}

/** 只接受前端生成的两类稳定键；不把键当作权限凭证。 */
export function normalizePostKey(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return POST_KEY_RE.test(value) ? value : null;
}

async function countFor(db, postKey) {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM post_likes WHERE post_key = ?')
    .bind(postKey)
    .first();
  return Number(row?.n ?? 0);
}

async function likedFor(db, postKey, ipHash) {
  const row = await db
    .prepare('SELECT 1 AS liked FROM post_likes WHERE post_key = ? AND ip_hash = ? LIMIT 1')
    .bind(postKey, ipHash)
    .first();
  return Boolean(row);
}

async function stateFor(db, postKey, ipHash) {
  return {
    count: await countFor(db, postKey),
    liked: await likedFor(db, postKey, ipHash),
  };
}

export async function onRequestOptions(context) {
  const { request } = context;
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, request.url)) {
    return errorResponse(request, 403, 'origin-not-allowed', '来源不被允许');
  }
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store', ...corsHeaders(request) },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, request.url)) {
    return errorResponse(request, 403, 'origin-not-allowed', '来源不被允许');
  }
  if (!env || !env.DB) return errorResponse(request, 503, 'db-missing', '点赞服务还没配置好');

  const postKey = normalizePostKey(new URL(request.url).searchParams.get('post'));
  if (!postKey) return errorResponse(request, 400, 'invalid-post', '文章标识不合法');

  const salt = commentHashSalt(env);
  if (!salt) return errorResponse(request, 503, 'salt-missing', '点赞服务还没配置好');

  await ensurePostLikesSchema(env.DB);
  const ipHash = await sha256Hex(`${clientIp(request)}:${salt}`);
  return jsonResponse(request, await stateFor(env.DB, postKey, ipHash), 200);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, request.url)) {
    return errorResponse(request, 403, 'origin-not-allowed', '来源不被允许');
  }
  if (!env || !env.DB) return errorResponse(request, 503, 'db-missing', '点赞服务还没配置好');

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(request, 400, 'invalid-json', '请求内容不合法');
  }

  const postKey = normalizePostKey(payload?.post);
  if (!postKey) return errorResponse(request, 400, 'invalid-post', '文章标识不合法');
  const action = payload?.action;
  if (action !== 'like' && action !== 'unlike') {
    return errorResponse(request, 400, 'invalid-action', '点赞操作不合法');
  }

  const salt = commentHashSalt(env);
  if (!salt) return errorResponse(request, 503, 'salt-missing', '点赞服务还没配置好');

  await ensurePostLikesSchema(env.DB);
  const ipHash = await sha256Hex(`${clientIp(request)}:${salt}`);

  if (action === 'like') {
    await env.DB
      .prepare(
        'INSERT OR IGNORE INTO post_likes (post_key, ip_hash, created_at) VALUES (?, ?, ?)',
      )
      .bind(postKey, ipHash, new Date().toISOString())
      .run();
  } else {
    await env.DB
      .prepare('DELETE FROM post_likes WHERE post_key = ? AND ip_hash = ?')
      .bind(postKey, ipHash)
      .run();
  }

  return jsonResponse(request, await stateFor(env.DB, postKey, ipHash), 200);
}
