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

### 真实 Workers 运行时预演（workerd，2026-10-14）

`npm run dev` 跑的是 Astro，不是 Cloudflare 的运行时，所以再用 `npx wrangler pages dev dist`（wrangler 4.151.0）把 `functions/` 真正编译进 workerd 跑一遍：

| 检查 | 实际结果 |
|---|---|
| 函数编译与绑定 | `✨ Compiled Worker successfully`，`env.GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` 注入可见 |
| `GET /zh/` | 200 |
| `GET /admin/` | 200（`/admin/index.html` 被 Cloudflare 308 到干净地址） |
| `GET /api/auth?provider=github&...` | 302 → `https://github.com/login/oauth/authorize`，`client_id` / `redirect_uri` / `scope=repo` 正确 |
| `GET /api/callback` | 400 + 中文提示 |
| `GET /api/callback?error=access_denied&...` | 200，回传 error 消息 |
| `GET /api/callback?code=bogus` | 502，且确实向 GitHub 发出了真实请求（测试用 client_id 不存在，GitHub 回 `Not Found`，符合预期） |
| `GET /rss.xml` | 链接含 `yukki-rui.pages.dev` |
| `GET /robots.txt` | `Disallow: /admin/` |

另外 `npm ci --dry-run` 退出码 0，确认 `package-lock.json` 与 `package.json` 一致——Cloudflare 构建的第一步就是 `npm ci`。

### 仍未完成

（已在下方「线上验收」中完成。）

> 本机开着代理时 DNS 是 fake-IP（`*.pages.dev` 会解析成 `198.18.x.x`），外部验证要走公共 DoH 取真实 IP 再直连，别被本机解析结果误导。

### 顺带堵掉的一个坑

`public/admin/index.html` 现在会读 `config.yml` 的 `base_url` 自查：如果当前域名不是登录域名（例如从 GitHub Pages 那份部署打开 `/admin/`），页面底部直接弹出提示条说明「登录只在 <正确地址>/admin/ 有效」。本机预览（`localhost`/`127.0.0.1`）跳过该检查，因为本地走的是 `local_backend`，不需要登录。两条断言都进了 `check:cms-oauth`，并已在线上 GitHub Pages 实测生效。

## 线上验收：Cloudflare Pages 与网页后台（DSH，2026-10-16）

站点两个平台均已上线，网页后台可用。

### 部署与配置

| 项 | 实际值 |
|---|---|
| Cloudflare Pages 项目 | `yukki-rui`，连的仓库 `liyukki/yukki-rui`，生产分支 `master` |
| 构建命令 / 输出目录 | `npm run verify:frontend` / `dist` |
| 环境变量（Production） | `NODE_VERSION=24`、`SITE_BASE=/`、`SITE_URL=https://yukki-rui.pages.dev/`、`GITHUB_CLIENT_ID`(Text)、`GITHUB_CLIENT_SECRET`(Secret) |
| GitHub OAuth App | Homepage `https://yukki-rui.pages.dev`、callback `https://yukki-rui.pages.dev/api/callback`；未勾选 token 过期，登录一次长期有效 |
| 首次构建 | 成功。日志实测：`nodejs@24.13.1`（NODE_VERSION 生效）、类型检查 55 文件 0 错误、双路径 851 条引用通过、上传 112 个文件 |

### 外部验证（7/7）

本机开着代理时 DNS 是 fake-IP，所以验证走公共 DoH 取真实 IP 再直连：

```text
✓ yukki-rui.pages.dev 解析到 172.66.44.236
✓ 首页可访问 — HTTP 200
✓ 中文首页渲染 — HTTP 200
✓ RSS 使用 Cloudflare 地址 — HTTP 200
✓ 后台页面可访问 — HTTP 200
✓ OAuth 入口可用（302 到 GitHub） — client_id=Ov23liwLmCjyRZAjjkuu，redirect_uri 正确
✓ 取消授权时回传 error 而不是空白页 — HTTP 200
✓ 缺少 code 时给出可读的 400 — HTTP 400
```

### 浏览器端实测（真实登录 + 真实写入）

在 Edge（CDP 驱动，用站长自己的登录态）里操作线上站点：

| 步骤 | 结果 |
|---|---|
| 打开 `https://yukki-rui.pages.dev/admin/` 点 Login with GitHub | 弹窗走完 GitHub 授权，回到后台已登录（`decap-cms-user` 里是真实 token）|
| 后台列表 | 两个集合（文章 / 个人资料）与 6 篇文章全部从仓库读出 |
| 新建《上线验收测试》并 Publish | 仓库出现提交 `45bd343`，`pubDate` 自动填当天（config.yml 的 `{{now}}` 生效）|
| 删除该条目 | 原生确认框 → 仓库出现提交 `f11431e`，文件从仓库消失 |
| 两个平台的自动重建 | GitHub Pages 侧该文章的地址由 200 变 404；推送即自动部署这条链路成立 |

