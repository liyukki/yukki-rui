# 移动端导航与文章分享设计

- 日期：2026-10-30
- 状态：站长已确认推荐方案，待书面规格审阅
- 相关：`src/components/Header.astro`、`src/components/PostLikes.astro`、`src/components/PostShare.astro`、`src/lib/share.ts`、`src/layouts/PostLayout.astro`、`src/consts.ts`、`src/styles/global.css`、`src/styles/world.css`

## 1. 背景与目标

当前站点在移动端会把 9 个导航入口和语言、主题按钮放在同一行区域，宽度较窄时产生多行占用。文章页已有点赞卡片，但没有分享入口。

本次升级解决两个具体问题：

1. 移动端导航默认收起，保留全部入口，但不再持续占用多行高度。
2. 在文章点赞区域加入分享按钮，移动端优先使用系统分享，不支持时复制文章链接。

成功标准：

- 390px 宽度下默认只显示一行头部操作区，导航收起后无横向溢出。
- 打开菜单后能访问全部 9 个导航入口，关闭后页面恢复紧凑状态。
- 菜单支持键盘操作，`Escape` 可关闭，`aria-expanded` 状态准确。
- 分享按钮与点赞按钮位于同一张卡片内，桌面端和移动端都保持清晰的按钮层级。
- 支持 Web Share API 的移动浏览器能打开系统分享面板；其他浏览器可复制文章 canonical 链接。
- 分享取消不显示错误；分享失败可降级到复制；复制失败有可见且可被辅助技术读取的反馈。
- 不新增第三方依赖、不接入社交平台 SDK、不引入新的后端接口。

## 2. 非目标

- 不重新设计整站视觉，不改变像素/杂志风、暗色模式或现有颜色令牌。
- 不删除任何导航入口，不新增独立导航页。
- 不改动 AI 聊天、评论、点赞接口、搜索、RSS 或部署方式。
- 不增加分享统计、登录、分享次数或社交平台回传。
- 不做全屏移动菜单，不锁定页面滚动。
- 不为分享功能引入本地持久化数据。

## 3. 方案选择

### 3.1 移动导航

采用“收起式像素菜单”：

- 头部首行保留站名、语言切换、主题切换和菜单按钮。
- 导航链接默认隐藏，点击菜单按钮后在头部下方展开为两列布局。
- 再次点击菜单按钮、点击头部外部、按 `Escape` 或切换页面时关闭。
- 桌面端继续显示横向导航，不显示移动端菜单按钮。

未采用：

- 单行横向滑动：入口不够一眼可见，滑动发现性较弱。
- 独立导航页：会增加一次跳转，不符合当前轻量站点规模。

### 3.2 文章分享

采用“原生分享优先、复制链接兜底”：

- 浏览器支持 `navigator.share()` 时，点击按钮调用系统分享面板。
- 不支持原生分享、或原生分享非取消失败时，复制文章 canonical URL。
- 用户取消系统分享时保持静默，不弹出错误。
- 复制成功或失败时，按钮短暂显示对应状态文本。

未采用：

- 始终复制链接：移动端体验差，也不利用系统分享。
- 固定社交平台按钮：需要额外图标、平台维护和隐私说明，当前收益不足。

## 4. 移动端导航设计

### 4.1 结构与布局

`Header.astro` 调整为三块：

1. `.site-name`：现有站名和像素图标。
2. `.header-tools`：`LangSwitch`、`ThemeToggle` 和移动端菜单按钮。
3. `.site-nav`：现有 9 个导航链接。

桌面端保持站名、横向导航、工具按钮的顺序。移动端使用两列网格：

- 第一行：站名在左，工具按钮在右。
- 菜单关闭时，导航不占据布局高度。
- 菜单打开时，导航以两列网格出现在第一行下方，链接保持现有 `withBase()` 路径和文案。

移动端断点使用 `760px`。断点以下显示菜单按钮并默认收起导航；`761px` 起恢复桌面横向导航。

### 4.2 交互与状态

菜单按钮使用真实 `<button type="button">`，包含：

- `aria-controls` 指向导航容器的稳定 id。
- `aria-expanded` 反映当前展开状态，初始为 `false`。
- 中文文案为“菜单”，英文文案为“Menu”；展开时通过状态样式和图标变化表达，不依赖颜色单独传达。

导航容器的行为：

- 关闭时使用 `display: none` 从可访问树中移除，避免隐藏链接仍被键盘聚焦。
- 打开时显示为两列网格，链接按现有顺序排列。
- 点击任意导航链接后关闭菜单；页面跳转时新页面默认回到关闭状态。
- 点击头部以外区域关闭。
- 按 `Escape` 关闭，并把焦点还给菜单按钮。
- 视口跨过断点时关闭菜单，避免桌面和移动状态互相污染。

