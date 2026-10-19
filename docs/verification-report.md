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
| 本地端到端(真实浏览器)| `npm run check:reading` **23/23**、`npm run check:search` **19/19**:动过布局的文章页与首页仍正常(目录/阅读时长/上下篇/进度条/代码复制/灯箱/转场、归档与检索、窄屏无横向溢出、无脚本异常)|
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

## 免登录评论区（DSH，2026-10-18）

站长要求「开启评论开关并增加评论区板块」，并明确希望「免费、读者不用登录 GitHub」。giscus / utterances 依赖 GitHub 账号，Waline 要额外开 Vercel + Neon 账号，Twikoo 要腾讯云实名，最终选**Cloudflare 自建**：D1（SQLite）+ Pages Functions，全部落在已开通的 Cloudflare 账号里，免费额度（5 GB 存储、每天百万级读）对个人博客够用，且不需要任何第三方账号。

### 架构

| 部分 | 位置 |
|---|---|
| 数据 | D1 表 `comments`：`id, thread, author, body, website, created_at, ip_hash, user_agent`，索引 `(thread, id)`、`(ip_hash, created_at)` |
| 公开接口 | `functions/api/comments.js`：`GET /api/comments?thread=...&limit=&before=` 新→旧分页，`POST` 写入 |
| 管理接口 | `functions/api/comments-admin.js`：Bearer `COMMENTS_ADMIN_TOKEN`，列表与按 id 删除；令牌用常数时间比较 |
| 前端 | `src/components/Comments.astro` + `src/lib/comments.ts`；`thread` = 去掉部署 base 的站内路径 |
| 管理页 | `public/admin/comments/index.html`；网页后台右下角「💬 评论管理」入口（Sveltia 没有自定义侧栏链接的配置项，只能用浮动链接）|
| 配置 | `src/consts.ts` 的 `COMMENTS`；双平台：Cloudflare 同源调用，GitHub Pages 镜像跨域调主站（CORS 白名单只放行站点域名与本机预览）|

防护都在服务端：蜜罐字段、1.5 秒最小耗时、同 IP 60 秒 1 条与 24 小时 20 条限流、昵称 1–40 / 正文 1–2000 / 网址必须 http(s)、只存 `sha256(ip + salt)`、输出按纯文本渲染（`<img onerror>` 之类执行不了）。

### 验证记录

| 项目 | 结果 |
|---|---|
| `npx astro check` | 62 files，0 errors / 0 warnings |
| `npx vitest run` | 11 files，119 tests 全通过（`comments.test.ts` 16 项、`comments-functions.test.ts` 34 项，D1 用 `node:sqlite` 做真实替身）|
| `npm run build` | 21 页；产物里 `#comments` 的 `data-thread="/zh/posts/hello-world/"`、`data-api`、`data-page-size="20"` 正确（双 base 下 thread 正确去掉 base）|
| `npm run check:cms-config` | 6/6 |
| `npm run check:cms-oauth` | 13/13 |
| `npm run check:comments` | **28/28**：真实 `wrangler pages dev` + 本地 D1 全链路——发评论、刷新仍在、XSS 不执行（`window.__xss === undefined`）、60 秒限流、管理页未存令牌/错令牌/正令牌、删除后前台变空状态、CORS 放行与拒绝、`cache-control: no-store`、无脚本异常 |

### 本轮发现并修掉的缺陷

1. **JS 类型判别失败导致 astro check 10 个错误**：`comments-admin.js` 的 `authenticate()` 返回 `{ok:false,response} | {ok:true,env}`，JS 里 `ok` 被推断成 `boolean`（不是字面量判别式），`if (!auth.ok) return auth.response` 收窄失败，两个导出函数的返回类型变成 `Response | undefined`。改为 `authenticate()` 直接返回 `Response | null`。
2. **端到端脚本首跑 26/28**：① 本地构建的 `data-api` 是 `https://yukki-rui.pages.dev/api/comments`（SITE_URL 指向生产），断言写死空串错误 → 改为「空或 endsWith('/api/comments')」；② 管理页未存令牌时没有初始状态文案 → 初始化分支补「先填写并保存管理令牌。」。