### 结论

README 里「登录一次、任何设备打开网页就能改内容」的承诺已实测成立；剩下只有可选项（个人素材、自定义域名、评论）。

### 一个已知的边缘缓存行为（不影响正常改内容）

- 正常页面（首页、文章、标签、RSS）实测响应头是 `Cache-Control: public, max-age=0, must-revalidate`，**改完内容重新部署后立刻生效**。
- 从来不存在的地址返回 `404` + 自制 404 页 + `Cache-Control: no-store`，行为正确。
- 唯一例外：**删除**一篇文章后，它原来的地址可能在 Cloudflare 边缘还留着一份旧缓存（实测 `CF-Cache-Status: HIT`、`s-maxage=604800`），最长约 7 天。此时该文章已从首页、标签页、RSS 和后台列表消失，只是那个旧网址被直接打开还能看到缓存副本。删除文章后若要立刻让旧地址失效，可在后台改一下任一内容触发新部署，或等缓存过期。

## 后台编辑器修复与换装 Sveltia CMS（DSH，2026-10-16）

### 起因

站长反馈两件事：**在后台用代码块之后，正文没法继续编辑**；后台界面交互不顺手。

### 根因（已复现，属上游编辑器结构问题）

Decap 的正文编辑器是 Slate，代码块是 **void 节点**（`data-slate-void="true"`、`contenteditable="false"`，内部套一个 textarea）。当代码块位于文档末尾时，它后面没有任何可放光标的文本节点：

| 操作 | 实际结果 |
|---|---|
| 点代码块下方空白处再打字 | 焦点落在 `body`，**字符完全不落地**（文档不变） |
| Esc 离开代码块 → 方向键 → 打字 | 字符**跑进代码块**（textarea 变成 `code();MARK-E`） |
| 点已有段落再打字（对照组） | 正常 |

附带现象：菜单打开时乱打字会触发 Slate 报错 `Error: Cannot resolve a DOM point from Slate point: {"path":[0,0],"offset":6}`。

**升级 Decap 无用**：3.8.3 与 3.17.1 行为完全一致（本地试验台各跑一遍）。

### 处置：换成 Sveltia CMS

Sveltia 是 Decap 的 drop-in 替代（富文本编辑器换成 Lexical），官方迁移文档明确「已为 Decap 建好的 OAuth App 可继续使用，无需新建」。

| 事项 | 实测结果 |
|---|---|
| 登录链路 | **完全兼容**：同一个 OAuth App、同一个 `functions/api/callback.js`；握手消息 `authorization:github:success:<json>` 被接受，令牌落在 `localStorage['sveltia-cms.user']`，之后带 `Authorization: token <TOKEN>` 调 GitHub API（会走 GraphQL） |
| 配置硬差异（Sveltia 严格校验） | ① `media_folder` / `public_folder` 必须是以 `/` 开头的绝对路径；② file collection 的 `name` 不能含点号（`home.zh` → `home-zh`，`file:` 路径不变，Astro 读取不受影响） |
| 回滚能力 | `config.yml` 仍同时兼容 Decap；回滚只需把 `index.html` 里的脚本地址换回 Decap |
| 正文编辑器 | 字段顺序与提示按配置渲染；工具栏有段落样式下拉（段落、1–6 级标题、无序/有序列表、引用块、**代码块**）、加粗/斜体/删除线/代码/链接/图片/「以 Markdown 编辑」 |
| 代码块后续输入 | 分两种情况：块后面还有段落时正常（按 ↓ 就能离开块继续写）；块是**全文最后一个块**时光标会被困在块内，脱身办法见下节「线上后台实测」 |
| 表格 | 没有表格按钮，用「以 Markdown 编辑」手写 Markdown 表格 |
| 窄屏 | 390px 宽度下字段单列、提示保留、无横向溢出 |

配置改动：全局 `media_folder: /src/content/posts/images`、`public_folder: /images`；posts 字段顺序调整为 标题→语言→草稿→摘要→发布日期→更新日期→标签→中英配对 Key→正文，并给常用字段补了中文提示。

### 本轮验证记录

| 命令 | 实际结果 |
|---|---|
| `npx astro check` | 55 文件 0 errors / 0 warnings / 0 hints |
| `npx vitest run` | 9 个测试文件、69 项通过 |
| `npm run check:cms-config`（新增） | 6/6：用真实 Sveltia 客户端加载 `public/admin/` 的真实配置 → 无「配置中存在错误」屏、登录入口可见、`backend`/`base_url`/`auth_endpoint` 正确、脚本地址带固定版本、无脚本异常 |
| `npm run check:cms-oauth`（迁移后） | 13/13：真实 Sveltia 客户端 + 真实 `functions/api/*.js`；断言「令牌写进 `sveltia-cms.user`」「后台带着该令牌调用 GitHub API」「后台读到账号资料」「登录域名下无地址提示条、非登录域名下必须有」 |
| `npm run verify:frontend` | 通过（类型、单测、双路径、内容集成、构建、链接、前端必需产物） |

