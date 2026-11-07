# 阅读任务线与划线边注设计

- 日期：2026-11-07
- 状态：已确认，待用户复核
- 范围：阅读任务线、文章划线高亮、边注与摘录面板
- 影响文件：`src/content.config.ts`、`src/content/journeys/*`、`src/lib/journeys.ts`、`src/lib/annotations.ts`、文章布局、首页、任务线页面、CMS 配置与测试

## 1. 背景与目标

站点已有本地阅读进度、继续阅读和文章收藏，但文章之间仍主要依靠标签与相关推荐连接，阅读过程缺少连续叙事；读者也无法在正文中保留自己的重点和想法。

本次同时实现两个互补功能：

1. **阅读任务线**：由作者显式编排多篇文章的阅读顺序，读者可以看到下一关、整条路线进度和章节导航。
2. **划线高亮与边注**：读者可以在文章正文中选择文本、保存高亮、附加备注，并从摘录面板回到原文。

所有个人阅读数据继续只保存在浏览器本地，不引入账号、后端数据库或跨设备同步。

两个功能使用独立的数据模块；实现时先交付阅读任务线，再交付划线边注。二者只共同修改文章布局，没有数据依赖，因此可以分阶段验证，但由同一份实施计划管理。

## 2. 非目标

- 不实现云端同步、跨设备合并或公开分享批注。
- 不实现多颜色高亮、批注标签、导出或全文标记搜索。
- 不锁定未完成章节，读者始终可以直接打开任意文章。
- 不按标签自动生成任务线，也不做算法推荐。
- 不引入 PWA、Service Worker 或新的第三方运行时依赖。
- 不修改现有 `yukki-personal-library-v1` 的存储结构。

## 3. 阅读任务线

### 3.1 内容模型

新增 `journeys` 内容集合，每条任务线使用独立 JSON 文件：

```json
{
  "slug": "build-this-site",
  "lang": "zh",
  "title": "从零搭起这座小站",
  "description": "从第一篇文章到把站点真正发布上线。",
  "draft": false,
  "order": 1,
  "steps": [
    { "postId": "hello-world", "label": "从第一条日志开始" },
    { "postId": "writing-in-markdown", "label": "让文字有结构" },
    { "postId": "building-this-site", "label": "把想法搬到线上" }
  ]
}
```

约束：

- `slug`、`lang`、`title`、`description` 必填。
- `draft` 默认 `false`，`order` 默认 `0`。
- `steps` 至少包含 2 个步骤；每个步骤必须指定当前语言下存在且可发布的文章 ID。
- `label` 可选；存在时作为任务线章节名，否则使用文章标题。
- 同一语言内 `slug` 必须唯一。
- 同一任务线内 `postId` 不得重复，避免一个阅读记录同时结算多个章节。
- 任务线按 `order` 升序排列；`order` 相同时按 `slug` 升序。集合内部键使用 `${lang}:${slug}`，文件名不参与业务排序。
- 页面读取集合后调用 `journeys.ts` 的同一组构建期校验函数；引用失效、语言不匹配、重复 slug 或步骤不足时抛出包含任务线 ID、步骤序号和无效 `postId` 的错误，让构建失败。
- `draft: true` 的任务线同样必须通过 schema 和上述引用校验，但不会出现在任务线页、首页卡片、文章路线导航或首页任务选择中。

新增一条中文示例任务线和一条英文示例任务线，只引用当前已发布文章：

- 中文：`hello-world`、`writing-in-markdown`、`building-this-site`
- 英文：`hello-world.en`、`an-experiment`

Sveltia/Decap CMS 增加 `journeys` 文件夹集合，可直接编辑任务元数据和步骤列表。

### 3.2 进度模型

新增纯函数模块 `src/lib/journeys.ts`：

- 将文章阅读历史映射为步骤状态。
- 文章进度达到 `90%` 即视为该章节完成。
- 生成 `completedCount`、`total`、`nextStep`、`activeStep` 和任务线整体状态。
- `nextStep` 严格取任务线顺序中的第一个未完成章节。
- `activeStep` 取最近有阅读进度且尚未完成的章节；没有这类记录时退回 `nextStep`。
- 任务线状态为：所有章节完成时 `completed`；任一章节进度大于 `0` 但尚未全部完成时 `in-progress`；其余为 `not-started`。
- 选择首页任务时，从未完成任务中优先选择有章节进度大于 `0` 的任务线，并按相关阅读记录的最大 `updatedAt` 从新到旧选择；没有已开始的未完成任务时，选择 `order`、`slug` 排序最靠前的一条。全部完成时选择完成任务时间（已完成章节记录的最大 `updatedAt`）最新的一条；时间相同再按 `order`、`slug` 排序。