### 线上配置与验收（2026-10-18，已完成）

Cloudflare 侧用 wrangler 的 OAuth 令牌调 API 完成（比在控制台点更不容易出错，也留下了可复现的记录）：

| 项目 | 结果 |
|---|---|
| D1 数据库 | 新建 `yukki-rui-comments`（`a4d19c7e-67d7-4bb8-97c5-07a065d85929`），并用 API 执行建表与两个索引的 DDL |
| Pages 绑定 | 项目 `yukki-rui` 的 production/preview 都加了 D1 绑定，变量名 `DB` |
| 管理令牌 | production/preview 都设了 `COMMENTS_ADMIN_TOKEN`（secret_text）|
| 部署 | 重试部署 `e44fadad`（提交 a5ddab3）后绑定生效；`/api/comments` 由 503 变 200 |
| 线上接口验收 | **21/21**：GET 200、发评论 201、刷新仍在、1.5 秒限流、蜜罐、同 IP 60 秒限流 429、管理接口 401/401/200、删除、CORS 放行与拒绝、页面可达性 |
| 真实浏览器验收 | **12/12**：Cloudflare 与 GitHub Pages 文章页各自「渲染 → 发评论 → 立即出现 → 纯文本（无注入）→ 管理接口可见 → 删除」全部通过，无脚本异常 |

### 线上发现并修掉的缺陷：CORS 白名单域名拼写错误

首轮真实浏览器验收时，Cloudflare 站 6/6 通过，GitHub Pages 镜像站评论加载失败。抓包定位：`POST /api/comments` 返回 `400 too-fast`（这是脚本发太快，属误报），但真正的问题是镜像站请求根本没到函数——CORS 白名单里把 GitHub 用户名写成了 `liukki`（少一个 y），真实来源 `https://liyukki.github.io` 被判 403。

修复：`functions/api/comments.js` 与 `src/lib/comments.ts` 的白名单改为 `https://liyukki.github.io`（测试、脚本、设计文档同步修正），并加了回归测试——真实来源放行、拼错的来源必须拒绝。提交 `c88550f`，两个平台部署后复验：CORS 预检 204 且回显正确来源，浏览器验收 **12/12** 通过。

这个缺陷说明：单元测试用自己编的域名也能全绿，**只有真实浏览器站在真实域名上才能暴露**。新增的 `npm run check:comments-live` 把这类检查固化下来（默认只读，`-- --write` 时跑发→查→删闭环）。

## 阅读体验：目录、阅读时长与阅读增强（DSH，2026-10-18）

站长要求「看看这个网站还能做些什么」，随后确认四组改进全做（A 阅读体验 / B 搜索与归档 / C 运营工具 / D 分享与页面；另有 E 隐私与安全建议），按 P1→P4 分批实施。本节记录 P1（阅读体验）。

设计文档 `docs/superpowers/specs/2026-10-18-reading-experience-design.md`，实现计划 `docs/superpowers/plans/2026-10-18-reading-experience-plan.md`，其余三组的调研归档在 `docs/superpowers/research/2026-10-18-roadmap-research.md`。

### 交付内容

| 部分 | 位置 | 说明 |
|---|---|---|
| 阅读时长 / 目录纯函数 | `src/lib/reading.ts` + `tests/reading.test.ts` | `countReadingMinutes`（中文 300 字/分、英文 200 词/分，向上取整至少 1）、`selectTocHeadings`（只留 h2/h3）、`formatReadingTime`（替换 `{minutes}`），9 项单测 |
| 目录 | `src/components/PostToc.astro` | 宽屏右侧 sticky 常驻、窄屏正文上方 `details` 折叠；标题少于 2 个不渲染 |
| 上一篇 / 下一篇 | `src/components/PostNav.astro` | 按发布日期排序：更早=「上一篇」、更新=「下一篇」（WordPress/Hexo 惯例）；单侧为空显示虚线占位 |
| 阅读增强 | `src/components/PostExtras.astro` | 顶部进度条、TOC 高亮（IntersectionObserver）、代码块「复制」、图片灯箱、返回顶部；均支持 View Transitions 后重入 |
| 接线 | `src/layouts/PostLayout.astro`、`src/pages/[lang]/posts/[...id].astro`、`src/layouts/BaseLayout.astro` | `<ClientRouter />` 开启页内转场；`render()` 的 `headings` 喂目录、`getPosts()` 算上下篇 |
| 隐私 | `src/content/site/home.zh.json` / `home.en.json` | 首页原先明文公开 QQ 与微信，改为指向评论区与 X |