为避免依赖本机 Playwright 的 headless shell，两个 `check:cms-*` 脚本支持 `CMS_OAUTH_CHROME` 环境变量指定浏览器可执行文件（README 已写）。

### 文档同步

README（后台选型、命令表、`CMS_OAUTH_CHROME`）与使用说明第 8/10 节全部改写为 Sveltia 流程：本地编辑走「使用本地仓库」（不再需要 `npm run cms`），线上登录按钮是「使用 GitHub 登录」，保存即发布，并新增「怎么写正文（工具栏）」「怎么上传照片」与配置报错等排错条目。

## 线上后台实测：写入、删除与一个会让构建失败的缺陷（DSH，2026-10-18）

用站长自己的登录态在受控 Edge 里对线上 `https://yukki-rui.pages.dev/admin/` 做了完整的「新建 → 存 → 删」操作，并据此修掉迁移带出的一个构建缺陷。

### 代码块之后到底能不能接着写（线上实测）

Sveltia 的富文本编辑器是 Lexical，行为与 Decap 的 Slate 不同，但也分两种情况：

| 情形 | 实测结果 |
|---|---|
| 代码块**后面还有段落** | 正常。插入代码块后按 ↓ 光标落到下一段，继续输入的文字落在下一段（实测：块内容 `code();第一段。`，下一段变成 `最后一段。MARK`）|
| 代码块是**全文最后一个块** | 光标被困在块内——点块下方空白（编辑器内还有约 67px 空区）、按 ↓、按 Enter 都还是往块里写；点样式下拉选「段落」会把整块**转成普通段落**（代码块丢失，代码要重贴）|
| 脱身办法 | ① 推荐：先把整篇正文写完，再把光标放到要变成代码的那一段，用样式下拉把它转成代码块——这样块后面总有内容；② 或点工具栏「以 Markdown 编辑」切到源码，在围栏后面另起一段 |

「以 Markdown 编辑」切过去后，正文源码就是标准围栏写法（实测读到 ` ```plain\ncode();第一段。\n```\n\n最后一段。MARK`），可当兜底手段。

### 写入与删除的真实链路

| 步骤 | 结果 |
|---|---|
| 新建《后台代码块验证（自动化，随后删除）》，正文含一个中间代码块，点保存 | 保存后自动回到列表；仓库出现提交 `acad3b9`，文件 frontmatter 完整（title/description/pubDate/lang/draft/tags），正文是 ` ```plain ` 围栏 + 段落 |
| 删除该条目 | 列表里勾选 →「删除选中的条目」→ 确认框「删除条目 您确定要删除选中的 1 个条目吗？」→ 仓库出现提交 `e41aee6`，文件从仓库消失 |

后台按钮的 aria-label 里带 U+2068/U+2069 控制字符（如 `Select ⁨标题⁩`），Playwright 按可访问名称匹配不到，自动化要用 `aria-label*="…"` 子串匹配。

### 迁移带出的构建缺陷（已修）

`acad3b9` 一推上来，**两个平台的构建都失败了**（GitHub Actions run `39096904946` 18s 失败；Cloudflare Pages 该部署显示 No deployment available）。原因：留空「更新日期」时后台会写出 `updatedDate: ''`，而 schema 是 `z.coerce.date()`：

```text
[InvalidContentEntryDataError] posts → 后台代码块验证自动化随后删除 data does not match collection schema.
  updatedDate: Expected type `"date"`, received `"object"`
```

`new Date('')` 是 Invalid Date，zod 判定不通过，整站内容就构建不出来了（线上服务的是上一个成功部署，所以站点本身没掉，但仓库已经推不出新版本）。

修复（`src/content.config.ts`）：加 `emptyToUndefined` 预处理，把空字符串当成「没填」，覆盖 `posts.updatedDate`、`posts.translationKey`、`site.heroImage.src/width/height`、`site.work.status` 这些「可选但非字符串」的字段。注意 `.optional()` 必须写在 `z.preprocess` 的**内层** schema 上（`z.preprocess(fn, z.coerce.date().optional())`）：写在外层时预处理产出的 `undefined` 仍会交给内层日期校验，照样报同一条错——这轮自己踩过。

修复后 `npm run build` 恢复正常；删掉测试文章后仓库又是 21 页。删除提交 `e41aee6` 的部署在两个平台都成功，也反过来证明「失败只由那一个空字段引起」。

### 文档纠正

使用说明 §10.3 与 §10.5 原先写「光标移到块外就能继续写」「样式下拉会变回段落」，线上实测证明对文末代码块不成立，已按上表改写为「先写完整正文、再回头把某段转成代码块 / 用 以 Markdown 编辑」。
