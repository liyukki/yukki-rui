# AI 聊天小窗设计（代理与加密版）

- 日期：2026-10-22
- 状态：站长已确认采用服务端代理与加密密钥方案，待实现
- 相关：`src/layouts/BaseLayout.astro`、`src/components/AiChat.astro`、`src/lib/chat.ts`、`functions/api/chat.js`、`src/consts.ts`

## 1. 背景与目标

站点是 Astro 静态站，同时部署到 Cloudflare Pages 与 GitHub Pages。站长希望在页面右下角加入一个可点击的角色素材，点击后展开 AI 聊天小窗。

已确认：

- 第三方中转站：`https://token.astrumflow.com/v1`
- 接口兼容 OpenAI Chat Completions
- 模型：`gemma-4-26b-a4b-it`
- 采用代理方案，API Key 不进入浏览器或 Git
- 保留现有前端视觉设计，不因接入方式改变聊天窗外观与交互

目标：

1. 全站右下角显示提供的透明 GIF 角色，点击可展开或收起聊天窗。
2. 聊天窗保持站点现有的像素卡片、硬边框、暖色/冷色主题变量与深浅色适配。
3. 支持流式回复、Enter 发送、Shift+Enter 换行、停止生成、清空对话。
4. 兼容桌面端与 390px 手机端，不产生横向溢出。
5. 回复按纯文本展示，不把模型输出作为 HTML 注入页面。

## 2. 非目标

- 本期不做用户登录、多会话管理或跨设备历史记录。
- 本期不做 Markdown 富文本、图片上传、语音、工具调用。
- 本期不把 API Key、上游地址或模型授权信息发送到浏览器。
- 不改变站点已有的页头、页脚、内容布局和配色系统。

## 3. 架构与加密

```text
页面右下角 AiChat 组件
  │ POST /api/chat（只发送对话消息）
  ▼
Cloudflare Pages Function: functions/api/chat.js
  ├─ 校验 Origin、消息格式与频率
  ├─ 从 Cloudflare Secret 读取 AI_API_KEY
  └─ 转发到 https://token.astrumflow.com/v1/chat/completions
       │ Authorization: Bearer <服务端密钥>
       ▼
OpenAI 兼容流式响应（SSE）
  │ 原样转发 data: 事件
  ▼
聊天消息列表（textContent 渲染）
```

加密与密钥保护：

- `AI_API_KEY` 只配置为 Cloudflare Pages Secret，由平台加密存储，构建产物与浏览器均不包含密钥。
- 浏览器只调用站内 `/api/chat`，不接触上游地址、模型密钥或 Authorization 头。
- Cloudflare 到中转站使用 HTTPS；代理响应设置 `Cache-Control: no-store`。
- GitHub Pages 没有 Functions，前端跨域调用主站 `https://yukki-rui.pages.dev/api/chat`，代理通过 CORS 白名单允许镜像站。
- 前端不包含可逆加密的密钥材料，避免产生“看似加密、实际仍可提取”的假安全。

## 4. 配置

Cloudflare Pages 环境变量：

```text
AI_API_KEY       必填，Secret，第三方中转站密钥
AI_API_BASE      可选，默认 https://token.astrumflow.com/v1
AI_MODEL         可选，默认 gemma-4-26b-a4b-it
```

允许暴露给前端的站点配置：

```ts
export const AI_CHAT = {
  enabled: true,
  origin: 'https://yukki-rui.pages.dev',
  maxMessages: 20,
  maxInputLength: 2000,
  maxOutputTokens: 800,
} as const;
```

密钥缺失时代理返回 503，前端显示「AI 服务尚未配置」，不产生上游请求。

## 5. 交互与视觉

- 启动器：固定右下角，使用裁剪掉透明留白的原始 GIF；桌面约 90×150px，移动端约 76×128px。
- 提供 `aria-label`、键盘聚焦和 `prefers-reduced-motion` 静态图降级。
- 打开后隐藏启动器，显示约 370×540px 的像素卡片；移动端为贴近底部的全宽面板。
- 头部：小头像、标题「YUKKI AI」、在线状态、清空按钮、关闭按钮。
- 消息区：用户消息靠右，AI 消息靠左；自动滚动到底部；加载时显示打字动画。
- 输入区：多行文本框、字符计数、发送按钮；生成中发送按钮切换为停止按钮。
- 首次打开显示一条本地欢迎语，不发送请求。
- 请求失败时保留用户输入与已有对话，并显示可重试错误。
- 页面转场后重新绑定事件；聊天记录只保存在当前页面内存中。
- 视觉样式不变：继续使用 `--card`、`--line`、`--text`、`--text-dim`、`--accent`、`--accent-2`、`--shadow` 等现有设计令牌。