### 验证记录

| 项目 | 结果 |
|---|---|
| `npx astro check` | 69 files，0 errors / 0 warnings |
| `npx vitest run` | 12 files，**128 tests** 全通过 |
| `npm run build` | 21 页；产物含 `data-reading-progress`、`post-toc--inline/--aside`、`post-reading`、`post-nav__card`、`rel="prev"`、ClientRouter 脚本 |
| 本地端到端 `npm run check:reading` | **23/23**（默认跑本地 `dist/`，设 `LIVE_ORIGIN`/`LIVE_BASE` 可直接跑线上）：阅读时长、目录可见/条目数/宽屏隐藏折叠版、上下篇内链、进度条、返回顶部、目录高亮、代码复制（剪贴板内容一致）、灯箱开/关、转场换文、转场后主题保持（浅色与深色各一次）、评论重新初始化、转场后进度条与返回顶部仍工作、主题切换、390px 窄屏折叠目录且无横向溢出、上下篇单列 |
| 线上验收（2026-10-18） | Cloudflare Pages 与 GitHub Pages 各跑一遍 `check:reading` 均 **23/23**（`LIVE_ORIGIN=https://yukki-rui.pages.dev`、`LIVE_ORIGIN=https://liyukki.github.io LIVE_BASE=/yukki-rui/`）；`npm run check:comments-live` **15/15**；两站首页已无 QQ/微信明文 |

### 本轮发现并修掉的缺陷

1. **开启 View Transitions 后深色主题丢失**：`<ClientRouter />` 转场时替换 `<html>` 属性，`document.documentElement.dataset.theme` 变 undefined，深色模式用户导航一次就闪回浅色。修复：BaseLayout 的 inline 脚本抽成 `applyTheme()`，并监听 `astro:after-swap` 重新贴主题；端到端补了「浅色→浅色」「深色→深色」两条断言。
2. **转场后交互脚本全部失效**：`ThemeToggle`、`LangSwitch`、评论区的初始化都只在首屏跑一次。改为可重入 `init()`（`dataset` 防重复绑定）+ 监听 `astro:page-load`。
3. **目录双份渲染导致高亮错位**：页面同时渲染 inline 与 aside 两版目录，原来每个锚点只记第一个链接（inline 在前、桌面端被 CSS 隐藏），结果可见的 aside 永远不高亮。改为 `Map<hash, HTMLAnchorElement[]>`，同一锚点的所有链接一起加 `is-active`。
4. **复制按钮文案被带进剪贴板**：复制用 `code.innerText` 而不是 `pre.innerText`；自检里发现剪贴板换行是 CRLF，断言改为按行归一化后比较。
5. **`prose.rise` 入场动画的 transform 会给 `position: fixed` 造 containing block**：进度条与返回顶部按钮如果在文章容器内，只会固定在文章而非视口。实现改为初始化时把这两个节点迁到 `document.body`。
6. **CI 上 `check:content` 因 ClientRouter 编译元数据缺失而失败**：该脚本把源码复制到系统临时目录、再用软链接指向 `node_modules`；Astro 内部组件（`astro/components/ClientRouter.astro`）经 realpath 解析后的路径与主模块不一致，Linux 上报 `No cached compile metadata found for ".../ClientRouter.astro?astro&type=style..."`（Windows 的 junction 恰好不触发）。修复：临时工程改放到项目目录内部（`.tmp-content-check-*`，已被 `.gitignore` 的 `.tmp-*` 覆盖），Node 按层级正常解析到同一份 `node_modules`，不再依赖软链接。

