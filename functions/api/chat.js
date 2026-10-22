/**
 * AI 聊天代理（Cloudflare Pages Function）。
 *
 * 浏览器只向本站 POST /api/chat；本函数校验来源、消息和 D1 限流后，
 * 从 Cloudflare Secret 读取上游密钥并调用 OpenAI 兼容接口。
 * 密钥、上游地址和 Authorization 都不会进入浏览器。
 */
import { isAllowedOrigin, sha256Hex } from './comments.js';

export const CHAT_LIMITS = Object.freeze({
  messagesMax: 20,
  contentMax: 8000,
  bodyBytesMax: 128 * 1024,
  minuteMs: 60_000,
  minuteMax: 8,
  dayMs: 86_400_000,
  dayMax: 80,
  outputTokensMax: 800,
});

export const CHAT_SYSTEM_PROMPT =
  '你是 yukki rui 个人网站里的 AI 助手。默认使用与用户相同的语言，回答简洁、友善、准确；不确定时明确说明，不要编造。不要声称自己是站长本人。';

const DEFAULT_API_BASE = 'https://token.astrumflow.com/v1';
const DEFAULT_MODEL = 'gemma-4-26b-a4b-it';
const SCHEMA = `CREATE TABLE IF NOT EXISTS ai_chat_limits (
  ip_hash TEXT NOT NULL,
  window_kind TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, window_kind)
)`;

const schemaReady = new WeakMap();

export async function ensureChatSchema(db) {
  const pending = schemaReady.get(db);
  if (pending) return pending;
  const task = db.prepare(SCHEMA).run().catch((error) => {
    schemaReady.delete(db);
    throw error;
  });
  schemaReady.set(db, task);
  return task;
}

export function validateChatPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.messages)) {
    return { ok: false, error: 'invalid-messages', message: '消息列表不合法' };
  }
  if (payload.messages.length === 0) {
    return { ok: false, error: 'invalid-messages', message: '消息不能为空' };
  }
  if (payload.messages.length > CHAT_LIMITS.messagesMax) {
    return { ok: false, error: 'too-many-messages', message: `最多 ${CHAT_LIMITS.messagesMax} 条消息` };
  }

  const messages = [];
  for (const item of payload.messages) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'invalid-message', message: '消息格式不合法' };
    }
    if (item.role !== 'user' && item.role !== 'assistant') {
      return { ok: false, error: 'invalid-role', message: '消息角色不合法' };
    }
    if (typeof item.content !== 'string') {
      return { ok: false, error: 'invalid-content', message: '消息内容不合法' };
    }
    const content = item.content.trim();
    if (!content) return { ok: false, error: 'empty-message', message: '消息内容不能为空' };
    if ([...content].length > CHAT_LIMITS.contentMax) {
      return { ok: false, error: 'message-too-long', message: `单条消息最多 ${CHAT_LIMITS.contentMax} 个字符` };
    }
    messages.push({ role: item.role, content });
  }

  if (messages[messages.length - 1].role !== 'user') {
    return { ok: false, error: 'last-message-not-user', message: '最后一条消息必须来自用户' };
  }
  return { ok: true, messages };
}

export function chatCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (!origin || !isAllowedOrigin(origin, request.url)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function jsonResponse(request, body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...chatCorsHeaders(request),
    },
  });
}

function errorResponse(request, status, error, message) {
  return jsonResponse(request, { error, message }, status);
}

export function onRequestOptions(context) {
  const { request } = context;
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, request.url)) {
    return errorResponse(request, 403, 'origin-not-allowed', '来源不被允许');
  }
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store', ...chatCorsHeaders(request) },
  });
}

/**
 * 给分钟与日窗口各记一次，并在超过阈值时返回对应窗口。
 * 被拒绝的请求也计数，防止反复撞限流消耗上游额度。
 */
export async function reserveRateLimit(db, ipHash, now) {
  await ensureChatSchema(db);
  const windows = [
    { kind: 'minute', duration: CHAT_LIMITS.minuteMs, max: CHAT_LIMITS.minuteMax },
    { kind: 'day', duration: CHAT_LIMITS.dayMs, max: CHAT_LIMITS.dayMax },
  ];

  for (const window of windows) {
    const start = Math.floor(now / window.duration) * window.duration;
    await db
      .prepare(
        `INSERT INTO ai_chat_limits (ip_hash, window_kind, window_start, count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(ip_hash, window_kind) DO UPDATE SET
           count = CASE
             WHEN ai_chat_limits.window_start = excluded.window_start THEN ai_chat_limits.count + 1
             ELSE 1
           END,
           window_start = excluded.window_start`,
      )
      .bind(ipHash, window.kind, start)
      .run();
    const row = await db
      .prepare('SELECT count FROM ai_chat_limits WHERE ip_hash = ? AND window_kind = ?')
      .bind(ipHash, window.kind)
      .first();
    if (Number(row?.count ?? 0) > window.max) return window.kind;
  }
  return 'ok';
}