## 6. API 契约

**POST `/api/chat`**

请求体：

```json
{
  "messages": [
    { "role": "user", "content": "你好" }
  ]
}
```

- `messages` 必须为非空数组，最多 20 条。
- 只接受 `user` 和 `assistant` 角色。
- 单条内容最多 8000 字符；最后一条必须是 `user`。
- 服务端注入固定 system prompt，并将 `model`、`temperature`、`max_tokens`、`stream` 固定为服务端配置。
- 成功时透传 `text/event-stream`，事件格式保持 OpenAI `data: ...`。
- 非流式上游响应也会被规范化成单个 SSE `data:` 事件，便于前端统一解析。
- 401/403、429、5xx 和网络错误返回 JSON：
  `{ "error": "code", "message": "可直接展示的中文提示" }`。

**OPTIONS `/api/chat`** → 204，CORS 白名单与评论接口一致，并额外允许当前请求同源。

## 7. 限流与防滥用

- 使用已有 D1 `DB` 绑定，新建幂等表 `ai_chat_limits (ip_hash TEXT PRIMARY KEY, window_start INTEGER, count INTEGER)`。
- IP 仅保存 `sha256(IP + COMMENTS_SALT)`，不存明文。
- 限制：同一 IP 每分钟最多 8 次，每天最多 80 次；超限返回 429。
- 请求体大小、消息数量、单条长度均在代理层校验。
- 模型、上游地址、最大输出 Token 由服务端控制，前端不能覆盖。
- 限流与密钥校验失败时不请求上游。

## 8. 文件边界

- `src/components/AiChat.astro`：DOM、样式与浏览器交互。
- `src/lib/chat.ts`：消息裁剪、SSE 解析、错误映射等可测试纯函数。
- `functions/api/chat.js`：代理、CORS、校验、限流与流式转发。
- `src/consts.ts`：前端开关、主站 origin 和界面文案。
- `src/layouts/BaseLayout.astro`：全站挂载聊天组件。
- `public/chat/yukki-chat.gif`：裁剪透明留白后的原始动画。
- `public/chat/yukki-chat-static.png`：减少动态效果时使用的静态帧。
- `scripts/check-chat.mjs`：Playwright 端到端验证。
- `tests/chat.test.ts`：前端纯函数单元测试。
- `tests/chat-functions.test.ts`：代理接口单元测试。
- `docs/usage-guide.md`：钥匙配置与本地联调说明。

## 9. 错误处理

- 未配置 Key：503，前端提示站长尚未完成配置。
- 401/403：提示服务授权失败，不暴露上游响应原文。
- 429：提示请求过于频繁。
- 5xx/网络错误：提示服务暂时不可用，并保留已输入内容。
- 空响应：显示「没有收到回复，请重试」。
- 主动停止：不视为错误。
- 上游返回非 JSON 或非 SSE：服务端返回 502，避免把 HTML 错误页透传给聊天窗。

## 10. 测试与验收

- `npm run check`、`npm test`、`npm run build` 全部通过。
- 单元测试覆盖 SSE 分片解析、普通 JSON 回退、历史裁剪、空白消息过滤、代理请求校验、CORS、限流与密钥缺失。
- Playwright 拦截 `/api/chat`：
  - 点击 GIF 打开聊天窗，关闭按钮可收起。
  - Enter 发送、Shift+Enter 不发送。
  - 流式文本逐段出现并完整拼接。
  - 停止生成后保留已有内容。
  - 503/429 有明确提示。
  - 390px 下无横向溢出，面板不遮挡关键控件。
- 本地联调：`wrangler pages dev dist --binding AI_API_KEY=test-key --d1=DB=...`，用模拟上游验证代理和流式转发。
- 线上验收：两个部署地址都能打开小窗；配置 Cloudflare Secret 后实际收到模型回复。

## 11. 部署与回滚

部署步骤：

1. Cloudflare Pages → Settings → Variables and secrets → 添加 `AI_API_KEY`（Secret）。
2. 可选添加 `AI_API_BASE`、`AI_MODEL`；不配置时使用默认值。
3. 重新部署并在两个站点验证。

回滚：

- 将 `AI_CHAT.enabled` 改为 `false` 后重新部署即可完全移除聊天入口。
- 删除 Cloudflare 环境变量即可立即撤销上游访问权限；不影响聊天窗以下的其他站点功能。