> 并行开发约定：P1 的两个组件由只读子代理（Task 2/3）在独立文件里实现、主代理负责接线与门禁；同一文件（PostExtras.astro 的 TOC 高亮段）出现过一次并发改写，最终以主代理修订版为准。

## 搜索与归档：Pagefind 静态索引（DSH，2026-10-18，P2）

站长确认 A/B/C/D 四组改进全做，按 P1→P4 分批；P1（阅读体验）上线后实施 P2（B 组：搜索与归档）。设计文档 `docs/superpowers/specs/2026-10-18-search-archive-design.md`，实现计划 `docs/superpowers/plans/2026-10-18-search-archive-plan.md`。

选型：**Pagefind**（Rust/WASM 静态索引，`pagefind@1.5.2` 作为 devDependency）。理由是索引产物是纯静态文件，Cloudflare Pages 与 GitHub Pages 用同一套机制、都不需要服务器或数据库；否决了第三方搜索服务（要外部账号/额度）与客户端全量 JSON 搜索（文章变多后首屏体积不可控）。

### 交付内容

| 部分 | 位置 | 说明 |
|---|---|---|
| 归档分组纯函数 | `src/lib/archive.ts` + `tests/archive.test.ts` | `groupPostsByYear`：按 `pubDate.getFullYear()` 分组、年份倒序、组内按时间倒序、同日保持传入顺序；4 项单测 |
| 归档页 | `src/pages/[lang]/archive.astro` | 构建期静态渲染，每年一个 `.card`，条目带日期、标题、内链；中英各自独立 |
| 搜索页 | `src/pages/[lang]/search.astro` | 页面里只放挂载点与 i18n data 属性，`pagefind-ui.js` / `pagefind-ui.css` 在运行时注入（原因见下） |
| 导航 | `src/consts.ts` | `NAV` 增加「归档 / 搜索」（中英各 5 项）；`UI` 增加 `search*` / `archive*` 8 个文案键 |
| 索引范围 | `src/layouts/PostLayout.astro`、`PostExtras`/`PostToc`/`PostNav`/`Comments` | 只有文章 `<article>` 带 `data-pagefind-body`；目录、上下篇、评论、增强脚本容器带 `data-pagefind-ignore` |
| 构建 | `package.json` | `"build": "astro build && pagefind --site dist"`；本地实测索引 2 种语言、6 篇文章、528 词（草稿被排除，正文外的日期/阅读时长已排除）|
| 发布门槛 | `scripts/check-frontend.mjs` + `tests/frontend-readiness.test.ts` | required 增加归档页、搜索页、`pagefind/pagefind-entry.json`、`pagefind/pagefind-ui.js`；单测同步 |

### 验证记录

| 项目 | 结果 |
|---|---|
| `npx astro check` | 75 files，0 errors / 0 warnings |
| `npx vitest run` | 13 files，**134 tests** 全通过（新增归档 4 项 + 前端门禁 2 项）|
| `npm run verify:frontend` | 退出码 0：两种 base 各 **27 个真实页面、1099 条站内引用**通过，构建、死链、前端必需产物全过 |
| 本地端到端 `npm run check:search` | **19/19**：中英导航各 5 项且链接带 base、归档年份分组/条目/篇数/倒序、英文归档、搜索框与本地化占位、中文检索命中且链接指向站内文章、无结果文案、搜索页与归档页自身不进索引、英文检索、点结果进文章页、经页头导航转场进搜索页后仍可检索、390px 窄屏归档与搜索页均无横向溢出、Pagefind 资源无 4xx、无脚本异常 |
| 线上验收（2026-10-18） | 提交 `7daead6` 推送后，两平台各跑一遍 `check:search` 均 **19/19**：Cloudflare `LIVE_ORIGIN=https://yukki-rui.pages.dev LIVE_BASE=/`、GitHub Pages `LIVE_ORIGIN=https://liyukki.github.io LIVE_BASE=/yukki-rui/`（重点验证了 base 为 `/yukki-rui/` 时 Pagefind 资源与索引路径）|

