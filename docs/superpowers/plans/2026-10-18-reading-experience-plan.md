# 阅读体验增强（P1）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给文章页补上目录、阅读时长、上下篇、代码复制、图片灯箱、进度条、返回顶部与页面转场，并顺手修正首页联系方式隐私。

**Architecture:** TOC/阅读时长/上下篇在构建期由服务端渲染（`render()` 的 `headings` + `getPosts()` 排序），交互态（高亮、复制、灯箱、进度条、返回顶部）由一个客户端模块脚本处理；不新增依赖。

**Tech Stack:** Astro 7、TypeScript、vitest、Playwright（仅本地验证；不进依赖）。

## Global Constraints

- 零新增运行时/构建依赖；不引第三方 UI 库。
- 所有中英文案放 `src/consts.ts` 的 `UI`（zh/en 各一份），组件不硬编码中文。
- 站内链接必须经 `withBase()`；双 base（`/` 与 `/yukki-rui/`）都要正确。
- 不触碰 Markdown 渲染管线；标题 id 已存在。
- 所有脚本必须兼容 View Transitions：用 `document.addEventListener('astro:page-load', init)`，可重入、不重复绑定。
- 文件路径在 Windows PowerShell 5.1 下操作；不要用 `as any`（astro check 严格模式）。
- 每个任务结束后至少通过 `npx astro check`；涉及构建的再跑 `npm run build`。

---

### Task 1: 阅读时长与 TOC 纯函数

**Files:**
- Create: `src/lib/reading.ts`
- Test: `tests/reading.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ReadingHeading { depth: number; slug: string; text: string }
  export function countReadingMinutes(text: string): number;
  export function selectTocHeadings(headings: readonly ReadingHeading[]): ReadingHeading[];
  export function formatReadingTime(minutes: number, template: string): string;
  ```

- [ ] **Step 1: 写失败测试**

`tests/reading.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  countReadingMinutes,
  formatReadingTime,
  selectTocHeadings,
} from '../src/lib/reading';

describe('countReadingMinutes', () => {
  it('空文本按 1 分钟算', () => {
    expect(countReadingMinutes('')).toBe(1);
  });

  it('300 个汉字约 1 分钟', () => {
    expect(countReadingMinutes('字'.repeat(300))).toBe(1);
    expect(countReadingMinutes('字'.repeat(301))).toBe(2);
  });

  it('200 个英文单词约 1 分钟', () => {
    expect(countReadingMinutes('word '.repeat(200))).toBe(1);
    expect(countReadingMinutes('word '.repeat(201))).toBe(2);
  });

  it('中英混排分别累加', () => {
    // 300 个汉字 = 1 分钟；额外 200 个英文词 = 再 1 分钟
    const text = `${'字'.repeat(300)} ${'word '.repeat(200)}`;
    expect(countReadingMinutes(text)).toBe(2);
  });

  it('标点与代码符号不算英文词', () => {
    expect(countReadingMinutes('---```[](){}'.repeat(50))).toBe(1);
  });
});

describe('selectTocHeadings', () => {
  it('只保留 h2 与 h3', () => {
    const headings = [
      { depth: 1, slug: 'title', text: '标题' },
      { depth: 2, slug: 'a', text: 'A' },
      { depth: 3, slug: 'b', text: 'B' },
      { depth: 4, slug: 'c', text: 'C' },
    ];
    expect(selectTocHeadings(headings)).toEqual([
      { depth: 2, slug: 'a', text: 'A' },
      { depth: 3, slug: 'b', text: 'B' },
    ]);
  });

  it('空数组返回空数组', () => {
    expect(selectTocHeadings([])).toEqual([]);
  });
});