function clientIp(request) {
  const direct = request.headers.get('CF-Connecting-IP');
  if (direct) return direct.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return '0.0.0.0';
}

function upstreamBase(env) {
  const raw = typeof env?.AI_API_BASE === 'string' && env.AI_API_BASE.trim()
    ? env.AI_API_BASE.trim()
    : DEFAULT_API_BASE;
  try {
    const url = new URL(raw);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    return url.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function upstreamError(status) {
  if (status === 401 || status === 403) {
    return { status: 502, error: 'upstream-auth', message: 'AI 服务授权失败' };
  }
  if (status === 429) {
    return { status: 429, error: 'ai-rate-limited', message: 'AI 上游请求过于频繁' };
  }
  return { status: 502, error: 'upstream-unavailable', message: 'AI 服务暂时不可用' };
}

function normalizeUpstreamJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return '';
  }
  const choice = data?.choices?.[0];
  const content = choice?.message?.content ?? choice?.delta?.content ?? choice?.text;
  return typeof content === 'string' ? content : '';
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, request.url)) {
    return errorResponse(request, 403, 'origin-not-allowed', '来源不被允许');
  }

  const key = typeof env?.AI_API_KEY === 'string' ? env.AI_API_KEY.trim() : '';
  if (!key) return errorResponse(request, 503, 'ai-not-configured', 'AI 服务尚未配置');
  if (!env?.DB) return errorResponse(request, 503, 'rate-limit-unavailable', 'AI 限流服务尚未配置');
  const salt = typeof env?.COMMENTS_SALT === 'string' ? env.COMMENTS_SALT.trim() : '';
  if (!salt) return errorResponse(request, 503, 'rate-limit-unavailable', 'AI 限流服务尚未配置');

  const base = upstreamBase(env);
  if (!base) return errorResponse(request, 503, 'ai-not-configured', 'AI 服务地址配置无效');

  let raw;
  try {
    raw = await request.text();
  } catch {
    return errorResponse(request, 400, 'invalid-json', '请求内容不合法');
  }
  if (new TextEncoder().encode(raw).byteLength > CHAT_LIMITS.bodyBytesMax) {
    return errorResponse(request, 413, 'payload-too-large', '请求内容过长');
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return errorResponse(request, 400, 'invalid-json', '请求内容不合法');
  }
  const checked = validateChatPayload(payload);
  if (!checked.ok) return errorResponse(request, 400, checked.error, checked.message);

  const ipHash = await sha256Hex(`${clientIp(request)}:${salt}`);
  const limit = await reserveRateLimit(env.DB, ipHash, Date.now());
  if (limit !== 'ok') {
    return errorResponse(request, 429, 'rate-limited', '请求太频繁，请稍后再试');
  }

  const model = typeof env.AI_MODEL === 'string' && env.AI_MODEL.trim() ? env.AI_MODEL.trim() : DEFAULT_MODEL;
  let upstream;
  try {
    upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: CHAT_SYSTEM_PROMPT }, ...checked.messages],
        temperature: 0.7,
        max_tokens: CHAT_LIMITS.outputTokensMax,
        stream: true,
      }),
      signal: request.signal,
    });
  } catch {
    return errorResponse(request, 502, 'upstream-unavailable', 'AI 服务暂时不可用');
  }

  if (!upstream.ok) {
    const mapped = upstreamError(upstream.status);
    return errorResponse(request, mapped.status, mapped.error, mapped.message);
  }

  const contentType = upstream.headers.get('Content-Type') || '';
  if (contentType.toLowerCase().includes('text/event-stream')) {
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
        ...chatCorsHeaders(request),
      },
    });
  }

  const text = await upstream.text().catch(() => '');
  const content = normalizeUpstreamJson(text);
  if (!content) {
    return errorResponse(request, 502, 'upstream-invalid', 'AI 服务返回了无法识别的响应');
  }
  const event = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
  return new Response(event, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      ...chatCorsHeaders(request),
    },
  });
}