### 本轮踩到的坑

1. **搜索页资源不能写死 `<link>`**：`scripts/check-base-parity.mjs` 与 `scripts/check-content.mjs` 只跑 `astro build`、不跑 Pagefind，因此这两种构建里没有 `dist/pagefind/`；静态写死引用会被 `check:links.mjs` 判成死链，把发布门槛弄挂。改为页面加载后在浏览器里注入 `<link>` 与 `<script>`，`data-bundle` 用 `withBase('pagefind/')`，两种 base 都正确。
2. **搜索页必须排除自身与界面元素**：Pagefind 只索引带 `data-pagefind-body` 的页面；不标记的话搜索页、归档页的标题文案会被搜到（自检里用「ARCHIVE LEDGER」验证 0 结果）。评论、目录、上一篇/下一篇也加了 `data-pagefind-ignore`，否则正文会被目录/邻居标题污染。
3. **中文无 stemming 是正常的**：`pagefind` 输出 `Note: Pagefind doesn't support stemming for the language zh-cn`，检索仍可用（按字匹配），不要用 `--force-language` 强制成英文（会让中英混排索引错乱）。
4. **`npm i -D pagefind` 会把 extraneous 的 playwright 清掉**：本地端到端的几个 `check:*` 脚本依赖 playwright，仓库约定不把它写进 `package.json`（避免云端构建装浏览器内核），所以本机要用时临时 `npm i --no-save playwright`。
5. **线上首次检索比本地慢得多**：线上要下载 wasm 与索引，第一轮「搜索」会在 1.2 秒后才出结果，固定 `waitForTimeout(1200)` 的断言会误报「结果=0」。已把 `scripts/check-search.mjs` 的 `searchFor()` 改为 `waitForFunction` 等确定信号（出现结果条目，或出现「没有找到」提示），最多 20 秒，本地与两平台线上都能稳定通过。同类问题在 P1 的 `check:reading` 也修过一次——线上脚本断言要等状态、不要等时长。

### 尚未做

当时记的是「P3 与 P4 仍待做」;这两项随后在 2026-10-19 做完(见下面两节),P3 里的访问统计因为需要登录 Cloudflare 控制台,单独留在最后。

## 运营提醒:新评论通知与草稿提醒(GitHub Actions,2026-10-19,P3)

站长确认 A/B/C/D 全做后,P3(C 组)先做「不需要站长操作」的两项;访问统计要登录控制台,留到最后。

选型:**GitHub Actions + Issue**。理由是这套东西不新增账号、不新增服务(仓库自带的 Actions 与 Issues 就够),评论内容本来就公开在网页上;否掉了邮件(要发信服务、自有域名或应用专用密码)与第三方推送服务(多一个账号要维护)。手机推送作为可选增强用 ntfy:免注册、topic 名即密钥,不配就只写 Issue。

### 交付内容

| 部分 | 位置 | 说明 |
|---|---|---|
| 工作流 | `.github/workflows/ops-reminders.yml` | 两个 job:`comments` 每 30 分钟、`drafts` 每周一 01:00 UTC(北京时间 09:00);手动触发可以只跑其中一个 |
| 已读位置 | 固定的「新评论提醒」Issue 正文 | 用 HTML 注释 `<!-- lastId: N -->` 记最大评论 id,不引入额外存储;首次运行只看最近 45 分钟,避免把历史评论一次性刷出来 |
| 草稿提醒 | 固定的「草稿提醒:待发布的文章」Issue | `draft: true` 且起稿满 3 天的文章;没有待提醒的草稿时自动关闭这条 Issue |
| 手机推送(可选) | 仓库 secret `NTFY_TOPIC` | 未配置就跳过;推送失败不影响 Issue 写入 |
| 必需 secret | `COMMENTS_ADMIN_TOKEN` | 已于 2026-10-19 添加到仓库 secrets;缺失时 job 直接跳过而不是报错 |