进度完全由现有 `readPersonalLibrary()` 历史记录推导，不新增任务进度存储。阅读历史被本地记录上限淘汰后，对应章节可能重新显示为未完成，这是可接受的本地存储权衡。

### 3.3 页面与组件

1. **任务线页面 `/[lang]/quests/`**
   - 展示当前语言全部已发布任务线。
   - 每条任务线显示简介、总进度、章节编号、文章标题和状态。
   - 已完成、进行中、未开始使用不同像素风标记。
   - 服务端先输出稳定的未开始状态，客户端读取本地进度后增强。
   - 无任务线时显示简短空状态。

2. **首页 `QuestTrailCard`**
   - 放在个人书架与最新文章之间，保持单卡紧凑布局。
   - 显示任务线标题、`下一关 / 2 of 3`、下一篇文章和进入按钮。
   - 全部完成时改为完成态，不新增第二张卡片。
   - 当前语言没有任务线时完全不渲染。

3. **文章底部 `QuestRouteNav`**
   - 文章属于一条或多条任务线时，在相关文章区域之前显示路线导航。
   - 显示当前章节、整条路线进度、上一章和下一章。
   - 属于多条任务线时，每条匹配任务线各渲染一个紧凑导航，按 `order`、`slug` 排序，不合并成含混的多路线摘要。
   - 完成后提供进入任务线总览的入口。
   - 不属于任务线时不渲染。

4. **归档入口**
   - 当前语言有已发布任务线时，归档页标题区增加一个紧凑的“任务线”链接，避免新增顶部导航项；没有任务线时不显示该链接。

### 3.4 数据流

1. 构建时加载 `journeys` 和当前语言文章，校验引用并计算静态任务结构。
2. Astro 输出任务线、首页卡片和文章路线导航的稳定语义结构。
3. 客户端从个人书库读取阅读历史，重新计算完成状态与下一关。
4. 监听 `storage` 事件，在其他标签页更新阅读进度时同步刷新任务线状态。

所有任务线链接必须经过 `withBase()` 生成，以同时适配 Cloudflare Pages 与 GitHub Pages 的子路径部署。

## 4. 划线高亮与边注

### 4.1 本地数据模型

新增独立存储键 `yukki-annotations-v1`，不改动个人书库数据：

```ts
interface AnnotationRecord {
  id: string;
  lang: 'zh' | 'en';
  postId: string;
  quote: string;
  note: string;
  start: number;
  end: number;
  prefix: string;
  suffix: string;
  createdAt: number;
  updatedAt: number;
}

interface AnnotationStore {
  records: AnnotationRecord[];
}
```

规范化与限制：

- 损坏 JSON、缺字段、非法语言或时间戳的记录直接丢弃。
- 规范化时先对 `quote` 和 `note` 做首尾去空白；随后要求 `quote` 为 1 至 2000 字符、`note` 为 0 至 1000 字符，`note` 内部换行与空白保留。
- `prefix`、`suffix` 各限制最多 64 字符。
- 总共最多保存 200 条记录，按最近更新时间排序。
- `id`、`postId` 必须为非空字符串；`start`、`end` 必须为非负整数，`end > start`，且 `end - start` 必须等于 `quote.length`；时间戳必须为有限非负数。
- 同一 `id` 去重时保留 `updatedAt` 较新的记录；时间完全相同时保留先出现的记录。之后按 `updatedAt` 倒序截断到 200 条。
- 新建记录优先使用 `crypto.randomUUID()`；不可用时使用 `crypto.getRandomValues()` 与时间戳生成标识，再回退到时间戳加单调计数器。

### 4.2 锚点与恢复

锚点由文本偏移、完整引用、前后各 32 字符上下文组成。这里的字符按 JavaScript 字符串的 UTF-16 code unit 计数；选区先去除首尾空白，再把 `start`、`end` 向内收缩到去空白后的引用边界。恢复顺序：

选区起点、终点和 `quote` 必须从同一份正文文本流计算：把 DOM 选区边界映射到文本流偏移后切出引用，不能使用 `selection.toString()` 充当 `quote`，以免跨段落时的换行表示与偏移不一致。任一边界无法映射到可高亮文本流时，视为无效选区。

1. 若保存的 `start`、`end` 位置仍与 `quote` 完全匹配，直接使用。
2. 搜索 `prefix + quote + suffix`；若有多个命中，选择起点与保存的 `start` 距离最近的一处，距离相同取更靠前的一处。
3. 若 `quote` 在正文中只出现一次，使用该位置。
4. 无法恢复时不删除记录，在摘录面板标记“原文位置已变化”，只提供删除操作。

