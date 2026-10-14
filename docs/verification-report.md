# 数据层修复与交接审核报告

日期：2026-10-10（Asia/Hong_Kong）。分支：`codex/fix-handoff`。基线：`7363b29`。本轮未提交、推送或发布网站。

## 修复范围

1. 生产译文查找过滤草稿，开发仍支持预览。
2. 提供使用 Astro 7 `render(post)` 的实际文章路由骨架，并同步交接示例。
3. 实现双语 RSS，文章地址使用包含 base 的 postHref。
4. SITE_URL/SITE_BASE 归一化后注入 SITE.url，RSS、robots、sitemap 和页面 canonical 共用地址。
5. 链接检查覆盖真实 HTML、同站元信息、RSS、sitemap、robots；拒绝遗漏部署前缀的路径。
6. 双路径检查在临时输出目录构建全站；内容集成检查使用临时源码副本，不写原始文章目录或 dist。
7. 同步 README、设计、实施计划与 Kimi 交接：版本、真实 ID、SEO 对应关系、主题脚本预算与阶段验收。
8. CI 支持 main/master 和 PR 验证；PR 不部署，发布前检查前端必需产物。

## 实际验证记录（修复阶段快照，2026-10-10）

> 本表数字（26 文件 / 7 页 / 63 条）是数据层修复阶段的历史记录；展示层完成后的最新数字见下文「展示层验收」。

| 命令 | 实际结果 | 判断 |
|---|---|---|
| 修复前新增回归用例后 `npm test` | 12 条失败，确认草稿译文、漏写前缀、相对/中文路径和地址配置的原始缺陷 | 失败正确 |
| 修复前 CLI 真实产物回归 | 4 条失败，原检查器漏掉非探针页面、RSS、sitemap 和相对坏链接 | 失败正确 |
| `npm run verify` | 类型检查 26 文件，0 errors / 0 warnings / 0 hints；6 测试文件、48 条单测通过；双路径与内容集成通过 | 通过 |
| `npm run check:content`（改为隔离副本后） | 根路径与 /yukki-rui/ 的 Markdown、草稿页面、草稿译文与 RSS 全部通过 | 通过 |
| `node scripts/check-base-parity.mjs --self-test` | 每种 base 7 个真实页面、63 条站内引用通过；临时真实首页注入坏前缀后被拒绝 | 通过 |
| `npm run build` + `npm run check:links` | 当前骨架 7 个页面构建成功，63 条站内引用通过 | 通过 |
| YAML 解析与结构检查 | workflow 正确解析，main/master、PR 触发存在，PR 排除部署，前端门槛存在 | 通过；未执行线上 Actions |
| `git diff --check` | 无输出，退出码 0 | 通过 |
| `npm run check:frontend` | 退出码 1，明确缺少双语关于/标签页、404 和默认 OG 图 | 符合当前阶段 |

`check:content` 真实断言包括：Markdown 段落输出 strong 标记；生产中英草稿不产出页面；已发布中文文章不指向英文草稿；无已发布译文不声明英文 hreflang；RSS 包含正确公共文章路径且不含草稿。

两个 base 检查的实际输出：

```text
✓ base = /：7 个真实页面，63 条站内引用通过
✓ base = /yukki-rui/：7 个真实页面，63 条站内引用通过
✓ 两种部署路径的实际页面和订阅产物一致
✓ 失败路径自检：真实页面中的错误部署前缀被拒绝
```

## 独立审核

已完成依据 requesting-code-review 技能的只读独立审核，未发现 Critical、Important 或阻碍交接的 Minor 问题。

审核独立检查了相对路径、中文编码、查询/锚点、严格前缀与站点配置冲突；在独立临时产物中检查 HTML/SEO/RSS/sitemap/robots 的有效引用和四类注入错误。未运行共享工作区的 Astro 构建、未修改工作树。代码、CI、计划、交接说明与本报告一致，可交给 Kimi 继续展示层。

最终再运行 `npm run verify`，仍为 26 文件类型检查无错误/警告/提示，48 条单测与双路径/内容集成全部通过。

