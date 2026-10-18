# 阅读体验增强（P1）设计

日期：2026-10-18 · 状态：已与站长确认方向，待实现

## 背景

站点已有内容（7 篇文章）、双语、双平台部署、Sveltia 后台与评论区。读者侧的阅读体验仍是「一篇文章从头滚到尾」：没有目录、没有上下篇、不能复制代码、图片不能放大、长文没有进度感。站长批准了 A/B/C/D 四组改进，本文是其中的 A 组（P1）。

## 目标

在不新增运行时依赖的前提下，把文章页补成「读起来顺手」的页面：

1. 文章目录（TOC）：桌面右侧粘性栏，移动端折叠在正文上方，滚动时高亮当前小节。
2. 阅读进度条：顶部细线。
3. 阅读时长：标题下 meta 行显示「约 N 分钟」。
4. 上一篇 / 下一篇：同语言按发布时间倒序，文末两张卡片。
5. 代码块复制按钮（带语言标签）。
6. 图片灯箱：正文图片点击放大，Esc / 点遮罩关闭。
7. 返回顶部按钮。
8. 页面切换转场（Astro View Transitions）。
9. 隐私修正：首页联系方式去掉 QQ 号与微信号。

## 非目标

- 不做评论回复/楼中楼、搜索、归档、相关文章（属 P2/P3/P4）。
- 不改 Markdown 渲染管线（标题已有 id）。
- 不引入第三方 UI 库或图标库。

## 关键决策

**方案 A：构建期渲染 + 轻量客户端增强。** TOC、阅读时长、上下篇在构建期由服务端渲染，无 JS 也完整；只有进度条、滚动高亮、复制、灯箱、返回顶部这些「交互态」用客户端脚本。相比纯客户端方案，首屏不闪、SEO 友好；相比引第三方库，零新增依赖、易回滚。

**标题 id 已存在**：构建产物里是 `<h2 id="基本语法">`，TOC 直接读锚点，不需要 rehype 插件。

**上下篇语义**：列表按发布日期倒序，所以「下一篇」= 更新的文章、「上一篇」= 更早的文章（与常见博客一致）。

**隐私修正**：把 `home.zh.json` / `home.en.json` 的 `contact.text` 从 QQ/微信改为「想联系我？在文章下面留言，或者去 X 找我。」，`links` 里的 X 链接保留。评论功能已上线，留言就是现成的联系渠道。

## 架构与文件职责

| 文件 | 职责 | 状态 |
|---|---|---|
| `src/lib/reading.ts` | 纯函数：阅读时长计算、TOC 层级筛选、阅读时长文案格式化 | 新增 |
| `tests/reading.test.ts` | 上述纯函数的单元测试 | 新增 |
| `src/components/PostToc.astro` | 渲染 TOC（`variant="aside"` 桌面栏 / `variant="inline"` 移动折叠） | 新增 |
| `src/components/PostNav.astro` | 渲染上一篇/下一篇卡片 | 新增 |
| `src/components/PostExtras.astro` | 客户端增强：进度条、TOC 高亮、代码复制、灯箱、返回顶部 | 新增 |
| `src/layouts/PostLayout.astro` | 两栏布局、阅读时长、挂载 TOC/Nav/Extras | 修改 |
| `src/pages/[lang]/posts/[...id].astro` | 传 `headings`、上一篇/下一篇数据 | 修改 |
| `src/layouts/BaseLayout.astro` | 挂 `<ClientRouter />` | 修改 |
| `src/components/Comments.astro` | 初始化改为 `astro:page-load` 兼容（转场后评论仍可用） | 修改 |
| `src/consts.ts` | 新增中英文案（目录、上下篇、复制、已复制、返回顶部、阅读时长模板） | 修改 |
| `src/content/site/home.zh.json`、`home.en.json` | 联系方式隐私 | 修改 |
| `docs/usage-guide.md` | 新增「读文章时的小工具」说明 | 修改 |

### 接口

```ts
// src/lib/reading.ts
export interface ReadingHeading { depth: number; slug: string; text: string }
export function countReadingMinutes(text: string): number;        // 至少 1
export function selectTocHeadings(headings: readonly ReadingHeading[]): ReadingHeading[]; // 只留 depth 2/3，按原顺序
export function formatReadingTime(minutes: number, template: string): string; // 模板里的 {minutes} 替换

// PostToc.astro  props: { headings: TocHeading[]; lang: Lang; variant: 'aside' | 'inline' }
// PostNav.astro  props: { lang: Lang; prev: NavItem | null; next: NavItem | null }
//   NavItem = { href: string; title: string; date: string }
// PostExtras.astro props: { lang: Lang }
```

### 数据流

1. `[...id].astro` 调 `render(post)` 拿到 `headings` → `selectTocHeadings()` → 传给 PostLayout → PostToc。
2. 同页调 `getPosts(post.data.lang)` 找到当前文章下标，取前一条（更新）与后一条（更早）→ 传给 PostLayout → PostNav。
3. 阅读时长：用 `post.body`（原始 Markdown）算分钟数，传文案给 PostLayout。
4. 客户端脚本只读 DOM（`.post-body h2/h3[id]`、`.post-body pre`、`.post-body img`），不依赖服务端注入数据。

## 无障碍与降级

- 无 JS：TOC、阅读时长、上下篇仍然完整（服务端渲染）；进度条、复制、灯箱、返回顶部只是没有。
- 按钮均有 `aria-label` 与中文可见文案；灯箱是 `role="dialog"` + `aria-modal="true"`，打开时焦点移入、关闭后焦点还原。
- 复制失败（剪贴板权限）时按钮显示「复制失败」，不抛异常。
- 尊重 `prefers-reduced-motion`：转场动画与平滑滚动在该偏好下关闭。

## 兼容与回滚

- `<ClientRouter />` 是唯一有回归风险的改动：现有组件里的 `<script>` 若一次性执行，转场后会失效。实现时逐个审计（Comments、ThemeToggle、BaseLayout 内联主题脚本），统一改为 `astro:page-load` 可重入。若无法稳定，把第 8 项单独回滚（删一行 import 与标签），其余 8 项不受影响。
- 所有新增样式限定在文章页作用域内，不影响首页/标签页/关于页。

## 测试策略

- 单元测试：阅读时长（纯中文、纯英文、中英混排、空正文、超长）、TOC 层级筛选（h1 排除、h2/h3 保留、空数组）。
- 构建产物断言：文章页含 `aria-label="文章目录"`、`约 N 分钟`、`rel="prev"`/`rel="next"`、`data-reading-progress`。
- 浏览器实测（本机 + 线上）：滚动高亮、移动端折叠、复制按钮、灯箱开关、返回顶部、页面转场后评论区仍可提交、主题切换后不闪回。
- 现有门禁：`npx astro check`、`npx vitest run`、`npm run verify:frontend`（双 base 无死链）、`check:cms-config`、`check:cms-oauth`、`check:comments`。

## 风险

1. View Transitions 与现有脚本的兼容（见上）。
2. TOC 在超长文章里高亮抖动（IntersectionObserver 阈值需调，取「顶部 20% 内最靠上的标题」）。
3. 灯箱在移动端与原生手势冲突（只做简单放大，不做捏合缩放）。