正文文本使用 `.post-body` 内可高亮文本节点的串联结果计算，排除 `script`、`style`、`button`、`input`、`select`、`textarea`、`svg`、`[data-annotation-ignore]` 和隐藏节点。计算前先移除旧的高亮包裹，确保偏移始终基于原始正文文本。

### 4.3 DOM 渲染

- 使用跨文本节点的 DOM `Range`，把选区拆成一个或多个 `<mark>`。
- 每个 `<mark>` 共享 `data-annotation-id`，首尾片段带不同标记以处理圆角和边注点。
- 渲染前先移除旧 `<mark>` 并合并相邻文本节点，避免重复包裹。
- 新选区与已有高亮重叠时拒绝创建，并显示可访问的状态提示。
- 恢复记录按 `updatedAt` 倒序依次占位；若正文变化导致恢复范围互相重叠，较新的记录渲染高亮，较旧的记录标记为“位置冲突”且只提供删除，避免生成交叉或嵌套的 `<mark>`。
- 所有高亮文本通过 `textContent` 操作，不使用 `innerHTML`。

### 4.4 文章交互

1. **划词工具栏**
   - 只在非折叠的正文选区上出现。
   - 提供“高亮”和“边注”两个按钮。
   - 工具栏使用 `role="toolbar"`，按钮有明确 `aria-label`，移动端位于选区内侧上方。
   - 点击工具栏按钮不清除选区；保存或取消后清除选区。

2. **快速高亮**
   - 点击“高亮”立即保存空备注记录并包裹正文。
   - 使用主题强调色，不提供颜色选择。

3. **边注编辑器**
   - 点击“边注”或已有高亮打开原生 `<dialog>`。
   - 编辑器显示去空白后的摘录预览、备注文本框、保存和删除按钮。
   - 新建边注保存后同时创建高亮；编辑已有高亮可修改备注或删除整条记录。

4. **摘录面板**
   - 文章头部增加紧凑的“摘录 N”按钮，不占用新的正文纵向区块；按钮在客户端确认存储可用后显示，无 JavaScript 时保持隐藏。
   - 点击打开 `<dialog>`：桌面为右侧抽屉，移动端为底部全屏抽屉。
   - 列表按更新时间展示摘录、备注、日期和状态。
   - 点击可恢复的条目会关闭面板、滚动到对应高亮、短暂聚焦并显示脉冲强调。
   - 无法恢复的条目只显示删除操作。
   - 空状态说明如何开始划线。

5. **跨标签页与导航**
   - 监听注解存储键的 `storage` 事件，重新渲染当前文章高亮和计数。
   - 监听 `astro:page-load` 初始化、`astro:before-swap` 清理；切换页面前关闭两个 `<dialog>`、中止事件监听、移除高亮包裹，避免 View Transitions 重复绑定或残留 DOM。

### 4.5 无脚本与失败场景

- 无 JavaScript：正文、任务线与所有导航保持可读；高亮按钮和摘录入口隐藏。
- 存储被禁用：文章正常显示，“摘录 N”入口隐藏；划词工具栏仍可提示“本地存储不可用”，不写入也不抛错。
- 选区超出正文、只选中空白、超过长度或与已有高亮重叠时给出状态消息。
- `localStorage` 配额或写入失败时保留原数据，不产生半条记录，并显示“保存失败”状态。

## 5. 视觉与无障碍

- 延续现有像素边框、等宽小标签、描边和硬阴影，不引入新的视觉体系。
- 任务线使用 `NEXT QUEST`、章节编号、完成勾记和虚线路径；高亮使用主题强调色与柔和背景。
- 深色和浅色主题均保持至少 WCAG AA 文本对比度。
- 所有交互按钮具备至少 44px 触摸区域、可见键盘焦点和屏幕阅读器标签。
- 原生 `<dialog>.showModal()` 负责焦点锁定；关闭后优先回到原触发控件，若该控件已隐藏或随删除消失，则回到“摘录 N”按钮，再回退到正文容器。
- `prefers-reduced-motion` 下移除脉冲、位移和过渡。
- 中英文 UI 文案必须成对新增。

## 6. 组件与模块边界

预计新增：

- `src/content/journeys/build-this-site.zh.json`
- `src/content/journeys/site-notes.en.json`
- `src/lib/journeys.ts`
- `src/lib/annotations.ts`
- `src/components/QuestTrailCard.astro`
- `src/components/QuestRouteNav.astro`
- `src/components/JourneyList.astro`
- `src/components/ArticleAnnotations.astro`
- `src/pages/[lang]/quests.astro`
- `tests/journeys.test.ts`
- `tests/annotations.test.ts`
- `tests/quests-ui.test.ts`
- `tests/annotations-ui.test.ts`

