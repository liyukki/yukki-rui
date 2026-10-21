# B 类(阅读设置 + 相关文章推荐)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让读者能调节正文的字号/行高/宽度,并在文章底部看到基于标签重合度的相关文章推荐。

**Architecture:** 两个功能互不依赖。阅读设置是纯前端 + CSS 变量,B1 新增独立组件与纯函数配置层;相关文章推荐是构建期纯函数 + 布局渲染,B2 不引入任何服务端。

**Tech Stack:** Astro 7、CSS 自定义属性、`localStorage`、Vitest。

## Global Constraints

- 依赖:不新增任何 npm 依赖。
- `localStorage` 键名固定:`reading-settings`(与现有 `theme`/`lang` 并列)。
- 正文变量与标题像素字体变量必须分离,调字号不得改变标题字体尺寸。
- 尊重 `prefers-reduced-motion`;不覆盖现有 `:focus-visible` 与 44px 触达尺寸规则。
- 推荐区块必须带 `data-pagefind-ignore`,不得进入搜索索引。

---

### Task B1: 阅读设置

**Files:**
- Create: `src/lib/reading-settings.ts`
- Create: `src/components/ReadingSettings.astro`
- Create: `tests/reading-settings.test.ts`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`
- Modify: `src/consts.ts`
- Modify: `scripts/check-reading.mjs`

**Interfaces:**
- Produces: `export interface ReadingSettings { size: 'sm'|'md'|'lg'; line: 'tight'|'normal'|'loose'; width: 'narrow'|'normal'|'wide' }`
- Produces: `export const READING_DEFAULTS: ReadingSettings`
- Produces: `export function normalizeReadingSettings(input: unknown): ReadingSettings`
- Produces: `export function readReadingSettings(storage: Pick<Storage,'getItem'> | null | undefined): ReadingSettings`
- Produces: `export function applyReadingSettings(root: HTMLElement, settings: ReadingSettings): void`

- [ ] **Step 1: 写失败测试**

新建 `tests/reading-settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  READING_DEFAULTS,
  normalizeReadingSettings,
  readReadingSettings,
} from '../src/lib/reading-settings';

describe('normalizeReadingSettings', () => {
  it('空值返回默认值', () => {
    expect(normalizeReadingSettings(null)).toEqual(READING_DEFAULTS);
    expect(normalizeReadingSettings(undefined)).toEqual(READING_DEFAULTS);
    expect(normalizeReadingSettings({})).toEqual(READING_DEFAULTS);
  });

  it('保留合法值', () => {
    expect(normalizeReadingSettings({ size: 'lg', line: 'tight', width: 'wide' })).toEqual({
      size: 'lg', line: 'tight', width: 'wide',
    });
  });

  it('非法值逐项退回默认,不影响其他项', () => {
    expect(normalizeReadingSettings({ size: 'huge', line: 'loose', width: 12 })).toEqual({
      size: READING_DEFAULTS.size, line: 'loose', width: READING_DEFAULTS.width,
    });
  });
});