describe('formatReadingTime', () => {
  it('替换模板中的 {minutes}', () => {
    expect(formatReadingTime(3, '约 {minutes} 分钟')).toBe('约 3 分钟');
    expect(formatReadingTime(5, '{minutes} min read')).toBe('5 min read');
  });

  it('没有占位符时原样返回模板', () => {
    expect(formatReadingTime(3, '约 3 分钟')).toBe('约 3 分钟');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/reading.test.ts`
Expected: FAIL，报找不到 `../src/lib/reading`。

- [ ] **Step 3: 写实现**

`src/lib/reading.ts`：

```ts
/** 与 Astro `render()` 返回的 headings 结构一致的最小形状，便于单测构造。 */
export interface ReadingHeading {
  depth: number;
  slug: string;
  text: string;
}

const CJK_CHARS_PER_MINUTE = 300;
const LATIN_WORDS_PER_MINUTE = 200;

// 汉字、假名、谚文都按「一个字符」计
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
// 英文/数字词（允许连字符与撇号），其余符号一律不算
const LATIN_WORD_PATTERN = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

/** 按中文 300 字/分钟、英文 200 词/分钟分别累加，向上取整，至少 1 分钟。 */
export function countReadingMinutes(text: string): number {
  const cjkCount = text.match(CJK_PATTERN)?.length ?? 0;
  const latinCount = text.replace(CJK_PATTERN, ' ').match(LATIN_WORD_PATTERN)?.length ?? 0;
  const minutes = cjkCount / CJK_CHARS_PER_MINUTE + latinCount / LATIN_WORDS_PER_MINUTE;
  return Math.max(1, Math.ceil(minutes));
}

/** 目录只收 h2/h3；h1 是文章标题本身，h4 以下太碎。 */
export function selectTocHeadings(headings: readonly ReadingHeading[]): ReadingHeading[] {
  return headings
    .filter((heading) => heading.depth === 2 || heading.depth === 3)
    .map(({ depth, slug, text }) => ({ depth, slug, text }));
}

/** 把「约 {minutes} 分钟」这类模板替换成实际数字；模板没占位符时原样返回。 */
export function formatReadingTime(minutes: number, template: string): string {
  return template.replace('{minutes}', String(minutes));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/reading.test.ts`
Expected: PASS（5 + 2 + 2 = 9 项）。

- [ ] **Step 5: 跑类型检查**

Run: `npx astro check`
Expected: 0 errors（项目当前 63 files 0 errors）。

- [ ] **Step 6: 提交**

```bash
git add src/lib/reading.ts tests/reading.test.ts
git commit -m "feat(reading): 阅读时长与目录层级纯函数及单测"
```

---

### Task 2: TOC 与上一篇/下一篇组件

**Files:**
- Create: `src/components/PostToc.astro`
- Create: `src/components/PostNav.astro`
- Depends on: Task 1 的 `ReadingHeading` 类型；`src/consts.ts` 新增文案（由 Task 4 统一添加，实现时可先按接口里的键名引用，若不存在则本任务先不要读 UI，接受 `label` props）

**Interfaces:**
- Consumes: `ReadingHeading`（`src/lib/reading.ts`）
- Produces:
  ```
  PostToc.astro props: {
    headings: ReadingHeading[];
    lang: 'zh' | 'en';
    variant: 'aside' | 'inline';
    label: string;      // 「目录」/「On this page」
  }
  PostNav.astro props: {
    prev: { href: string; title: string; date: string } | null;
    next: { href: string; title: string; date: string } | null;
    prevLabel: string;  // 「上一篇」
    nextLabel: string;  // 「下一篇」
  }
  ```
- 约定：`headings.length < 2` 时 PostToc 返回 null（只有一节不值得做目录）。

- [ ] **Step 1: 写 PostToc.astro**

要求：
- `variant="aside"`：`<aside class="post-toc post-toc--aside" data-post-toc><p class="post-toc__label">{label}</p><nav aria-label={label}><ol>…</ol></nav></aside>`
- `variant="inline"`：`<details class="post-toc post-toc--inline" data-post-toc><summary>{label}</summary><nav aria-label={label}><ol>…</ol></nav></details>`
- 每项：`<li class:list={['post-toc__item', `post-toc__item--h${heading.depth}`]}><a href={`#${heading.slug}`}>{heading.text}</a></li>`
- 样式 scoped：最大宽度、`--text-dim`、hover 用 `--accent`、当前项 `.is-active { color: var(--accent); }`；aside 版 `position: sticky; top: calc(var(--px) + 24px); max-height: 70vh; overflow: auto;`

- [ ] **Step 2: 写 PostNav.astro**

要求：
- 两个卡片 `<a class="post-nav__card" rel="prev">` / `rel="next"`，空的用 `<span class="post-nav__card post-nav__card--empty">` 占位保持栅格。
- 卡片内容：上标签（prevLabel / nextLabel）、标题、日期（小字 `--text-dim`）。
- 无链接时整个 nav 不渲染（prev 和 next 都为 null 时返回 null）。

- [ ] **Step 3: 类型检查**

Run: `npx astro check`
Expected: 0 errors。

- [ ] **Step 4: 提交**

```bash
git add src/components/PostToc.astro src/components/PostNav.astro
git commit -m "feat(reading): 文章目录与上一篇/下一篇组件"
```

---

### Task 3: 客户端增强（PostExtras）

**Files:**
- Create: `src/components/PostExtras.astro`

**Interfaces:**
- Produces props: `{ lang: 'zh' | 'en'; copyLabel: string; copiedLabel: string; copyFailedLabel: string; backToTopLabel: string }`
- DOM 契约（Task 4 与测试依赖）：
  - `<div class="reading-progress" data-reading-progress aria-hidden="true"><span></span></div>`
  - `<button class="back-to-top" data-back-to-top type="button" hidden>{backToTopLabel}</button>`
  - 代码复制按钮：`.code-copy`、`data-code-copy`、`aria-label={copyLabel}`
  - 灯箱：`.img-lightbox`、`data-img-lightbox`、`role="dialog"`、`aria-modal="true"`

- [ ] **Step 1: 写组件框架**

```astro
---
import type { Lang } from '../consts';

interface Props {
  lang: Lang;
  copyLabel: string;
  copiedLabel: string;
  copyFailedLabel: string;
  backToTopLabel: string;
}
const { lang, copyLabel, copiedLabel, copyFailedLabel, backToTopLabel } = Astro.props;
---
<div class="reading-progress" data-reading-progress aria-hidden="true"><span></span></div>
<button class="back-to-top" data-back-to-top type="button" aria-label={backToTopLabel} hidden>
  {backToTopLabel}
</button>
<script>
  // 实现在下面几步；要点：init() 可重入，先清理旧监听（用 AbortController）
</script>
```

- [ ] **Step 2: 实现 init()**

要求（单个模块脚本）：
1. `let controller: AbortController | null = null; function init() { controller?.abort(); controller = new AbortController(); const signal = controller.signal; … }`
2. 进度条：`window.addEventListener('scroll', updateProgress, { signal, passive: true })`，`document.documentElement.scrollHeight - window.innerHeight` 为 0 时进度 0。
3. 返回顶部：滚动 > 600 时 `hidden = false`；点击 `window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })`。
4. TOC 高亮：`const links = [...document.querySelectorAll('[data-post-toc] a[href^="#"]')]`，按 `decodeURIComponent(hash)` 建 map；`IntersectionObserver` 观察 `.post-body h2[id], .post-body h3[id]`，取「已进入视口且最靠上的」标题设置 `.is-active`；无 IntersectionObserver 时跳过。
5. 代码复制：对每个 `.post-body pre` 若未加过按钮，插入 `<button type="button" class="code-copy" data-code-copy aria-label={copyLabel}>`（title 用 `pre.dataset.language`，如 `js`）；点击后 `navigator.clipboard.writeText(pre.innerText)`，成功文案换为 copiedLabel，2 秒后复原；失败换 copyFailedLabel。`pre.style.position = 'relative'`（若 CSS 不便定位，可改用 wrapper）。
6. 灯箱：点击 `.post-body img` → 创建 `<div class="img-lightbox" data-img-lightbox role="dialog" aria-modal="true"><button class="img-lightbox__close" aria-label="关闭">×</button><img src=… alt=…></div>` 追加到 body；Esc/点遮罩/点关闭按钮关闭；关闭后焦点还回原图（`img.focus()`，img 加 `tabindex="0"`）。
7. `document.addEventListener('astro:page-load', init, { once: true })` **不要用** —— 要每次转场都跑，所以：

```ts
const start = () => { if (document.querySelector('[data-reading-progress]')) init(); };
document.addEventListener('astro:page-load', start);
if (document.readyState !== 'loading') start();
```

8. 所有样式写在组件 `<style>` 里；灯箱样式用 `:global(.img-lightbox)`（因为节点是运行时插到 body 的）。

- [ ] **Step 3: 类型检查 + 提交**

Run: `npx astro check`
Expected: 0 errors。

```bash
git add src/components/PostExtras.astro
git commit -m "feat(reading): 进度条、代码复制、图片灯箱与返回顶部"
```

---

### Task 4: 接线（PostLayout / 文章页 / BaseLayout / Comments）

**Files:**
- Modify: `src/consts.ts`（UI 加键）
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/pages/[lang]/posts/[...id].astro`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/components/Comments.astro`（`astro:page-load` 兼容）

- [ ] **Step 1: UI 文案键**

zh：`toc: '目录'`、`prevPost: '上一篇'`、`nextPost: '下一篇'`、`readingTime: '约 {minutes} 分钟'`、`copyCode: '复制'`、`copiedCode: '已复制'`、`copyFailed: '复制失败'`、`backToTop: '返回顶部'`、`closeLightbox: '关闭'`
en：`toc: 'On this page'`、`prevPost: 'Previous'`、`nextPost: 'Next'`、`readingTime: '{minutes} min read'`、`copyCode: 'Copy'`、`copiedCode: 'Copied'`、`copyFailed: 'Copy failed'`、`backToTop: 'Back to top'`、`closeLightbox: 'Close'`

- [ ] **Step 2: PostLayout 两栏布局**

```astro
<BaseLayout …>
  <article class="prose rise post">
    <PostExtras lang={lang} copyLabel={t.copyCode} copiedLabel={t.copiedCode}
      copyFailedLabel={t.copyFailed} backToTopLabel={t.backToTop} />
    <header>…（meta 行追加 formatReadingTime(minutes, t.readingTime)）</header>
    <PostToc headings={headings} lang={lang} variant="inline" label={t.toc} />
    <div class="post-layout">
      <div class="post-body"><slot /></div>
      <PostToc headings={headings} lang={lang} variant="aside" label={t.toc} />
    </div>
    <PostNav … />
    <Comments lang={lang} />
  </article>
</BaseLayout>
```
CSS：`.post-layout { display: grid; gap: 32px; } @media (min-width: 1024px) { .post-layout { grid-template-columns: minmax(0,1fr) 220px; } .post-toc--inline { display: none; } } @media (max-width: 1023px) { .post-toc--aside { display: none; } }`

- [ ] **Step 3: 文章页传数据**

```ts
const { Content, headings } = await render(post);
const list = await getPosts(post.data.lang);
const index = list.findIndex((entry) => entry.id === post.id);
const newer = index > 0 ? list[index - 1] : undefined;
const older = index >= 0 && index < list.length - 1 ? list[index + 1] : undefined;
const toNav = (entry: Post | undefined) => entry ? {
  href: withBase(postHref(entry.data.lang, entry.id)),
  title: entry.data.title,
  date: dateFmt.format(entry.data.pubDate),
} : null;
```

- [ ] **Step 4: BaseLayout 加 `<ClientRouter />`**

```astro
import { ClientRouter } from 'astro:transitions';
…
<head><ClientRouter />…</head>
```

- [ ] **Step 5: Comments.astro 兼容转场**

把顶层自动执行的初始化包成 `function initComments()`，末尾改为：

```ts
initComments();
document.addEventListener('astro:page-load', initComments);
```
并确保内部查询失败时安全返回（`if (!root) return;`）。

- [ ] **Step 6: 审计其他脚本**

`grep -rn "<script" src/`，对 ThemeToggle、NoteRain、BaseLayout 内联主题脚本逐个确认：转场后是否仍需执行；需要则挂 `astro:page-load`，不需要（纯 CSS/一次即可）就不动。主题脚本必须保证 `astro:after-swap` 后 `documentElement.dataset.theme` 不丢（html 元素跨转场保留，通常无需处理，实测确认）。

- [ ] **Step 7: 门禁**

Run: `npx astro check`；`npx vitest run`；`npm run build`
Expected: 0 errors、全部测试通过、构建成功且文章页 HTML 含 `data-reading-progress`、`post-toc`、`rel="prev"`、`约 N 分钟`。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat(reading): 文章页接入目录、阅读时长、上下篇与转场"
```

---

### Task 5: 隐私修正、文档与上线验证

**Files:**
- Modify: `src/content/site/home.zh.json`、`src/content/site/home.en.json`
- Modify: `docs/usage-guide.md`（新增「读文章时的小工具」一节）
- Modify: `docs/verification-report.md`（新增本轮章节）

- [ ] **Step 1: 隐私修正**：`contact.text` 改为「想联系我？在文章下面留言，或者去 X 找我。」/「Want to get in touch? Leave a comment under a post, or find me on X.」；删除 QQ 与微信。

- [ ] **Step 2: 文档**：usage-guide 面向站长的说明（目录/复制/灯箱/上下篇是什么、移动端怎么折叠、转场关掉的方法）；verification-report 记录本轮改动与验证数据。

- [ ] **Step 3: 全门禁**

```powershell
$env:CMS_OAUTH_CHROME='C:/Users/asus/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'
npm run verify:frontend
npm run check:cms-config
npm run check:cms-oauth
npm run check:comments
```
Expected: 全部通过（23 页双 base、6/6、13/13、28/28）。

- [ ] **Step 4: 本地浏览器实测**：写 `.cms-setup/check-reading.mjs`，对 `dist` 起静态服务，用 Playwright 断言：TOC 存在且可点、滚动后高亮切换、代码块有复制按钮、灯箱能开能关、返回顶部出现、转场到另一篇文章后评论区表单仍可用且无脚本异常。截图存档 `.cms-setup/shots/`。

- [ ] **Step 5: 推送与线上抽检**：`git push`，等两个平台部署完成，线上用同样脚本对 `https://yukki-rui.pages.dev` 与 GitHub Pages 各抽检一遍；`npm run check:comments-live` 必过。

- [ ] **Step 6: 提交文档**

```bash
git add -A
git commit -m "docs(reading): 阅读体验说明与验证记录，修正首页联系方式隐私"
```

---

## Self-Review

- 覆盖检查：设计文档 9 项 → Task 1（时长/TOC 数据）、Task 2（TOC/上下篇渲染）、Task 3（复制/灯箱/进度条/返回顶部）、Task 4（接线 + 转场）、Task 5（隐私/文档/验收）。无缺口。
- 占位符扫描：无 TBD/TODO；Task 4 的改动以代码片段与明确文件为准。
- 类型一致性：`ReadingHeading` 在 Task 1 定义、Task 2 消费；`NavItem` 形状在 Task 2 props 与 Task 4 `toNav()` 中一致。
