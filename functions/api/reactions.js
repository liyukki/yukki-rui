/**
 * 评论表情反应 API(Cloudflare Pages Functions)。
 *
 *   GET  /api/reactions?ids=1,2,3          批量读计数与当前 IP 已点类型
 *   POST /api/reactions { commentId, reaction, active? }
 *        给评论加一个反应(active !== false);active === false 时取消自己的反应。
 *   OPTIONS /api/reactions
 *
 * 免登录;同一 IP + 同一评论 + 同一反应由 UNIQUE 约束去重,只存加盐 IP 哈希。
 * 反应不接入 GitHub Issue 通知,避免每点一次都产生运营噪音。
 */
import {
  commentHashSalt,
  corsHeaders,
  ensureSchema as ensureCommentsSchema,
  isAllowedOrigin,
  sha256Hex,
} from './comments.js';

export const REACTIONS = ['like', 'love', 'useful'];
const MAX_IDS = 50;

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

const schemaReady = new WeakMap();

async function ensureReactionsSchema(db) {
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

function clientIp(request) {
  const direct = request.headers.get('CF-Connecting-IP');
  if (direct) return direct.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return '0.0.0.0';
}

function parseCommentId(raw) {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function emptyCounts() {
  return Object.fromEntries(REACTIONS.map((reaction) => [reaction, 0]));
}

async function countsFor(db, commentId) {
  const counts = emptyCounts();
  const rows = await db
    .prepare('SELECT reaction, COUNT(*) AS n FROM comment_reactions WHERE comment_id = ? GROUP BY reaction')
    .bind(commentId)
    .all();
  for (const row of Array.isArray(rows?.results) ? rows.results : []) {
    const reaction = String(row.reaction ?? '');
    if (reaction in counts) counts[reaction] = Number(row.n ?? 0);
  }
  return counts;
}

async function mineFor(db, commentId, ipHash) {
  const rows = await db
    .prepare('SELECT reaction FROM comment_reactions WHERE comment_id = ? AND ip_hash = ?')
    .bind(commentId, ipHash)
    .all();
  return (Array.isArray(rows?.results) ? rows.results : [])
    .map((row) => String(row.reaction ?? ''))
    .filter((reaction) => REACTIONS.includes(reaction));
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
  if (!env || !env.DB) return errorResponse(request, 503, 'db-missing', '评论服务还没配置好');

  const url = new URL(request.url);
  const raw = url.searchParams.get('ids') ?? '';
  const ids = [...new Set(raw.split(',').map(parseCommentId).filter((id) => id !== null))].slice(0, MAX_IDS);

  const salt = commentHashSalt(env);
  if (!salt) return errorResponse(request, 503, 'salt-missing', '评论服务还没配置好');

  await ensureCommentsSchema(env.DB);
  await ensureReactionsSchema(env.DB);

  const counts = Object.fromEntries(ids.map((id) => [String(id), emptyCounts()]));
  const mine = Object.fromEntries(ids.map((id) => [String(id), []]));

  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await env.DB
      .prepare(`SELECT comment_id, reaction, COUNT(*) AS n FROM comment_reactions
        WHERE comment_id IN (${placeholders}) GROUP BY comment_id, reaction`)
      .bind(...ids)
      .all();
    for (const row of Array.isArray(rows?.results) ? rows.results : []) {
      const key = String(row.comment_id ?? '');
      const reaction = String(row.reaction ?? '');
      if (counts[key] && reaction in counts[key]) counts[key][reaction] = Number(row.n ?? 0);
    }

    const ipHash = await sha256Hex(`${clientIp(request)}:${salt}`);
    const mineRows = await env.DB
      .prepare(`SELECT comment_id, reaction FROM comment_reactions
        WHERE ip_hash = ? AND comment_id IN (${placeholders})`)
      .bind(ipHash, ...ids)
      .all();
    for (const row of Array.isArray(mineRows?.results) ? mineRows.results : []) {
      const key = String(row.comment_id ?? '');
      const reaction = String(row.reaction ?? '');
      if (mine[key] && REACTIONS.includes(reaction)) mine[key].push(reaction);
    }
  }

  return jsonResponse(request, { counts, mine }, 200);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, request.url)) {
    return errorResponse(request, 403, 'origin-not-allowed', '来源不被允许');
  }
  if (!env || !env.DB) return errorResponse(request, 503, 'db-missing', '评论服务还没配置好');

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(request, 400, 'invalid-json', '请求内容不合法');
  }

  const commentId = parseCommentId(payload?.commentId);
  if (commentId === null) return errorResponse(request, 400, 'invalid-comment', '评论编号不合法');
  const reaction = payload?.reaction;
  if (typeof reaction !== 'string' || !REACTIONS.includes(reaction)) {
    return errorResponse(request, 400, 'invalid-reaction', '反应类型不合法');
  }
  if (payload.active !== undefined && typeof payload.active !== 'boolean') {
    return errorResponse(request, 400, 'invalid-active', '反应状态不合法');
  }

  await ensureCommentsSchema(env.DB);
  await ensureReactionsSchema(env.DB);

  const comment = await env.DB
    .prepare('SELECT id FROM comments WHERE id = ? AND hidden = 0')
    .bind(commentId)
    .first();
  if (!comment) return errorResponse(request, 404, 'comment-not-found', '评论不存在');

  const salt = commentHashSalt(env);
  if (!salt) return errorResponse(request, 503, 'salt-missing', '评论服务还没配置好');
  const ipHash = await sha256Hex(`${clientIp(request)}:${salt}`);
  if (payload?.active === false) {
    await env.DB
      .prepare('DELETE FROM comment_reactions WHERE comment_id = ? AND reaction = ? AND ip_hash = ?')
      .bind(commentId, reaction, ipHash)
      .run();
  } else {
    await env.DB
      .prepare(
        'INSERT OR IGNORE INTO comment_reactions (comment_id, reaction, ip_hash, created_at) VALUES (?, ?, ?, ?)',
      )
      .bind(commentId, reaction, ipHash, new Date().toISOString())
      .run();
  }

  const counts = await countsFor(env.DB, commentId);
  const mine = await mineFor(env.DB, commentId, ipHash);
  return jsonResponse(request, { counts, mine }, 200);
}
