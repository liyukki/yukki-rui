# A/B/D 组合增强设计(写作发布 / 读者体验 / 社区互动)

- 日期:2026-10-21
- 状态:待站长审阅(方向已口头确认:A1+A2、B1+B2、D1+D2)
- 相关:`src/content.config.ts`、`src/lib/post-select.ts`、`src/components/Comments.astro`、`functions/api/comments.js`、`public/admin/config.yml`、`docs/usage-guide.md`

## 1. 背景

站点已完成内容、双语、搜索、归档、全文 RSS、评论(免登录 + D1 + 限流 + 管理页 + Issue 提醒)等基础能力。
本次在**三条互不重叠的方向**上各补一个最小可行的功能组合,原则是:

1. 不新增付费服务、不引入第三方脚本、不要求读者注册账号。
2. 复用现有测试与发布门槛(`npm run verify:frontend`),每条新功能都要有可自动验证的证据。
3. 尽量落在已有的纯函数层 / 已有 Cloudflare 资源上,能回退。

三项组合:

- **A1 定时发布 `publishAt` + A2 精选置顶 `featured`**(写作与内容管理)
- **B1 阅读设置(字号/行高/宽度)+ B2 相关文章推荐**(读者体验)
- **D1 单层回复 + D2 评论表情反应**(社区与互动)

## 2. 非目标(本期不做)

- 无限嵌套评论、评论先审后发、敏感词自动拦截、用户账号体系。
- 文章系列 / 阅读路径、收藏夹、阅读历史、移动端抽屉式导航。
- 数学公式(KaTeX)、Mermaid 图表渲染。
- 评论数展示在文章列表或 RSS 中;点赞接入 Issue 通知。
- 外链存活检查、错字检查(未证实为必要缺口,本期不引入新检查)。

## 3. A 类:写作与内容管理

### 3.1 A1 定时发布 `publishAt`

**现状缺口**:`draft` 是二元开关,`pubDate` 填未来日期也立刻发布,没有「到点才出现」的能力。

**规则**:

- 新增可空 `publishAt`(`datetime`,沿用 `emptyToUndefined` 惯例,留空 = 不启用定时)。
- 生产可见判定:`!draft && (publishAt == null || publishAt <= now)`。
- **`draft: true` 永远压过 `publishAt`**(草稿不会被定时放出来)。
- 开发模式(`astro dev`)保留全部内容,便于本地预览未来的文章;规则仍写在纯函数里,`isProd` 显式传入。
- 时间统一按 **UTC** 存储与比较,与现有 cron 工作流一致。
- 生效范围自动覆盖列表、文章页 `getStaticPaths`、标签、归档、RSS、sitemap、Pagefind(它们都经 `getPosts()`)。

**静态站的限制与对策**:Astro 构建是快照,到点不会自动出现。新增一条 cron 工作流(或在 `ops-reminders.yml` 增加 job),**每 30 分钟**检查是否存在「已到 publishAt 但尚未构建过」的文章,命中则 `gh workflow run deploy.yml` 触发重建。粒度受 GitHub Actions 定时任务的天然延迟影响,精确到分钟不现实,已在文档中说明。

### 3.2 A2 精选置顶 `featured`

**现状缺口**:没有任何优先级字段,列表只按 `pubDate` 倒序。

**规则**:

- 新增布尔 `featured`(默认 `false`)。
- 排序:`featured` 优先,其次 `pubDate` 倒序;平局再按 id 升序保证结果稳定。
- **只影响首页列表顺序**,归档页与 RSS 保持时间倒序不变,避免破坏既有断言与订阅预期。
- 中英双语是两份文件,置顶需分别勾选,后台 hint 中写明。

**改动文件(与 A1 共享)**:

- `src/content.config.ts`(两个新字段)、`src/lib/post-select.ts`(可见性判定 + 排序,纯函数)、`src/lib/posts.ts`(传入 now)、`public/admin/config.yml`(两个字段 + `view_filters` 增加「精选」「定时」)、`tests/post-select.test.ts`、`scripts/check-content.mjs`、`.github/workflows/`

## 4. B 类:读者体验

### 4.1 B1 阅读设置

**现状缺口**:只有深浅主题切换,正文 `--fs-body`、行高、`--maxw` 全是固定值。

**规则**:

- 三档独立调节:**字号**(小/中/大)、**行高**(紧凑/标准/宽松)、**正文宽度**(窄/标准/宽)。
- `localStorage` 持久化,键名 `reading-settings`,与现有 `theme`/`lang` 模式一致。
- `<head>` 内联恢复,避免首屏闪烁;`prefers-reduced-motion` 下不做过渡动画。
- **正文变量与像素字体标题变量分离**:调字号不得影响标题像素字体。
- 隐私模式下 `localStorage` 抛错时静默降级到默认值。

**改动文件**:新增 `src/components/ReadingSettings.astro`、`src/layouts/BaseLayout.astro`、`src/styles/tokens.css`、`src/consts.ts`、新增 `tests/reading-settings.test.ts`、`scripts/check-reading.mjs`

### 4.2 B2 相关文章推荐

**现状缺口**:`PostNav` 只按时间给上下篇,没有基于主题的内容发现。

**规则**:

- 构建期按 **标签重合度** 计算,新增纯函数 `src/lib/related.ts`。
- 同语言、排除自身、排除草稿;按重合标签数倒序,平局按 `pubDate` 倒序,再按 id 升序(确定性)。
- **无合格推荐(重合为 0)时不渲染该区块**,避免空泛推荐。
- 推荐区块加 `data-pagefind-ignore`,不污染搜索正文索引。
- 最多展示 3 篇。