## 展示层验收（Kimi，2026-10-12）

GPT 中断前实际已完成全部展示层工作（组件、布局、页面、样式、OG 图齐全，此前误判缺失的关于页/标签归档页是 Windows Git Bash 通配符路径 `[lang]` 导致的盘点错误）。本轮完成剩余验收，未改动源码。

| 验收项 | 实际结果 |
|---|---|
| `npm run verify:frontend` | 类型检查 46 文件 0 errors/0 warnings/0 hints（P2 修复后）；48 单测通过；双路径各 17 页、682 条站内引用通过；内容集成通过；构建 17 页；check:links 无死链；check:frontend 结构门槛通过 |
| `node scripts/check-base-parity.mjs --self-test` | 两种 base 通过；失败路径自检拒绝坏前缀 |
| 375px 首页 | 导航/英雄区/双子像素角色/文章卡片/页脚渲染正常，无横向溢出（截图确认） |
| 桌面 1280px | 英雄区双列 544px+435px、grid-2 双列 532px×2，无横向溢出 |
| 主题切换 | light→dark 切换、aria-pressed 同步、localStorage 写入；刷新后 dark 保持 |
| 存储受限 | localStorage 抛异常时刷新页面正常渲染，主题回退系统偏好，不崩溃 |
| 真实译文互跳 | 中文文章页语言按钮 → `/en/posts/hello-worlden/`；head 仅 zh-CN+en 两条 hreflang，canonical 正确 |
| 无译文降级 | `writing-in-markdown` 语言按钮 → `/en/`；head 无英文 hreflang |
| 标签归档过滤 | `/zh/tags/指南/` 仅含《这个站点是怎么搭起来的》《用 Markdown 写作》2 篇 |
| 404 | `dist/404.html` 渲染，含双语首页链接，`noindex` |
| RSS | `/rss.xml` 中文 3 篇、`/rss-en.xml` 英文 1 篇，链接均含 base |
| 根入口 | 有 JS 时按浏览器语言跳转 `/zh/`；无 JS 时双语入口链接可用 |

真实鼠标交互补测（第三轮独立审核）：主题切换+切回、导航、文章卡片、语言切换、标签归档 6 项全部通过。此前的 locator 降级备注作废。桌面截图两次超时，桌面布局以计算样式几何数据验收。

## 第三轮审核修复（Kimi，2026-10-12）

按 `docs/kimi-fix-handoff.md` 修复 4 项：

| 项 | 修复 | 验证 |
|---|---|---|
| P1 语言偏好写入缺失 | `LangSwitch.astro` 加 `data-lang-target`，点击时写入 `localStorage.lang`，存储异常捕获 | 浏览器实测：点击后 `lang=en` 落盘；中文系统+已存 en 偏好访问根入口落地 `/en/`；存储受限时点击不报错 |
| P2 验证报告数字与 hints | 报告更新为 46 文件 / 17 页 / 682 条引用，历史表标注修复阶段快照；`gen-pixel-sprites.mjs` 改用直接 `import sharp`、删未读 `SCALE` | `npx astro check` → 0 errors / 0 warnings / 0 hints；脚本重跑 13 个精灵正常生成 |
| P3 仓库卫生 | `.gitignore` 忽略 `pixel-platformer.zip` 与 `.video_agent/`；脚本注释声明需 `npm i -D sharp` | `git check-ignore` 两项命中；未跟踪列表不再出现 |
| P4 文档阶段描述 | README 与 frontend-handoff 四处过时表述更新为「前端已完成，仅素材待补充」 | `git diff` 仅含这两个文档 |

## Kimi 尚需完成

个人简介与作品的真实素材（头像、邮箱、社交账号、第二件作品）；页面已按要求标注待补充，未编造。两平台实际上线部署与线上实测未做，按 README 部署后在公开地址重新检查。

## 上线收尾：后台登录链路（DSH，2026-10-14）

