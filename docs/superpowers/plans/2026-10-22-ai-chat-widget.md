# AI 聊天小窗代理与加密 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Astro 站点右下角加入由 Cloudflare Pages Function 代理的 AI 聊天小窗，密钥不进入浏览器或仓库，且不改变既有页面布局与视觉语言。

**Architecture:** 浏览器只向 `/api/chat` 发送 `{ messages }`；Pages Function 校验来源、消息、D1 限流，从 Cloudflare Secret 读取 `AI_API_KEY`，再以 OpenAI Chat Completions 协议调用上游并把 SSE 流原样返回。GitHub Pages 镜像跨域调用主站代理；前端使用 `textContent` 渲染纯文本，所有 UI 都是固定在右下角的独立覆盖层。

**Tech Stack:** Astro 7、TypeScript、Vitest 5、Cloudflare Pages Functions、D1、原生 Fetch/SSE、Playwright（本地 Edge 验收）。

## Global Constraints

- 上游默认地址：`https://token.astrumflow.com/v1`。
- 固定模型：`gemma-4-26b-a4b-it`。
- `AI_API_KEY` 只能存为 Cloudflare Pages Secret；不得出现在 `src/`、`public/`、测试快照或 Git 历史中。
- 浏览器不得直接访问上游地址，也不得携带 `Authorization`。
- 单次最多 20 条消息，单条最多 8000 字符，最后一条必须是 `user`。
- 前端输入框最多 2000 字符；服务端最多输出 800 tokens。
- 每 IP 每分钟最多 10 次、每天最多 800 次；IP 仅存 `sha256(IP + COMMENTS_SALT)`。
- 不修改页头、页脚、主内容宽度、配色令牌或现有页面结构；聊天组件只追加固定定位 DOM。
- 模型输出只能通过 `textContent` 写入页面，禁止 `innerHTML`。
- `prefers-reduced-motion: reduce` 时使用静态 PNG，不播放 GIF。

---

### Task 1: 聊天纯函数与 SSE 解析

**Files:**
- Create: `src/lib/chat.ts`
- Create: `tests/chat.test.ts`

**Interfaces:**
- Consumes: `Lang` from `src/consts.ts`。
- Produces:
  - `type ChatRole = 'user' | 'assistant'`
  - `interface ChatMessage { role: ChatRole; content: string }`
  - `chatEndpoint(siteOrigin: string, productionOrigin: string): string`
  - `chatApiUrl(pageOrigin: string, buildEndpoint: string): string`
  - `normalizeChatMessages(messages: unknown, maxMessages?: number): ChatMessage[]`
  - `extractChatDelta(data: string): string`
  - `createSseParser(onData: (data: string) => void): { push(chunk: string): void; finish(): void }`
  - `chatErrorMessage(status: number, code: string | undefined, lang: Lang): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/chat.test.ts` with these behaviors:

```ts
import { describe, expect, it } from 'vitest';
import {
  chatApiUrl,
  chatEndpoint,
  chatErrorMessage,
  createSseParser,
  extractChatDelta,
  normalizeChatMessages,
} from '../src/lib/chat';

describe('chatEndpoint / chatApiUrl', () => {
  it('Cloudflare 同源使用相对地址', () => {
    expect(chatEndpoint('https://yukki-rui.pages.dev', 'https://yukki-rui.pages.dev')).toBe('');
    expect(chatApiUrl('https://yukki-rui.pages.dev', '')).toBe('/api/chat');
  });

  it('GitHub Pages 镜像使用主站地址', () => {
    expect(chatEndpoint('https://liyukki.github.io', 'https://yukki-rui.pages.dev')).toBe(
      'https://yukki-rui.pages.dev/api/chat',
    );
    expect(chatApiUrl('https://liyukki.github.io', 'https://yukki-rui.pages.dev/api/chat')).toBe(
      'https://yukki-rui.pages.dev/api/chat',
    );
  });
});

describe('normalizeChatMessages', () => {
  it('过滤空白与非法角色，只保留最后 20 条', () => {
    const input = [
      { role: 'system', content: 'ignore' },
      { role: 'user', content: '  第一问  ' },
      { role: 'assistant', content: '第一答' },
      { role: 'user', content: '   ' },
      ...Array.from({ length: 21 }, (_, i) => ({ role: 'user', content: `问 ${i}` })),
    ];
    const result = normalizeChatMessages(input);
    expect(result).toHaveLength(20);
    expect(result[0].content).toBe('问 1');
    expect(result.at(-1)?.content).toBe('问 20');
    expect(result.every((item) => item.role === 'user' || item.role === 'assistant')).toBe(true);
  });
});

describe('extractChatDelta', () => {
  it('读取 OpenAI 流式 delta', () => {
    expect(extractChatDelta(JSON.stringify({ choices: [{ delta: { content: '你好' } }] }))).toBe('你好');
  });

  it('兼容 message.content、text 和 [DONE]', () => {
    expect(extractChatDelta(JSON.stringify({ choices: [{ message: { content: '完整回复' } }] }))).toBe('完整回复');
    expect(extractChatDelta(JSON.stringify({ choices: [{ text: '旧格式' }] }))).toBe('旧格式');
    expect(extractChatDelta('[DONE]')).toBe('');
  });
});

describe('createSseParser', () => {
  it('跨 chunk 拼接并处理多行 data', () => {
    const output: string[] = [];
    const parser = createSseParser((data) => output.push(data));
    parser.push('data: {"choices":[{"delta":');
    parser.push('{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\r');
    parser.push('\n\r\n');
    parser.finish();
    expect(output).toHaveLength(2);
    expect(JSON.parse(output[0]).choices[0].delta.content).toBe('你');
    expect(JSON.parse(output[1]).choices[0].delta.content).toBe('好');
  });

  it('忽略注释与空事件', () => {
    const output: string[] = [];
    const parser = createSseParser((data) => output.push(data));
    parser.push(': keep-alive\n\n\n');
    parser.push('data: [DONE]\n\n');
    parser.finish();
    expect(output).toEqual(['[DONE]']);
  });
});

describe('chatErrorMessage', () => {
  it('把关键错误映射成可直接展示的双语文案', () => {
    expect(chatErrorMessage(503, 'ai-not-configured', 'zh')).toContain('尚未配置');
    expect(chatErrorMessage(429, 'rate-limited', 'zh')).toContain('太频繁');
    expect(chatErrorMessage(429, 'ai-rate-limited', 'en')).toContain('Too many');
    expect(chatErrorMessage(502, 'upstream-unavailable', 'en')).toContain('unavailable');
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- tests/chat.test.ts`

Expected: FAIL because `src/lib/chat.ts` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Create `src/lib/chat.ts`. Implementation requirements:

```ts
import type { Lang } from '../consts';

export type ChatRole = 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string }

export const CHAT_MESSAGE_MAX = 8000;
export const CHAT_MESSAGES_MAX = 20;

export function chatEndpoint(siteOrigin: string, productionOrigin: string): string;
export function chatApiUrl(pageOrigin: string, buildEndpoint: string): string;
export function normalizeChatMessages(messages: unknown, maxMessages = CHAT_MESSAGES_MAX): ChatMessage[];
export function extractChatDelta(data: string): string;
export function createSseParser(onData: (data: string) => void): { push(chunk: string): void; finish(): void };
export function chatErrorMessage(status: number, code: string | undefined, lang: Lang): string;
```

`createSseParser` must normalize CRLF, preserve event boundaries across chunks, join multiple `data:` lines with `\n`, ignore `:` comments and empty events. `normalizeChatMessages` must not call `String()` on hostile objects: only accept string `content`.

- [ ] **Step 4: Run the test and confirm GREEN**

Run: `npm test -- tests/chat.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/chat.ts tests/chat.test.ts
git commit -m "feat(chat): 添加聊天纯函数与 SSE 解析"
```

---

### Task 2: Cloudflare Pages 代理、限流与密钥隔离

**Files:**
- Create: `functions/api/chat.js`
- Create: `tests/chat-functions.test.ts`
- Reuse: `functions/api/comments.js` (`isAllowedOrigin`, `sha256Hex`), `tests/helpers/fake-d1.ts`

**Interfaces:**
- Consumes: `POST /api/chat` body `{ messages: Array<{ role: 'user' | 'assistant'; content: string }> }`；环境变量 `AI_API_KEY`、`AI_API_BASE`、`AI_MODEL`、`DB`、`COMMENTS_SALT`。
- Produces:
  - `onRequestOptions(context): Response` → 204
  - `onRequestPost(context): Promise<Response>` → SSE 或 JSON 错误
  - `validateChatPayload(payload): { ok: true, messages: ChatMessage[] } | { ok: false, error: string, message: string }`
  - `reserveRateLimit(db, ipHash, now): Promise<'ok' | 'minute' | 'day'>`
  - `chatCorsHeaders(request): Record<string, string>`

- [ ] **Step 1: Write the failing proxy tests**