实现使用原生 JavaScript，不增加依赖。初始化绑定到 `astro:page-load`，并用 `AbortController` 清理旧监听器，兼容现有 ClientRouter 页面切换。

### 4.3 无 JavaScript 回退

移动端若脚本未执行，不能让导航永久不可用。`Header.astro` 内提供 `noscript` 样式：

- 显示移动端导航为普通两列布局。
- 隐藏无功能的菜单按钮。

这样在无 JavaScript 环境下仍能访问全部页面入口。

### 4.4 视觉要求

- 菜单按钮沿用现有 `.icon-btn` 的硬边框、像素字和阴影语言。
- 展开面板使用 `var(--bg-soft)`、`var(--line)`、`var(--shadow)` 和 `var(--radius)`。
- 链接保持至少 44px 的触控高度，两列之间留有明确间距。
- 展开/收起使用短促的位移或透明度过渡；`prefers-reduced-motion: reduce` 下禁用过渡。
- 不改变现有深浅主题变量，不写死颜色。

## 5. 文章分享设计

### 5.1 组件边界

新增 `PostShare.astro`，职责仅为：

- 读取组件上的分享 URL、文章标题、描述和本地化文案。
- 检测浏览器能力并调用分享或复制逻辑。
- 更新按钮状态和辅助技术状态文本。

新增 `src/lib/share.ts`，提供不依赖 DOM 的 `shareOrCopy` 纯函数，负责：

1. 优先调用传入的 `share`。
2. 识别 `AbortError` 并返回 `cancelled`。
3. 原生分享其他错误时降级到 `writeText`。
4. 没有原生分享或降级时返回 `copied` / `failed`。

`PostShare.astro` 只负责把 `navigator.share` 和 `navigator.clipboard.writeText` 绑定后传入该函数，避免把兼容性分支散落在模板中。

### 5.2 与点赞区域的组合

`PostLikes.astro` 的卡片内增加一个 `.post-likes__actions` 容器：

- 左侧是现有点赞按钮。
- 右侧通过 Astro `<slot />` 放入 `PostShare`。
- 两个按钮在桌面端并排，移动端在卡片内保持两列按钮布局；错误/状态文本放在按钮下方。

`PostLayout.astro` 在 `<PostLikes>` 内部渲染：

```astro
<PostLikes ...>
  <PostShare
    lang={lang}
    title={post.data.title}
    text={post.data.description}
    url={canonical}
  />
</PostLikes>
```

分享 URL 使用 `PostLayout` 已计算好的 canonical 绝对地址，不在客户端自行拼接路径。这样 Cloudflare Pages、GitHub Pages 子路径部署和未来自定义域名都沿用统一来源。

### 5.3 按钮行为

初始文案：

- `navigator.share` 可用：中文“分享文章”，英文“Share post”。
- 不可用：中文“复制链接”，英文“Copy link”。

点击后：

1. 构造 `{ title, text, url }` 分享数据。
2. 若原生分享成功，不改变页面文案，系统分享面板负责反馈。
3. 若用户取消（`AbortError`），不显示错误。
4. 若原生分享失败，尝试写入剪贴板。
5. 复制成功后按钮显示“已复制”，约 2 秒后恢复。
6. 复制失败后按钮显示“复制失败”，约 2 秒后恢复。

所有动态文本通过 `textContent` 写入，不使用 `innerHTML`。按钮同时更新 `aria-label`，页面内提供 `role="status"`、`aria-live="polite"` 的状态节点。

### 5.4 数据与兼容性

- `PostShare` 从 `data-*` 读取 URL、标题、描述和 i18n 文案，保证 SSR 与 ClientRouter 切换后行为一致。
- 使用 `astro:page-load` 重新初始化，使用 `data-ready` 防止重复绑定。
- 不发送网络请求，不读取文章正文，不持久化分享内容。
- 剪贴板不可用时不抛异常到控制台，直接进入失败反馈。
- 页面运行在 HTTPS 或 localhost 安全上下文时使用 Clipboard API；其他环境按能力检测自然降级。

## 6. 文案

在 `src/consts.ts` 的中英文 `UI` 中新增成对文案：

- `menu`：菜单 / Menu
- `sharePost`：分享文章 / Share post
- `copyLink`：复制链接 / Copy link
- `linkCopied`：已复制 / Copied
- `shareFailed`：复制失败 / Copy failed

现有导航、语言切换、主题切换和点赞文案保持不变。

## 7. 可访问性与响应式

