# AI 聊天小窗设计（前端直连版）

- 日期：2026-10-22
- 状态：站长已确认采用前端直连方案，待实现
- 相关：`src/layouts/BaseLayout.astro`、`src/components/AiChat.astro`、`src/lib/chat.ts`、`src/consts.ts`

## 1. 背景与目标

站点是 Astro 静态站，同时部署到 Cloudflare Pages 与 GitHub Pages。站长希望在页面右下角加入一个可点击的角色素材，点击后展开 AI 聊天小窗。

站长已确认：

- 第三方中转站：`https://token.astrumflow.com/v1`
- 接口兼容 OpenAI Chat Completions
- 模型：`gemma-4-26b-a4b-it`
- 首版允许把 API Key 放在前端，后续再做混淆/加密

目标：

1. 全站右下角显示提供的透明 GIF 角色，点击可展开或收起聊天窗。
2. 聊天窗保持站点现有的像素卡片、硬边框、暖色/冷色主题变量与深浅色适配。
3. 支持流式回复、Enter 发送、Shift+Enter 换行、停止生成、清空对话。
4. 兼容桌面端与 390px 手机端，不产生横向溢出。
5. 回复按纯文本展示，不把模型输出作为 HTML 注入页面。

## 2. 非目标

- 本期不做服务端代理、登录、多会话管理或数据库持久化。
- 本期不做 Markdown 富文本、图片上传、语音、工具调用。
- 本期不保证前端密钥保密；后续如切换代理，组件调用层保持可替换。
- 不在聊天窗内展示 API Key 或第三方服务信息。

## 3. 架构

```text
页面右下角 AiChat 组件
  │ 点击展开
  ▼
浏览器 fetch → https://token.astrumflow.com/v1/chat/completions
  │ Authorization: Bearer <前端配置的 Key>
  ▼
OpenAI 兼容流式响应（SSE）
  │ 解析 choices[0].delta.content
  ▼
聊天消息列表（textContent 渲染）
```

第三方中转站已确认预检响应允许 `*` 来源与 `authorization, content-type` 请求头，因此 Cloudflare Pages 和 GitHub Pages 都可直连。

## 4. 配置

在 `src/consts.ts` 增加：

```ts
export const AI_CHAT = {
  enabled: true,
  endpoint: 'https://token.astrumflow.com/v1/chat/completions',
  model: 'gemma-4-26b-a4b-it',
  apiKey: '', // 站长提供后填入；后续可替换为解码函数
  maxMessages: 20,
  maxInputLength: 2000,
  maxOutputTokens: 800,
} as const;
```

密钥为空时聊天窗仍可正常打开，但发送按钮会显示「AI 服务尚未配置」，避免产生无意义请求。

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

## 6. 请求与流式解析

请求体：

```json
{
  "model": "gemma-4-26b-a4b-it",
  "messages": [
    { "role": "system", "content": "站点助手 system prompt" },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "max_tokens": 800,
  "stream": true
}
```

- 系统提示：友好、简洁，默认使用用户当前语言，不冒充站长本人。
- 历史最多保留最近 20 条消息，避免上下文无限增长。
- 优先解析 `text/event-stream` 的 `data:` 行；如果服务返回普通 JSON，则读取 `choices[0].message.content`。
- 使用 `AbortController` 支持停止生成；停止后保留已生成文本。
- 对返回内容只使用 `textContent`，不解析 HTML。

## 7. 文件边界

- `src/components/AiChat.astro`：DOM、样式与浏览器交互。
- `src/lib/chat.ts`：消息裁剪、SSE 解析、错误文案等可测试纯函数。
- `src/consts.ts`：接口、模型、Key 和界面文案。
- `src/layouts/BaseLayout.astro`：全站挂载聊天组件。
- `public/chat/yukki-chat.gif`：裁剪透明留白后的原始动画。
- `public/chat/yukki-chat-static.png`：减少动态效果时使用的静态帧。
- `scripts/check-chat.mjs`：Playwright 端到端验证。
- `tests/chat.test.ts`：Vitest 单元测试。

## 8. 错误处理

- 未配置 Key：不请求，提示站长尚未完成配置。
- 401/403：提示密钥无效或没有模型权限。
- 429：提示请求过于频繁。
- 5xx/网络错误：提示服务暂时不可用，并保留已输入内容。
- 空响应：显示「没有收到回复，请重试」。
- 主动停止：不视为错误。

## 9. 测试与验收

- `npm run check`、`npm test`、`npm run build` 全部通过。
- 单元测试覆盖 SSE 分片解析、普通 JSON 回退、历史裁剪与空白消息过滤。
- Playwright 拦截 API：
  - 点击 GIF 打开聊天窗，关闭按钮可收起。
  - Enter 发送、Shift+Enter 不发送。
  - 流式文本逐段出现并完整拼接。
  - 停止生成后保留已有内容。
  - API 错误有明确提示。
  - 390px 下无横向溢出，面板不遮挡关键控件。
- 线上验收：两个部署地址均能打开小窗；填入 Key 后实际收到模型回复。

## 10. 回滚

将 `AI_CHAT.enabled` 改为 `false` 后重新部署即可完全移除聊天入口；不涉及数据库或后端资源。
