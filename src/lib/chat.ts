/** AI 聊天小窗的纯逻辑：接口地址、消息规整、SSE 解析与错误文案。 */
import { UI, type Lang } from '../consts';
import { buildAiContext, type AiContext, type AiIndex } from './ai-context';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export const CHAT_MESSAGES_MAX = 20;
export const CHAT_MESSAGE_MAX = 8000;
export const CHAT_INPUT_MAX = 2000;

export interface ChatI18n {
  title: string;
  online: string;
  clear: string;
  close: string;
  open: string;
  welcome: string;
  placeholder: string;
  send: string;
  stop: string;
  thinking: string;
  inputHint: string;
  noReply: string;
  notConfigured: string;
  authFailed: string;
  rateLimited: string;
  unavailable: string;
  invalid: string;
  failed: string;
  contextUnavailable: string;
  sources: string;
  quickSummary: string;
  quickPoints: string;
  quickExplain: string;
  quickRelated: string;
}

export interface ChatPageContext {
  lang: Lang;
  articleId: string;
}

export interface ChatRequestPayload {
  messages: ChatMessage[];
  context?: AiContext;
}

/** Return the same localized chat copy on the server and after SPA navigation. */
export function chatI18n(lang: Lang): ChatI18n {
  const t = UI[lang];
  return {
    title: t.aiTitle,
    online: t.aiOnline,
    clear: t.aiClear,
    close: t.aiClose,
    open: t.aiOpen,
    welcome: t.aiWelcome,
    placeholder: t.aiPlaceholder,
    send: t.aiSend,
    stop: t.aiStop,
    thinking: t.aiThinking,
    inputHint: t.aiInputHint,
    noReply: t.aiNoReply,
    notConfigured: t.aiNotConfigured,
    authFailed: t.aiAuthFailed,
    rateLimited: t.aiRateLimited,
    unavailable: t.aiUnavailable,
    invalid: t.aiInvalid,
    failed: t.aiFailed,
    contextUnavailable: t.aiContextUnavailable,
    sources: t.aiSources,
    quickSummary: t.aiQuickSummary,
    quickPoints: t.aiQuickPoints,
    quickExplain: t.aiQuickExplain,
    quickRelated: t.aiQuickRelated,
  };
}

/**
 * Resolve the current page marker before falling back to the persisted chat
 * root. A present marker with an empty article id intentionally clears the
 * previous article context.
 */
export function resolveChatPageContext(
  marker: { lang?: string; articleId?: string } | null,
  current: ChatPageContext,
): ChatPageContext {
  const lang = marker?.lang === 'zh' || marker?.lang === 'en' ? marker.lang : current.lang;
  const articleId = marker ? marker.articleId ?? '' : current.articleId;
  return { lang, articleId };
}

export function shouldShowQuickPrompts(contextEnabled: boolean, articleId: string, historyLength: number): boolean {
  return contextEnabled && articleId !== '' && historyLength === 0;
}

export function buildChatRequestPayload(
  messages: ChatMessage[],
  question: string,
  lang: Lang,
  articleId: string,
  index: AiIndex | null,
): ChatRequestPayload {
  const context = index ? buildAiContext(index, question, lang, articleId || undefined) : undefined;
  return context ? { messages, context } : { messages };
}

/**
 * 构建期决定聊天接口地址：
 * - 与主站同源（Cloudflare）→ 空串，运行期走相对路径；
 * - GitHub Pages 镜像 → 主站绝对地址，跨域调用主站代理。
 */
export function chatEndpoint(siteOrigin: string, productionOrigin: string): string {
  const site = normalizeOrigin(siteOrigin);
  const production = normalizeOrigin(productionOrigin);
  if (!production || site === production) return '';
  return `${production}/api/chat`;
}

/** 运行期选择请求地址；本机预览始终走本地 Pages Functions。 */
export function chatApiUrl(pageOrigin: string, buildEndpoint: string): string {
  const endpoint = String(buildEndpoint ?? '').trim();
  const origin = normalizeOrigin(pageOrigin);
  if (!endpoint || isLocalOrigin(origin)) return '/api/chat';
  try {
    if (new URL(endpoint).origin === origin) return '/api/chat';
  } catch {
    return '/api/chat';
  }
  return endpoint;
}