- 菜单按钮有稳定可读名称，`aria-expanded` 与视觉状态同步。
- 关闭的导航使用 `display: none`，不让键盘焦点进入不可见链接。
- `Escape` 关闭菜单并恢复焦点到菜单按钮。
- 菜单项和分享按钮的触控目标不小于 44px。
- 分享状态通过可见文本和 `aria-live` 同时反馈。
- 分享按钮不使用仅靠颜色区分的状态；失败和成功都有文字。
- 390px、760px、761px 和桌面宽度各做一次布局检查。
- 深浅主题、键盘导航和 `prefers-reduced-motion` 都必须可用。
- 页面不得产生横向滚动条。

## 8. 错误处理与降级

- 菜单脚本初始化失败：`noscript` 回退仍显示导航；桌面端导航不依赖脚本。
- 菜单外部点击监听未触发：再次点击菜单按钮或 `Escape` 仍可关闭。
- Web Share 被取消：静默结束，不误报失败。
- Web Share 因权限或浏览器限制失败：继续尝试复制。
- Clipboard API 不可用或拒绝：显示“复制失败”，不阻塞页面其他功能。
- 分享 URL 为空：直接返回失败，不打开空分享面板。
- 组件被 ClientRouter 替换：旧监听器通过 `AbortController` 清理，新 DOM 重新绑定。

## 9. 文件边界

- `src/components/Header.astro`：头部结构、菜单状态、客户端交互和无脚本回退。
- `src/styles/global.css`：桌面/移动头部布局和菜单样式。
- `src/styles/world.css`：仅在现有移动端头部规则与新断点冲突时做最小调整。
- `src/components/PostLikes.astro`：点赞卡片动作容器和 slot 接入。
- `src/components/PostShare.astro`：分享按钮、能力检测和状态更新。
- `src/lib/share.ts`：`shareOrCopy` 纯函数与结果类型。
- `src/layouts/PostLayout.astro`：传入 canonical URL、文章标题和描述。
- `src/consts.ts`：中英文 UI 文案。
- `tests/post-share.test.ts`：`shareOrCopy` 分支测试。
- `tests/post-share-ui.test.ts`：分享组件结构、文案和安全写入测试。
- `tests/post-likes-ui.test.ts`：确认点赞区域仍位于 `PostNav` 和 `Comments` 之间，并接受分享 slot。

本次不修改 `scripts/check-frontend.mjs`；菜单和分享结构由单元测试覆盖，构建产物由现有前端门禁统一验证。

## 10. 测试与验收

自动化：

- `npm run check`
- `npm test`
- `npm run build`
- `npm run verify:frontend`
- 新增 `shareOrCopy` 单测：原生分享成功、取消、非取消失败后复制、复制成功、复制失败、空 URL。
- 新增组件静态测试：`data-post-share`、`aria-live`、`textContent`、i18n 成对存在、无 `innerHTML`。
- 更新点赞 UI 测试：分享 slot 仍处于点赞卡片内，组件顺序不回退。

浏览器验收：

- 390px：头部默认单行，菜单打开后两列无溢出，关闭后高度恢复。
- 760px/761px：断点两侧布局切换正确，不出现重复导航。
- 桌面端：原有横向导航、语言和主题按钮位置正常。
- 键盘：Tab 可到达菜单和分享按钮；`Escape` 关闭菜单；状态文本可读。
- 移动端支持 Web Share 时：点击分享打开系统面板；取消后无错误提示。
- 桌面端或不支持 Web Share 时：点击后复制链接并显示“已复制”。
- 模拟剪贴板拒绝：显示“复制失败”，按钮恢复可再次点击。
- 深浅主题和 reduced-motion 下无视觉异常。

## 11. 风险与回退

风险：

- 移动端断点内的头部高度变化可能影响首屏位置，但菜单默认关闭时不会持续占用高度。
- Web Share 在不同浏览器实现不一致，复制兜底是主要兼容路径。
- 剪贴板在非安全上下文或权限被拒绝时不可用，必须保留可见失败状态。
- ClientRouter 页面切换若不重新绑定，菜单或分享按钮会失效；使用 `astro:page-load` 和幂等标记规避。

回退：

- 若菜单交互出现问题，可将移动端导航恢复为直接两列展示，不影响桌面端。
- 若分享组件异常，可移除 `PostShare` slot，点赞和评论路径保持独立。

## 12. 验收清单

- [ ] 移动端头部默认收起，9 个导航入口均可访问。
- [ ] 菜单按钮、外部点击、`Escape`、断点切换和页面切换状态正确。
- [ ] 无 JavaScript 时移动端仍能看到导航入口。
- [ ] 分享按钮与点赞按钮位于同一张卡片内。
- [ ] 原生分享成功、取消、失败降级、复制成功和复制失败均有正确结果。
- [ ] 动态文本全部使用 `textContent`，无 `innerHTML` 注入。
- [ ] 390px、760px、761px、桌面、深浅主题和 reduced-motion 检查通过。
- [ ] `npm run check`、`npm test`、`npm run build`、`npm run verify:frontend` 通过。