站点已在 GitHub Pages 上线（<https://liyukki.github.io/yukki-rui/>）。线上后台还需要服务端换令牌，GitHub Pages 跑不了函数，因此本轮把 `functions/api/` 的登录链路先做实、测穿，再交给站长接 Cloudflare。

### 发现并修复的真实缺陷

| 缺陷 | 后果 | 修复 |
|---|---|---|
| `callback.js` 把 postMessage 的 payload 写成对象字面量 | 字符串拼接得到 `authorization:github:success:[object Object]`，Decap 的 `JSON.parse` 抛 `SyntaxError`，**线上登录必然失败**（本地空跑看不出来，只有真浏览器握手才暴露） | payload 先 `JSON.stringify` 成字符串再内联；单元测试锁死 `var DATA = "{\"token\":..."` 形态 |
| `postMessage` 的 targetOrigin 是 `'*'` | 任意第三方页面 `window.open` 授权入口即可骗走令牌 | targetOrigin 收紧为本站 origin；跨域后台会收到页面提示「请从本站 /admin/ 打开」 |
| 授权被拒（`error=access_denied`）无处理 | 后台登录按钮一直转圈 | 回传 `authorization:github:error:<json>`，后台显示原因 |
| 错误文本直接插入页面 | GitHub 回传的文本可构成脚本注入 | HTML 实体转义 + JS 字面量 `\u003c` 转义，整页只允许一个 `</script>` |
| 令牌页与 302 可被缓存 | 令牌经代理缓存泄露 | 两处响应都加 `Cache-Control: no-store`，回调页加 `Referrer-Policy: no-referrer` |

### 本轮验证记录

| 命令 | 实际结果 |
|---|---|
| `npx astro check` | 55 文件 0 errors / 0 warnings / 0 hints |
| `npx vitest run` | 9 个测试文件、69 项通过（新增 `tests/oauth-functions.test.ts` 10 项） |
| `npm run check:cms-oauth` | 12/12：真实 Decap 3.8.3 客户端 + Playwright；登录按钮 → `/api/auth` 的 302 参数校验 → 弹窗回跳 `/api/callback` → 令牌写入 `localStorage.decap-cms-user` 且 `token` 字段正确 → 后台关闭弹窗 → 侧栏出现「文章」集合 → 登录域名下不出现地址提示条、非登录域名下必须出现 |
| `npm run verify:frontend` | 通过：双路径检查、内容集成、构建 21 页、851 条站内引用无死链、前端必需产物齐全 |

### 排查中被实测否定的三条假设（记录以免重走）

1. Playwright 的 `context.route` **拦不到「服务端 302 跳出去」的下一跳**（探针对比：直接导航能拦，302 之后拦不到）。
2. `functions/api/*.js` 里的 `fetch` 跑在服务端进程（真实环境是 Cloudflare Worker），浏览器层路由对它无效，必须在 Node 层做替身。
3. 弹窗一旦真的加载 GitHub 登录页，GitHub 的 **COOP 响应头会切断 `window.opener`**，之后无论怎么导航回来握手都回不来。

因此 `scripts/check-cms-oauth.mjs` 的等价链路是：测试服务照常调用真实函数并断言它产出的授权 URL，再由测试服务等价模拟「GitHub 接受授权后带 code 回跳」那一跳；令牌端点用 Node 层替身。函数自己负责的两段（生成授权地址、处理回调）都是真跑的。

### 仍未完成

Cloudflare Pages 项目与 GitHub OAuth App 需要站长本人账号，线上后台登录与线上实测待站长完成注册后继续；`https://yukki-rui.pages.dev` 目前仍无 DNS 记录。

### 顺带堵掉的一个坑

`public/admin/index.html` 现在会读 `config.yml` 的 `base_url` 自查：如果当前域名不是登录域名（例如从 GitHub Pages 那份部署打开 `/admin/`），页面底部直接弹出提示条说明「登录只在 <正确地址>/admin/ 有效」。本机预览（`localhost`/`127.0.0.1`）跳过该检查，因为本地走的是 `local_backend`，不需要登录。两条断言都进了 `check:cms-oauth`。