### 验证记录

| 项目 | 结果 |
|---|---|
| 手动触发 | `gh workflow run ops-reminders.yml -f job=comments` 与 `-f job=drafts` 都跑通,运行 39223037274、39223122670 等均 success |
| 真评论链路 | 用线上接口发一条测试评论(id=8,昵称「通知测试」)后触发 → Issue #2「新评论提醒」被创建,正文带 `<!-- lastId: 8 -->`,并列出这条评论;随后删掉测试评论、重跑,输出「新评论 0 条(已读位置 8 → 8)」,正文推进为「目前还没有新评论」 |
| 草稿链路 | `going-live.md` 已躺 3 天 → Issue #1「草稿提醒:待发布的文章」列出标题与文件路径;补上「草稿处理完后自动关闭」分支后重跑,输出「没有躺太久的草稿。」并关闭提醒 |
| 幂等 | 没有新评论时不重复建 Issue、不重复追加评论;已读位置只在确实推进时才改写正文 |

### 本轮踩到的坑

1. **没 checkout 的 job 里 `gh` 找不到仓库**:`drafts` 那个 job 不 checkout,`gh issue list` 会报「not a git repository」,必须显式给 `GH_REPO: ${{ github.repository }}`(提交 f996f1f)。
2. **公共仓库的提醒 Issue 是公开的**:评论者昵称和正文会出现在 Issue 里(正文已截断 300 字)。将来若不希望公开,就把通知改成只走 ntfy。
3. **定时任务会被暂停**:公共仓库连续 60 天没有活动时 GitHub 会自动停用 schedule,有新提交后恢复——「没收到提醒」先看这一条。

### 尚未做

**访问统计(Cloudflare Web Analytics)**:调研结论是 Pages 控制台一键开启(Metrics → Web Analytics → Enable),边缘自动注入 beacon、不用手贴脚本,只对 pages.dev 与绑定域名生效,GitHub Pages 镜像统计不到。这一步必须登录 Cloudflare 控制台的浏览器会话才能点,因此留在这里。已用 wrangler 的 OAuth 令牌试过 API(`/accounts/{id}/rum/site_info/list`),返回 403 Authentication error——该令牌不能代替控制台登录。

## 每篇文章的分享图与结构化数据(2026-10-19,P4)

D 组里「不需要站长提供素材」的部分:每篇文章在构建期生成一张 1200×630 的分享图,页面里同时输出 JSON-LD 结构化数据。选型与最小实现路径见 `docs/superpowers/research/2026-10-18-roadmap-research.md` 的 P4-1/P4-2;当时否决了 Playwright 截图(CI 装不了浏览器)与运行时生成(GitHub Pages 没有 Functions)。

### 交付内容

| 部分 | 位置 | 说明 |
|---|---|---|
| 卡片纯逻辑 | `src/lib/og.ts` | 尺寸、配色、flex 结构、`clampText` 截断与中英各一套字数上限(中文 20/40,英文 52/88);可被单测覆盖 |
| 构建期路由 | `src/pages/og/[...slug].png.ts` | `getStaticPaths` 遍历文章 → satori 出 SVG → resvg 出 PNG;响应带 `cache-control: immutable` |
| 字体 | `src/assets/fonts/ark-pixel-12px-proportional-zh_hans.ttf` | Ark Pixel 12px(OFL,许可文本随仓库);放在 `src/assets` 而不是 `public`,只进构建不进产物;字号取 12 的整数倍最清晰 |
| 结构化数据 | `src/components/JsonLd.astro` | `set:html` 不转义,所以手动把 `<` 换成 `\u003c`,防止正文里出现 `</script>` 提前闭合 |
| 接线 | `src/layouts/PostLayout.astro`、`src/layouts/BaseLayout.astro`、`src/pages/[lang]/index.astro` | 文章页传 `ogImage` 与 BlogPosting;首页输出 WebSite;BaseLayout 新增可选 `jsonLd` 属性 |
| 单测 | `tests/og.test.ts` | 13 项:路径换算、id 里的点、截断、字数上限、卡片结构与字段 |
| 发布门槛 | `scripts/check-og.mjs`(`npm run check:og`,已并入 `verify:frontend` 与 GitHub Actions) | 见下「为什么还要一个检查脚本」 |
| 依赖 | `satori` + `@resvg/resvg-js`(devDependencies) | 只用于构建期,浏览器端零新增依赖;lockfile 含 `@resvg/resvg-linux-x64-gnu`,CI(linux)能装 |