**改动文件**:新增 `src/lib/related.ts` + `tests/related.test.ts`、`src/pages/[lang]/posts/[...id].astro`、`src/layouts/PostLayout.astro`、`src/consts.ts`、`scripts/check-reading.mjs`

## 5. D 类:社区与互动

### 5.1 D1 单层回复

**现状缺口**:评论是扁平结构,无法回复,讨论会各说各话。

**规则**:

- `comments` 表新增可空 `parent_id`(旧数据为 `NULL`,继续当根评论)。
- **只做单层**:根评论分页,回复平铺在所属根评论下,不做无限嵌套与递归查询。
- 父评论必须属于同一 `thread`;禁止自引用;父评论不存在时拒绝写入。
- 父评论被删除时,其回复**级联隐藏**(加 `hidden` 标记,保留数据以便恢复,不做物理删除)。
- 回复沿用现有校验与限流;前端只渲染昵称/时间/正文,继续全部用 `textContent`(防 XSS)。

### 5.2 D2 评论表情反应

**现状缺口**:不想写长评论的读者没有任何参与方式。

**规则**:

- 固定 3 种反应:赞 / 喜欢 / 有用;类型一旦公开不再变动。
- 新增独立表 `comment_reactions`,`UNIQUE(comment_id, reaction, ip_hash)` 去重。
- 沿用加盐 IP 哈希,不存明文 IP。
- 删除评论时同步清理其反应。
- **不接入 Issue 通知**,避免每点一次就产生运营噪音。
- 已知精度上限:同一 NAT / 校园网出口视为同一来源会误去重,机器人仍可刷;只做基础限流,不追求绝对准确。

**改动文件(与 D1 共享)**:`functions/api/comments.js`、`functions/api/comments-admin.js`、`src/components/Comments.astro`、`src/lib/comments.ts`、`public/admin/comments/index.html`、`src/consts.ts`、`tests/comments-functions.test.ts`、`scripts/check-comments.mjs`、`README.md`、`docs/usage-guide.md`

## 6. 数据迁移与兼容

- D1 建表是幂等的 `CREATE TABLE IF NOT EXISTS`。新增列用 `ALTER TABLE ... ADD COLUMN` 包在「列已存在则忽略」的容错里(或先查 `PRAGMA table_info`)。
- 旧评论 `parent_id` 为 `NULL`,前端按根评论展示,行为与现在一致。
- 反应表对旧评论天然计数为 0,无需回填。
- A 类新字段均可空/有默认值,**旧文章文件不需要改动**即可通过 schema 校验。

## 7. 测试与验收

- A:`tests/post-select.test.ts` 增加「未来 publishAt 在生产不可见 / draft 压过 publishAt / featured 排序稳定」;`scripts/check-content.mjs` 增加未来文章不进构建产物的断言。
- B:新增 `tests/related.test.ts`、`tests/reading-settings.test.ts`;`scripts/check-reading.mjs` 增加设置持久化、转场后仍生效、390px 无横向溢出。
- D:`tests/comments-functions.test.ts` 增加回复父级校验、跨 thread 拒绝、父删除后级联隐藏、反应去重与清理;`scripts/check-comments.mjs` 增加回复与反应端到端。
- 统一门槛:`npm run verify:frontend` 必须全绿(类型 + 单测 + 双 base 构建 + 链接 + 内容 + 分享图 + 前端产物)。

## 8. 共享文件与实现分工

以下文件被两条以上线路触碰,**实现阶段必须串行合并**,不能纯并行:

| 文件 | 涉及线路 |
| --- | --- |
| `src/content.config.ts` | A1 + A2 |
| `src/lib/post-select.ts` | A1 + A2 |
| `src/lib/posts.ts` | A1 + A2 |
| `src/layouts/PostLayout.astro` | B2 |
| `src/consts.ts` | B1 + B2 + D1 + D2 |
| `src/components/Comments.astro` | D1 + D2 |
| `functions/api/comments.js` | D1 + D2 |
| `functions/api/comments-admin.js` | D1 + D2 |
| `README.md` / `docs/usage-guide.md` | 三条线路 |

**并行边界**(各自闭环、内部串行):

- 工作流 1:A1 + A2(共享 `post-select.ts` 纯函数,同一子代理内完成)
- 工作流 2:B1
- 工作流 3:B2
- 工作流 4:D1 + D2(共享评论层,同一子代理内完成)

`src/consts.ts` 与文档由主代理在合并阶段统一补齐,避免并行改动冲突。

## 9. 风险与回退

- **A1**:静态站到点不自动发布,强依赖 cron 工作流;GitHub 定时任务在仓库 60 天无活动后会被暂停。若工作流失效,功能退化为「手动改 draft 发布」,不损坏站点。
- **A2**:排序语义只限首页,归档/RSS 不变,风险可控;回退只需删除字段与排序分支。
- **B1**:变量覆盖若误伤标题字体,是最主要的视觉回归风险,需在实现后用 QA 截图核对;回退为删除组件与覆盖变量。
- **B2**:当前文章少、标签少,推荐质量有限,已用「无重合不渲染」降级;回退为不渲染区块。
- **D1/D2**:D1 写放大与误去重是已知上限;回复与反应都是增量表,回退可只停用前端入口,数据保留。