预计修改：

- `src/content.config.ts`
- `src/consts.ts`
- `src/pages/[lang]/index.astro`
- `src/pages/[lang]/archive.astro`
- `src/pages/[lang]/posts/[...id].astro`
- `src/layouts/PostLayout.astro`
- `public/admin/config.yml`
- `scripts/check-frontend.mjs`
- `tests/frontend-readiness.test.ts`
- `scripts/check-content.mjs`

职责边界：

- `journeys.ts` 只接收普通数据并处理任务线排序、引用解析和进度推导，不导入 `astro:content`、不访问 DOM，便于 Vitest 直接覆盖。
- 页面 frontmatter 负责用 `getCollection('journeys')` 和 `getPosts(lang)` 提供数据；集合读取不进入纯函数模块。
- `annotations.ts` 只处理记录规范化、通过注入的 `Storage` 读写、锚点求解和增删改，不访问 DOM。
- Astro 组件负责渲染、选区、Range 和对话框交互。
- 任务线与个人书库通过 `ReadingRecord[]` 只读衔接，不相互写入。

## 7. 测试策略

### 7.1 单元测试

- 任务线排序、草稿过滤、语言隔离、无效引用检测。
- 任务线排序的 `order`/`slug` 决胜、重复 `postId`、重复 slug 和明确错误信息。
- 任务进度边界：`89` 未完成、`90` 完成、无历史、全部完成和跨语言记录；`nextStep`、`activeStep` 与任务线状态。
- 首页下一任务选择策略、最近完成选择和文章章节前后导航。
- 注解存储损坏、字段限制、去重、上限、增删改和写入失败。
- 锚点恢复：去空白偏移、UTF-16 偏移、上下文最近命中、唯一引用、重复引用、无法恢复和恢复后重叠。

### 7.2 集成与静态 UI 测试

- `journeys` collection schema 与 CMS 配置契约一致。
- 首页、任务线页面、文章底部和归档入口正确接入。
- 高亮组件只在正文工作，且不使用 `innerHTML`。
- `<dialog>`、焦点回退、`aria-*`、双语文案和移动端样式存在。
- 禁用 JavaScript 时关键内容仍由服务端输出。
- `scripts/check-frontend.mjs` 把 `zh/quests/index.html` 和 `en/quests/index.html` 列为必需产物，并由 `tests/frontend-readiness.test.ts` 覆盖。

### 7.3 验证命令

- `npm run check`
- `npm test`
- `npm run check:cms-config`
- `npm run check:content`
- `npm run verify:frontend`

浏览器人工验证至少覆盖 320、390、760、761 和 1440px；检查文本选择、跨行/跨段高亮、边注保存、刷新恢复、删除、跨标签页同步、键盘操作、禁用存储和无 JavaScript 场景。

## 8. 验收标准

1. 当前语言存在任务线时，首页显示一个紧凑的下一关卡片；没有任务线时完全不显示。
2. `/[lang]/quests/` 能展示中英文任务线，并根据本地阅读历史更新进度。
3. 任务文章底部正确显示当前章节、前后章节和路线进度。
4. 在正文划词后可以通过工具栏创建高亮或边注。
5. 刷新、返回文章或切换语言后，对应语言和文章的摘录仍能恢复。
6. 摘录面板可以跳回原文、编辑备注和删除记录。
7. 选区重叠、存储禁用、损坏数据和原文变化不会导致页面异常。
8. 无 JavaScript 时任务线页面、首页和文章内容仍可访问。
9. 中英文、深浅主题、键盘操作和响应式布局通过测试与人工检查。

## 9. 风险与取舍

- **DOM 包裹复杂度**：跨节点高亮和 View Transitions 容易产生重复包裹；通过先解除旧标记、重新计算文本节点、重叠拒绝和完整生命周期清理降低风险。
- **本地数据寿命**：浏览器数据清除后任务进度和批注会丢失；这是保持纯静态站点与隐私默认值的明确取舍，不在本次引入同步。
- **原文编辑导致锚点失效**：上下文与唯一引用提供多级回退；仍无法恢复时保留记录并明确标记，避免静默丢失。
- **任务引用耦合**：任务线依赖文章 ID；构建期强校验优先于运行时容错，确保内容错误尽早暴露。
- **纵向空间**：任务卡片保持单行摘要，摘录使用抽屉而非新正文区块，避免挤压既有阅读空间。