### 验证记录

| 项目 | 结果 |
|---|---|
| `npx astro check` | 80 files,0 errors / 0 warnings / 0 hints(新代码先是带出 3 条提示:多余的 `JsonLd` import、`getStaticPaths` 该用 async、`check-og.mjs` 里没用到的 import,都已清掉) |
| `npx vitest run` | 14 files,**147 tests** 全通过(新增 og 13 项) |
| `npm run verify:frontend` | 退出码 0:两种 base 各 **27 个真实页面、1099 条站内引用**通过,构建、死链、分享图/结构化数据、前端必需产物全过 |
| `npm run check:og` | **17 个页面 / 8 块 JSON-LD / 6 张文章分享图**:og:image 与 JSON-LD 自洽,图都是 1200×630 且确实有渲染内容 |
| 视觉验收 | 4 张预览图人工看图确认:中文、英文、超长标题、英文最坏情况(两行标题 + 两行摘要,底部一行不碰撞、装饰不越界) |
| 负向验证 | 故意弄坏三处,检查都拦住了:①把某篇的卡片图换成默认深色图 → 「背景占比过低/缺少强调色装饰」;②删掉文章页 JSON-LD → 「缺少 JSON-LD 结构化数据」;③把 `@type` 改成 Article → 「类型是 Article,应为 BlogPosting」 |

### 为什么还要一个检查脚本

OG 图是**二进制产物**:文件在、尺寸对,也可能是字体没加载、渲染出来的空白卡片;JSON-LD 是内联在页面里的字符串,字段拼错、写错类型,构建都不会报错。`check:og` 因此做了两件 `check:links` / `check:frontend` 做不到的事:自己解码 PNG(用 `node:zlib` 写了个最小解码器,不引依赖)统计背景色/正文色/强调色像素与颜色总数,以及解析 JSON-LD 并与页面上的 `og:title`、canonical、页面语言逐项比对。

### 本轮踩到的坑

1. **Astro 路由参数会吃掉 id 里的点**:英文文章 id 是 `hello-world.en`,页面路径实际是 `/en/posts/hello-worlden/`,所以构建期产出的分享图也叫 `hello-worlden.png`。最初 `ogImagePath` 按原 id 拼路径,`check:links` 直接报死链——两处必须一致(单测里固化了这条)。
2. **satori 默认 content-box**:声明 `height: 630px` 之后还会再叠上上下 padding,底部那一行与右下装饰会被裁到画布外;必须 `boxSizing: border-box`。
3. **satori 只认 flex**:`block` / `inline` 的正常排版不生效,间距全靠 flex 与 margin;长文本也不会自己缩,得靠 `clampText` 截断加 `overflow: hidden` 兜底。
4. **字体是这套方案的主要成本**:satori 不支持 woff2,而仓库原先 0 个字体文件。最终选 Ark Pixel 12px 像素字体(与站点像素风一致、OFL 可商用、5.2MB 只进构建),并用截图确认中文不缺字。
5. **图上印的网址来自 `SITE_URL`**:本地构建默认是 `LOCAL_SITE_URL`(localhost:4321),所以本地预览的分享图会印 `localhost:4321`——不是 bug;两个平台都配了 `SITE_URL`,线上印的是各自域名。

### 尚未做

D 组剩下的是「要站长给素材」的部分:友链页、Now 页、作品集、最近在听;RSS 也还是摘要输出,全文输出未做。