describe('readReadingSettings', () => {
  it('storage 为空时返回默认值', () => {
    expect(readReadingSettings(null)).toEqual(READING_DEFAULTS);
  });

  it('storage 抛错时返回默认值(隐私模式)', () => {
    const storage = { getItem() { throw new Error('blocked'); } };
    expect(readReadingSettings(storage)).toEqual(READING_DEFAULTS);
  });

  it('解析 JSON 失败时返回默认值', () => {
    const storage = { getItem: () => '{not json' };
    expect(readReadingSettings(storage)).toEqual(READING_DEFAULTS);
  });

  it('读取已保存的合法设置', () => {
    const storage = { getItem: () => JSON.stringify({ size: 'sm', line: 'tight', width: 'narrow' }) };
    expect(readReadingSettings(storage)).toEqual({ size: 'sm', line: 'tight', width: 'narrow' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/reading-settings.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现配置层**

新建 `src/lib/reading-settings.ts`:

```ts
export interface ReadingSettings {
  size: 'sm' | 'md' | 'lg';
  line: 'tight' | 'normal' | 'loose';
  width: 'narrow' | 'normal' | 'wide';
}

export const READING_DEFAULTS: ReadingSettings = { size: 'md', line: 'normal', width: 'normal' };

export const READING_STORAGE_KEY = 'reading-settings';

const SIZES = ['sm', 'md', 'lg'] as const;
const LINES = ['tight', 'normal', 'loose'] as const;
const WIDTHS = ['narrow', 'normal', 'wide'] as const;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function normalizeReadingSettings(input: unknown): ReadingSettings {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    size: pick(record.size, SIZES, READING_DEFAULTS.size),
    line: pick(record.line, LINES, READING_DEFAULTS.line),
    width: pick(record.width, WIDTHS, READING_DEFAULTS.width),
  };
}

export function readReadingSettings(storage: Pick<Storage, 'getItem'> | null | undefined): ReadingSettings {
  if (!storage) return { ...READING_DEFAULTS };
  try {
    return normalizeReadingSettings(JSON.parse(storage.getItem(READING_STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...READING_DEFAULTS };
  }
}

export function applyReadingSettings(root: HTMLElement, settings: ReadingSettings): void {
  root.dataset.readingSize = settings.size;
  root.dataset.readingLine = settings.line;
  root.dataset.readingWidth = settings.width;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/reading-settings.test.ts`
Expected: PASS。

- [ ] **Step 5: CSS 变量接入**

`src/styles/tokens.css` 增加可由 `data-*` 覆盖的正文变量(保留 `--fs-body` 作为默认值,不动标题的像素字体变量):

```css
:root {
  --reading-size: var(--fs-body);
  --reading-line: 1.8;
  --reading-width: var(--maxw);
}

:root[data-reading-size='sm'] { --reading-size: 0.9375rem; }
:root[data-reading-size='lg'] { --reading-size: 1.125rem; }
:root[data-reading-line='tight'] { --reading-line: 1.6; }
:root[data-reading-line='loose'] { --reading-line: 2; }
:root[data-reading-width='narrow'] { --reading-width: 60ch; }
:root[data-reading-width='wide'] { --reading-width: 88ch; }
```

`src/styles/global.css`:正文容器(文章正文与评论正文之外的 `.prose` 类或当前承载正文的类)改用 `var(--reading-size)`、`var(--reading-line)`、`var(--reading-width)`。**不得**改 `--font-pixel` 与标题 `font-size`。

- [ ] **Step 6: `<head>` 内联恢复,避免闪烁**

`src/layouts/BaseLayout.astro` 在现有主题初始化内联脚本之后追加一段同样风格的最小脚本(直接操作 `document.documentElement`,不引模块):

```html
<script is:inline>
  (function () {
    try {
      var s = JSON.parse(localStorage.getItem('reading-settings') || 'null') || {};
      var pick = function (v, ok, fb) { return ok.indexOf(v) >= 0 ? v : fb; };
      var root = document.documentElement;
      root.dataset.readingSize = pick(s.size, ['sm', 'md', 'lg'], 'md');
      root.dataset.readingLine = pick(s.line, ['tight', 'normal', 'loose'], 'normal');
      root.dataset.readingWidth = pick(s.width, ['narrow', 'normal', 'wide'], 'normal');
    } catch (e) { /* 隐私模式忽略 */ }
  })();
</script>
```

- [ ] **Step 7: 控件组件**

新建 `src/components/ReadingSettings.astro`:三组 `button`(字号/行高/宽度),初始 `aria-pressed` 由 `readReadingSettings` 决定,点击后 `applyReadingSettings` + `localStorage.setItem`。容器加 `data-pagefind-ignore`,每档按钮保留至少 44px 触达高度,颜色与边框沿用 `var(--card)` / `var(--line)` / `var(--accent)`。

在 `src/layouts/PostLayout.astro` 的文章工具区(与 `PostToc` 同级)挂载 `<ReadingSettings />`,只在文章页出现。

- [ ] **Step 8: 文案**

`src/consts.ts` 的 `UI.zh` 与 `UI.en` 各加:`readingSettings`(标题)、`readingSize` / `readingLine` / `readingWidth`(分组标签)与六档名称。保持两语言键完全对称。

- [ ] **Step 9: 端到端自检**

`scripts/check-reading.mjs` 增加:设置字号为 `lg` → 刷新 → `documentElement.dataset.readingSize === 'lg'`;View Transitions 换页后设置仍生效;390px 无横向溢出。

- [ ] **Step 10: 提交**

```
git add src/lib/reading-settings.ts src/components/ReadingSettings.astro tests/reading-settings.test.ts src/layouts/BaseLayout.astro src/layouts/PostLayout.astro src/styles/tokens.css src/styles/global.css src/consts.ts scripts/check-reading.mjs
git commit -m "feat(reading): 字号/行高/宽度阅读设置"
```

---

### Task B2: 相关文章推荐

**Files:**
- Create: `src/lib/related.ts`
- Create: `tests/related.test.ts`
- Modify: `src/pages/[lang]/posts/[...id].astro`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/consts.ts`
- Modify: `scripts/check-reading.mjs`

**Interfaces:**
- Consumes: `PostLike = { id: string; data: PostData }`(来自 `src/lib/post-select.ts`)
- Produces: `export function selectRelatedPosts<T extends PostLike>(target: T, entries: readonly T[], limit?: number): T[]`

- [ ] **Step 1: 写失败测试**

新建 `tests/related.test.ts`,复用 `tests/post-select.test.ts` 里的 `post()` 工厂写法(把工厂复制过来,不要跨文件 import 测试):

```ts
import { describe, expect, it } from 'vitest';
import { selectRelatedPosts } from '../src/lib/related';
import type { PostLike } from '../src/lib/post-select';

function post(overrides: Partial<PostLike['data']> & { id: string }): PostLike {
  const { id, ...data } = overrides;
  return {
    id,
    data: {
      title: id, description: 'desc', pubDate: new Date('2026-01-01'),
      lang: 'zh', tags: [], draft: false, featured: false, ...data,
    },
  };
}

it('按标签重合数排序', () => {
  const target = post({ id: 't', tags: ['a', 'b'] });
  const list = [target, post({ id: 'one', tags: ['a'] }), post({ id: 'two', tags: ['a', 'b'] })];
  expect(selectRelatedPosts(target, list).map((p) => p.id)).toEqual(['two', 'one']);
});

it('排除自己、排除草稿、排除其他语言', () => {
  const target = post({ id: 't', tags: ['a'] });
  const list = [
    target,
    post({ id: 'draft', tags: ['a'], draft: true }),
    post({ id: 'en', tags: ['a'], lang: 'en' }),
    post({ id: 'ok', tags: ['a'] }),
  ];
  expect(selectRelatedPosts(target, list).map((p) => p.id)).toEqual(['ok']);
});

it('零重合不返回任何文章', () => {
  const target = post({ id: 't', tags: ['a'] });
  expect(selectRelatedPosts(target, [target, post({ id: 'other', tags: ['z'] })])).toEqual([]);
});

it('目标无标签时返回空数组', () => {
  const target = post({ id: 't', tags: [] });
  expect(selectRelatedPosts(target, [target, post({ id: 'other', tags: ['a'] })])).toEqual([]);
});

it('重合数相同按发布日期倒序,再按 id 升序', () => {
  const target = post({ id: 't', tags: ['a'] });
  const list = [
    target,
    post({ id: 'b', tags: ['a'], pubDate: new Date('2026-01-01') }),
    post({ id: 'a', tags: ['a'], pubDate: new Date('2026-01-01') }),
    post({ id: 'new', tags: ['a'], pubDate: new Date('2026-03-01') }),
  ];
  expect(selectRelatedPosts(target, list).map((p) => p.id)).toEqual(['new', 'a', 'b']);
});

it('默认最多 3 篇', () => {
  const target = post({ id: 't', tags: ['a'] });
  const list = [target, ...[1, 2, 3, 4].map((n) => post({ id: `p${n}`, tags: ['a'] }))];
  expect(selectRelatedPosts(target, list)).toHaveLength(3);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/related.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现纯函数**

新建 `src/lib/related.ts`:

```ts
import type { PostLike } from './post-select';

/**
 * 相关文章:同语言已发布、与目标至少共享一个标签。
 * 排序 = 重合标签数倒序 → 发布日期倒序 → id 升序(保证构建结果确定性)。
 */
export function selectRelatedPosts<T extends PostLike>(
  target: T,
  entries: readonly T[],
  limit = 3,
): T[] {
  const targetTags = new Set(target.data.tags);
  if (targetTags.size === 0) return [];

  return entries
    .filter((entry) =>
      entry.id !== target.id
      && entry.data.lang === target.data.lang
      && !entry.data.draft
      && entry.data.tags.some((tag) => targetTags.has(tag)),
    )
    .map((entry) => ({
      entry,
      overlap: entry.data.tags.filter((tag) => targetTags.has(tag)).length,
    }))
    .sort((a, b) =>
      b.overlap - a.overlap
      || b.entry.data.pubDate.getTime() - a.entry.data.pubDate.getTime()
      || a.entry.id.localeCompare(b.entry.id),
    )
    .slice(0, Math.max(0, limit))
    .map((item) => item.entry);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/related.test.ts`
Expected: PASS。

- [ ] **Step 5: 文章页传入推荐**

`src/pages/[lang]/posts/[...id].astro`:复用已有的 `siblings`(`await getPosts(post.data.lang)`,已是生产过滤后的列表),计算:

```ts
const related = selectRelatedPosts(post, siblings);
```

把 `related` 作为 prop 传给 `PostLayout`。

- [ ] **Step 6: 布局渲染**

`src/layouts/PostLayout.astro` 在 `PostNav` 之前渲染推荐区块(仅当 `related.length > 0`):

```astro
{related.length > 0 && (
  <section class="post-related" data-pagefind-ignore aria-labelledby="related-title">
    <h2 id="related-title">{t.relatedPosts}</h2>
    <ul>
      {related.map((item) => (
        <li>
          <a href={withBase(`${item.data.lang}/posts/${item.id}/`)}>{item.data.title}</a>
          <p>{item.data.description}</p>
        </li>
      ))}
    </ul>
  </section>
)}
```

样式沿用现有卡片变量(`var(--card)`、`var(--line)`、`var(--radius)`、`var(--card-edge)`),窄屏单列。

- [ ] **Step 7: 文案**

`src/consts.ts` 的 `UI.zh` 加 `relatedPosts: '相关文章'`,`UI.en` 加 `relatedPosts: 'Related posts'`。

- [ ] **Step 8: 端到端自检**

`scripts/check-reading.mjs` 增加:文章页存在 `.post-related`;区块内不含文章自身链接;390px 无横向溢出;该区块带 `data-pagefind-ignore`。

- [ ] **Step 9: 提交**

```
git add src/lib/related.ts tests/related.test.ts "src/pages/[lang]/posts/[...id].astro" src/layouts/PostLayout.astro src/consts.ts scripts/check-reading.mjs
git commit -m "feat(reading): 基于标签重合的相关文章推荐"
```