Create `tests/chat-functions.test.ts` covering:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  onRequestOptions,
  onRequestPost,
  reserveRateLimit,
  validateChatPayload,
} from '../functions/api/chat.js';
import { createFakeD1 } from './helpers/fake-d1';

const BASE = 'https://yukki-rui.pages.dev';

function payload(messages = [{ role: 'user', content: '你好' }]) {
  return JSON.stringify({ messages });
}

function req(body = payload(), headers: Record<string, string> = {}) {
  return new Request(`${BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.8',
      ...headers,
    },
    body,
  });
}

function env() {
  return {
    AI_API_KEY: 'server-secret',
    AI_API_BASE: 'https://token.astrumflow.com/v1',
    AI_MODEL: 'gemma-4-26b-a4b-it',
    DB: createFakeD1(),
    COMMENTS_SALT: 'vitest-salt',
  };
}
```

Required assertions:

- `validateChatPayload` accepts valid text and trims content.
- It rejects non-array, >20 messages, non-user/assistant role, empty content, >8000 characters, and last assistant.
- `OPTIONS` from `https://liyukki.github.io` returns 204 with exact origin CORS header; evil origin returns 403 and no CORS header.
- Missing `AI_API_KEY` returns 503 `ai-not-configured` without calling `fetch`.
- Missing `DB` or `COMMENTS_SALT` returns 503 without calling `fetch`.
- Valid request calls `fetch` exactly once with:
  - URL `https://token.astrumflow.com/v1/chat/completions`
  - `method: 'POST'`
  - `Authorization: Bearer server-secret`
  - a JSON body containing fixed `model`, `stream: true`, `max_tokens: 800`, system message, and user message.
- A mock `text/event-stream` upstream body is returned with `Content-Type: text/event-stream`, `Cache-Control: no-store`, and allowed-origin CORS.
- A non-stream JSON upstream response becomes one SSE event plus `[DONE]`.
- Upstream 401/403 → 502 `upstream-auth`; 429 → 429 `ai-rate-limited`; 500/network → 502 `upstream-unavailable`.
- The 9th request in one minute from the same IP returns 429 `rate-limited`, while another IP still succeeds.
- D1 stores only a 64-char hex hash, never `203.0.113.8`.
- Request body over 128 KiB → 413 `payload-too-large`.

Use `vi.stubGlobal('fetch', vi.fn(...))`; restore with `vi.unstubAllGlobals()` in `afterEach`.

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- tests/chat-functions.test.ts`

Expected: FAIL because `functions/api/chat.js` does not exist.

- [ ] **Step 3: Implement the proxy**

Create `functions/api/chat.js` with these exact behaviors:

```js
import { isAllowedOrigin, sha256Hex } from './comments.js';

export const CHAT_LIMITS = Object.freeze({
  messagesMax: 20,
  contentMax: 8000,
  bodyBytesMax: 128 * 1024,
  minuteMs: 60_000,
  minuteMax: 10,
  dayMs: 86_400_000,
  dayMax: 800,
  outputTokensMax: 800,
});

export const CHAT_SYSTEM_PROMPT = `你是 yukki rui 个人网站里的 AI 助手。默认使用与用户相同的语言，回答简洁、友善、准确；不确定时明确说明，不要编造。不要声称自己是站长本人。`;
```

Required implementation details:

- `chatCorsHeaders` allows only methods `POST, OPTIONS`, headers `Content-Type, Accept`, and echoes only `isAllowedOrigin` origins.
- `jsonResponse` sets `Cache-Control: no-store`.
- Read `request.text()`, reject byte length > `bodyBytesMax` before `JSON.parse`.
- Validate before checking rate limit; check key/DB/salt and rate limit before calling upstream.
- `reserveRateLimit` creates `ai_chat_limits (ip_hash, window_kind, window_start, count, PRIMARY KEY(ip_hash, window_kind))` idempotently and uses UPSERT for `minute` and `day`; return the exceeded window kind.
- Use `CF-Connecting-IP`, then first `x-forwarded-for`, fallback `0.0.0.0`; hash with `${ip}:${COMMENTS_SALT}`.
- Normalize `AI_API_BASE` by trimming trailing `/`; default to `https://token.astrumflow.com/v1`.
- Pin `model` from `AI_MODEL` or `gemma-4-26b-a4b-it`, `stream: true`, `temperature: 0.7`, `max_tokens: 800`.
- Include exactly one fixed system message followed by the validated conversation.
- Forward the upstream `ReadableStream` when content type contains `text/event-stream`.
- For JSON upstream, extract `choices[0].message.content`, `choices[0].delta.content`, or `choices[0].text`; return:
  `data: {"choices":[{"delta":{"content":"..."}}]}\n\ndata: [DONE]\n\n`.
- Never include upstream response bodies, stack traces, key values, or request headers in returned error messages.

- [ ] **Step 4: Run proxy tests and confirm GREEN**

Run: `npm test -- tests/chat-functions.test.ts`

Expected: PASS, including rate-limit and CORS assertions.

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: all existing tests plus new chat tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add functions/api/chat.js tests/chat-functions.test.ts
git commit -m "feat(chat): 添加服务端代理与限流"
```

---

### Task 3: 裁剪角色素材并接入全站聊天组件

**Files:**
- Create: `public/chat/yukki-chat.gif`
- Create: `public/chat/yukki-chat-static.png`
- Create: `src/components/AiChat.astro`
- Modify: `src/consts.ts`
- Modify: `src/layouts/BaseLayout.astro`

**Interfaces:**
- Consumes: `AI_CHAT`, `UI`, `withBase`, `chatEndpoint`, `chatApiUrl`, `normalizeChatMessages`, `createSseParser`, `extractChatDelta`, `chatErrorMessage`.
- Produces: one `#ai-chat` root per page, one `/api/chat` request per user send.

- [ ] **Step 1: Generate the cropped assets without changing foreground pixels**

Use Pillow to union the non-transparent bounding box across all 18 frames, add 2 px transparent padding, crop every frame with the same box, and preserve frame durations/disposal/loop. Save as `public/chat/yukki-chat.gif`. Save the first full RGBA frame with the same crop as `public/chat/yukki-chat-static.png`.

Verification command:

```powershell
python -c "from PIL import Image; a=Image.open('public/chat/yukki-chat.gif'); b=Image.open('public/chat/yukki-chat-static.png'); assert a.n_frames==18; assert a.size==b.size; print(a.size, a.n_frames, a.info.get('duration'))"
```

- [ ] **Step 2: Add site config and bilingual copy**

In `src/consts.ts` add:

```ts
export const AI_CHAT = {
  enabled: true,
  origin: 'https://yukki-rui.pages.dev',
  maxMessages: 20,
  maxInputLength: 2000,
  maxOutputTokens: 800,
} as const;
```

Add keys used by the component to both `UI.zh` and `UI.en`: `aiTitle`, `aiOnline`, `aiClear`, `aiClose`, `aiWelcome`, `aiPlaceholder`, `aiSend`, `aiStop`, `aiThinking`, `aiInputHint`, `aiNoReply`, `aiNotConfigured`, `aiAuthFailed`, `aiRateLimited`, `aiUnavailable`, `aiInvalid`, `aiFailed`.

- [ ] **Step 3: Build the component shell and styles**

Create `src/components/AiChat.astro` with `lang: Lang` prop and render only when `AI_CHAT.enabled`. The component must:

- Compute endpoint with `chatEndpoint(SITE.url, AI_CHAT.origin)`.
- Render a fixed launcher button with both GIF and static PNG; CSS hides the GIF under reduced motion.
- Render a hidden `section[role="dialog"]` with header, clear/close buttons, message log, typing indicator, textarea, counter, and one send/stop button.
- Use only existing CSS variables and pixel-card styling; no global selectors that can affect page content.
- Use `withBase('/chat/yukki-chat.gif')` and `withBase('/chat/yukki-chat-static.png')`.
- Desktop launcher about `90×150px`, panel `min(370px, calc(100vw - 24px)) × min(540px, calc(100dvh - 24px))`.
- At `max-width: 560px`, panel is anchored `right: 8px; bottom: 8px; width: calc(100vw - 16px); max-height: calc(100dvh - 16px)` and no element exceeds viewport width.

- [ ] **Step 4: Implement browser behavior**

In the component script:

- Initialize once with `data-ready="1"` and rebind on `astro:page-load`.
- Welcome message is local and never sent upstream.
- Launcher opens panel, sets `aria-expanded="true"`, hides launcher, focuses textarea; close restores focus.
- Enter sends, Shift+Enter inserts newline; ignore send while IME composition is active.
- Trim input; enforce `maxlength=2000`; disable send when empty.
- Keep a local `history: ChatMessage[]`; send `{ messages: normalizeChatMessages(history, AI_CHAT.maxMessages) }` to `chatApiUrl(...)`.
- Parse SSE with `createSseParser`; create one assistant bubble and append text with `textContent`.
- `AbortController` powers the stop button; stopping keeps received text and does not show an error.
- Clear aborts any request, resets history, and restores the welcome message.
- Error responses parse `{ error, message }` and map through `chatErrorMessage`; retain the user message and textarea content on failure.
- `aria-live="polite"`, `role="log"`, and `aria-busy` reflect generation state.
- Escape closes the panel.

- [ ] **Step 5: Mount globally without touching page layout**

In `src/layouts/BaseLayout.astro` import `AiChat` and render `<AiChat lang={lang} />` immediately before `</body>`, after `Footer`.

- [ ] **Step 6: Type-check and build**

Run:

```powershell
npm run check
npm run build
```

Expected: both commands exit 0 with no Astro errors.

- [ ] **Step 7: Commit**

```powershell
git add src/components/AiChat.astro src/consts.ts src/layouts/BaseLayout.astro public/chat/yukki-chat.gif public/chat/yukki-chat-static.png
git commit -m "feat(chat): 添加像素风 AI 聊天小窗"
```

---

### Task 4: 端到端验收、文档与部署

**Files:**
- Create: `scripts/check-chat.mjs`
- Modify: `package.json`
- Modify: `docs/usage-guide.md`

**Interfaces:**
- Consumes: built `dist/`, local Pages runtime, mocked upstream API.
- Produces: `npm run check:chat`, deployment/secret instructions, screenshots for review.

- [ ] **Step 1: Add the Playwright end-to-end script**

Create `scripts/check-chat.mjs` following the existing `scripts/check-comments.mjs` process pattern. It must:

- Launch `wrangler pages dev dist --port 8789 --d1=DB=chat_check --binding AI_API_KEY=test-key --binding COMMENTS_SALT=chat-salt`.
- Launch Edge through `CMS_OAUTH_CHROME`.
- Route `https://token.astrumflow.com/v1/chat/completions` with Playwright and return a delayed SSE stream containing `你`, `好`, `！`.
- Assert:
  - launcher exists and opens the panel.
  - initial welcome does not call the API.
  - Enter sends; Shift+Enter does not send.
  - streamed text becomes `你好！`.
  - stop keeps partial content and shows no error.
  - 503 and 429 JSON errors show localized text.
  - clear restores welcome and empty history.
  - 390px viewport has `document.documentElement.scrollWidth <= innerWidth`.
  - no page errors and no key/upstream URL in page HTML or network request from the browser except same-origin `/api/chat` or the Playwright-intercepted upstream call made by the worker.
- Capture desktop light, desktop dark, and 390px screenshots into `.tmp-chat-screens/`.

Add to `package.json`:

```json
"check:chat": "node scripts/check-chat.mjs"
```

- [ ] **Step 2: Verify the end-to-end script**

Run:

```powershell
npm run build
$env:CMS_OAUTH_CHROME='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run check:chat
```

Expected: all checks pass; screenshots are generated.

- [ ] **Step 3: Update the usage guide**

In `docs/usage-guide.md`, add a section covering:

```powershell
npx wrangler pages secret put AI_API_KEY --project-name yukki-rui
```

Document `AI_API_BASE`, `AI_MODEL`, the fact that the key is never put in source, how to disable the widget with `AI_CHAT.enabled = false`, and how to run `npm run check:chat`.

- [ ] **Step 4: Run the full regression suite**

Run:

```powershell
npm run check
npm test
npm run build
npm run check:pages
```

Expected: all pass; existing 237 tests continue passing and the new tests are included.

- [ ] **Step 5: Review screenshots before deploy**

Open the three generated screenshots with the local image viewer and confirm: launcher does not cover navigation, panel matches the pixel-card language, mobile has no horizontal overflow, and dark mode remains readable.

- [ ] **Step 6: Commit and deploy after screenshot approval**

```powershell
git add scripts/check-chat.mjs package.json docs/usage-guide.md
git commit -m "test(chat): 添加聊天端到端验收与配置说明"
git push origin master
```

Then configure the real `AI_API_KEY` in Cloudflare Pages Secret and verify both production URLs.

---

## Self-Review

- Spec coverage: proxy/encryption, CORS, D1 rate limits, SSE, UI, reduced motion, mirrored deployment, tests, docs, and rollback all have tasks.
- Placeholder scan: no TBD/TODO; every implementation step names concrete files, signatures, commands, expected results, and commit commands.
- Type consistency: `ChatMessage`, `validateChatPayload`, `reserveRateLimit`, `chatCorsHeaders`, and component imports use the same names across tasks.