/**
 * 只保留可安全发送给代理的 user / assistant 文本消息。
 * 对非字符串内容不做 String() 转换，避免恶意对象触发副作用。
 */
export function normalizeChatMessages(messages: unknown, maxMessages = CHAT_MESSAGES_MAX): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  const limit = Number.isSafeInteger(maxMessages) && maxMessages > 0 ? maxMessages : CHAT_MESSAGES_MAX;
  const normalized: ChatMessage[] = [];
  for (const item of messages) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { role?: unknown; content?: unknown };
    if (record.role !== 'user' && record.role !== 'assistant') continue;
    if (typeof record.content !== 'string') continue;
    const content = record.content.trim();
    if (!content || [...content].length > CHAT_MESSAGE_MAX) continue;
    normalized.push({ role: record.role, content });
  }
  return normalized.slice(-limit);
}

/** 从一条 SSE data 中取出增量文本；兼容常见 OpenAI 返回形状。 */
export function extractChatDelta(data: string): string {
  const raw = String(data ?? '').trim();
  if (!raw || raw === '[DONE]') return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return '';
  }
  if (!parsed || typeof parsed !== 'object') return '';
  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const choice = choices[0];
  if (!choice || typeof choice !== 'object') return '';
  const record = choice as {
    delta?: { content?: unknown };
    message?: { content?: unknown };
    text?: unknown;
  };
  const value = record.delta?.content ?? record.message?.content ?? record.text;
  return typeof value === 'string' ? value : '';
}

/**
 * 增量 SSE 解析器。事件可能被网络拆成任意 chunk，必须保留跨 chunk 的缓冲；
 * 多行 data 按 SSE 规范用换行拼接，注释行与空事件忽略。
 */
export function createSseParser(onData: (data: string) => void): { push(chunk: string): void; finish(): void } {
  let buffer = '';

  const emit = (event: string) => {
    if (!event.trim()) return;
    const dataLines: string[] = [];
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (dataLines.length > 0) onData(dataLines.join('\n'));
  };

  return {
    push(chunk: string) {
      buffer += String(chunk ?? '');
      while (true) {
        const match = /\r?\n\r?\n/.exec(buffer);
        if (!match) break;
        const event = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        emit(event);
      }
    },
    finish() {
      if (buffer.trim()) emit(buffer);
      buffer = '';
    },
  };
}

/** 服务端错误码 → 可直接显示给读者的双语文案。 */
export function chatErrorMessage(status: number, code: string | undefined, lang: Lang): string {
  const key = String(code ?? '');
  if (lang === 'en') {
    if (key === 'ai-not-configured') return 'The AI assistant is not configured yet.';
    if (key === 'upstream-auth') return 'The AI service authorization failed. Please try again later.';
    if (key === 'ai-rate-limited' || key === 'rate-limited' || status === 429) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    if (key === 'upstream-unavailable' || status >= 500) {
      return 'The AI service is temporarily unavailable. Please try again later.';
    }
    if (status === 400 || key.startsWith('invalid-') || key === 'payload-too-large') {
      return 'That message could not be sent. Please edit it and try again.';
    }
    return 'Something went wrong. Please try again.';
  }

  if (key === 'ai-not-configured') return 'AI 服务尚未配置，请稍后再试。';
  if (key === 'upstream-auth') return 'AI 服务授权失败，请稍后再试。';
  if (key === 'ai-rate-limited' || key === 'rate-limited' || status === 429) {
    return '请求太频繁了，请稍后再试。';
  }
  if (key === 'upstream-unavailable' || status >= 500) return 'AI 服务暂时不可用，请稍后再试。';
  if (status === 400 || key.startsWith('invalid-') || key === 'payload-too-large') {
    return '消息不合法，请修改后再试。';
  }
  return '出了点问题，请稍后再试。';
}

function normalizeOrigin(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function isLocalOrigin(origin: string): boolean {
  const host = origin
    .replace(/^[a-z]+:\/\//i, '')
    .split('/')[0]
    .split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

