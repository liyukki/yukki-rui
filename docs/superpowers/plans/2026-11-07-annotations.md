# Article Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add private, local-only article text highlights, notes, excerpt inspection, anchor recovery, and accessible dialogs without changing the existing personal-library storage.

**Architecture:** Keep `src/lib/annotations.ts` DOM-free: it normalizes records, performs storage I/O through an injected `Storage`, resolves saved anchors against an injected text stream, and merges overlapping restores. The Astro component owns selection mapping, Range-based `<mark>` rendering, local storage state, dialogs, and View Transitions cleanup.

**Tech Stack:** Astro 7, TypeScript, Vitest, native DOM `Range`, native `<dialog>`, existing CSS tokens.

## Global Constraints

- Use the independent storage key `yukki-annotations-v1`; never modify `yukki-personal-library-v1`.
- Offsets are JavaScript UTF-16 code unit offsets into the `.post-body` text stream.
- Build a quote by slicing the same text stream used for offsets; never use `selection.toString()` as the quote.
- Trim the quote and note boundaries before validation. Quote length is `1..2000`; note length is `0..1000`; prefix/suffix are at most 64 code units.
- Keep at most 200 records, newest `updatedAt` first, deduplicated by `id`.
- Restore order is exact offset, nearest context match, unique quote, then mark as unavailable. Do not delete unresolved records.
- When restored ranges overlap, the newer record wins and older records are marked as conflicts with delete-only actions.
- Render highlights with DOM `Range` and `<mark>`; never assign article/local data through `innerHTML`.
- Use native `<dialog>.showModal()` for the excerpt drawer/editor and preserve keyboard focus behavior.
- Every new Chinese UI string has a paired English string.
- `prefers-reduced-motion` removes pulses and movement.
- Do not add a backend, account system, client framework, or npm dependency.
- TDD: add a failing test, verify RED, implement minimally, then rerun the relevant suite.

---

### Task 1: Build the Pure Annotation Domain and Anchor Resolver

**Files:**
- Create: `src/lib/annotations.ts`
- Create: `tests/annotations.test.ts`
- Modify: `src/consts.ts`

**Interfaces:**

```ts
export const ANNOTATION_STORAGE_KEY = 'yukki-annotations-v1';
export const ANNOTATION_LIMIT = 200;
export const ANNOTATION_QUOTE_LIMIT = 2000;
export const ANNOTATION_NOTE_LIMIT = 1000;
export const ANNOTATION_CONTEXT_LENGTH = 32;

export type AnnotationLang = 'zh' | 'en';

export interface AnnotationRecord {
  id: string;
  lang: AnnotationLang;
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

export interface AnnotationStore {
  records: AnnotationRecord[];
}

export interface AnnotationAnchor {
  quote: string;
  start: number;
  end: number;
  prefix: string;
  suffix: string;
}

export type AnnotationResolutionStatus =
  | 'exact'
  | 'context'
  | 'unique'
  | 'missing'
  | 'conflict';

export interface ResolvedAnnotation {
  record: AnnotationRecord;
  status: AnnotationResolutionStatus;
  start: number | null;
  end: number | null;
}

export function normalizeAnnotationStore(input: unknown): AnnotationStore;
export function readAnnotationStore(storage: Pick<Storage, 'getItem'> | null | undefined): AnnotationStore;
export function writeAnnotationStore(storage: Pick<Storage, 'setItem'> | null | undefined, value: AnnotationStore): boolean;
export function createAnnotationAnchor(text: string, start: number, end: number): AnnotationAnchor | null;
export function createAnnotationRecord(
  input: Omit<AnnotationRecord, 'id' | 'createdAt' | 'updatedAt'>,
  now?: number,
  id?: string,
): AnnotationRecord;
export function upsertAnnotation(store: AnnotationStore, record: AnnotationRecord): AnnotationStore;
export function updateAnnotationNote(store: AnnotationStore, id: string, note: string, now?: number): AnnotationStore;
export function removeAnnotation(store: AnnotationStore, id: string): AnnotationStore;
export function selectAnnotationsForPost(store: AnnotationStore, lang: AnnotationLang, postId: string): AnnotationRecord[];
export function resolveAnnotationAnchor(record: AnnotationRecord, text: string): ResolvedAnnotation;
export function resolveAnnotationAnchors(records: AnnotationRecord[], text: string): ResolvedAnnotation[];
```

- Consumes: `Storage`-compatible object, raw selection offsets, and the current article text stream.
- Produces: Validated records and deterministic resolved ranges for the component.

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  ANNOTATION_STORAGE_KEY,
  createAnnotationAnchor,
  createAnnotationRecord,
  normalizeAnnotationStore,
  readAnnotationStore,
  removeAnnotation,
  resolveAnnotationAnchor,
  resolveAnnotationAnchors,
  selectAnnotationsForPost,
  updateAnnotationNote,
  upsertAnnotation,
  writeAnnotationStore,
  type AnnotationRecord,
} from '../src/lib/annotations';

function record(overrides: Partial<AnnotationRecord> = {}): AnnotationRecord {
  return {
    id: 'one',
    lang: 'zh',
    postId: 'hello-world',
    quote: 'hello',
    note: 'note',
    start: 0,
    end: 5,
    prefix: '',
    suffix: ' world',
    createdAt: 10,
    updatedAt: 10,
    ...overrides,
  };
}

describe('annotation normalization', () => {
  it('rejects malformed records and trims stored text', () => {
    const store = normalizeAnnotationStore({
      records: [
        record({ quote: '  hello  ', note: '  keep\\nthis  ', start: 0, end: 5 }),
        record({ id: 'bad-offset', start: 0, end: 4 }),
        record({ id: 'bad-lang', lang: 'fr' as never }),
        { note: 'missing id' },
      ],
    });
    expect(store.records).toHaveLength(1);
    expect(store.records[0].quote).toBe('hello');
    expect(store.records[0].note).toBe('keep\\nthis');
  });

  it('deduplicates newer ids, caps at 200, and sorts newest first', () => {
    const records = Array.from({ length: 205 }, (_, index) =>
      record({ id: `id-${index}`, updatedAt: index }),
    );
    records.push(record({ id: 'id-0', note: 'newer', updatedAt: 9999 }));
    const store = normalizeAnnotationStore({ records });
    expect(store.records).toHaveLength(200);
    expect(store.records[0].id).toBe('id-0');
    expect(store.records[0].note).toBe('newer');
  });

  it('guards storage reads and writes', () => {
    expect(readAnnotationStore(null)).toEqual({ records: [] });
    expect(readAnnotationStore({ getItem: () => '{broken' })).toEqual({ records: [] });
    expect(writeAnnotationStore({ setItem: () => { throw new Error('quota'); } }, { records: [] })).toBe(false);
    expect(ANNOTATION_STORAGE_KEY).toBe('yukki-annotations-v1');
  });
});

describe('annotation anchors', () => {
  it('trims selection whitespace and stores UTF-16 offsets', () => {
    const text = '🙂keep this idea  ';
    const start = text.indexOf('keep');
    const anchor = createAnnotationAnchor(text, start, text.indexOf('idea') + 4);
    expect(anchor).toMatchObject({
      quote: 'keep this idea',
      start: 2,
      end: 16,
      prefix: '🙂',
      suffix: '  ',
    });
  });

  it('resolves exact, nearest context, unique quote, and missing anchors', () => {
    const text = 'alpha target beta ... repeat target repeat target';
    const exact = record({ quote: 'target', start: 6, end: 12, prefix: 'alpha ', suffix: ' beta' });
    expect(resolveAnnotationAnchor(exact, text)).toMatchObject({ status: 'exact', start: 6, end: 12 });

    const context = record({
      quote: 'target',
      start: 99,
      end: 105,
      prefix: 'repeat ',
      suffix: ' repeat',
    });
    expect(resolveAnnotationAnchor(context, text)).toMatchObject({
      status: 'context',
      start: text.indexOf('target', 20),
    });

    const unique = record({ quote: 'alpha', start: 99, end: 104, prefix: 'ZZ', suffix: 'ZZ' });
    expect(resolveAnnotationAnchor(unique, text)).toMatchObject({ status: 'unique', start: 0 });
    expect(resolveAnnotationAnchor(record({ quote: 'absent' }), text).status).toBe('missing');
  });

  it('marks older overlapping restores as conflicts', () => {
    const text = 'abcdef';
    const newer = record({ id: 'new', quote: 'abc', start: 0, end: 3, updatedAt: 20 });
    const older = record({ id: 'old', quote: 'bcd', start: 1, end: 4, updatedAt: 10 });
    expect(resolveAnnotationAnchors([older, newer], text)).toEqual([
      expect.objectContaining({ record: newer, status: 'exact', start: 0, end: 3 }),
      expect.objectContaining({ record: older, status: 'conflict', start: null, end: null }),
    ]);
  });
});

describe('annotation mutations', () => {
  it('adds, edits, filters, removes, and preserves valid records on failure', () => {
    const created = createAnnotationRecord(
      {
        lang: 'zh',
        postId: 'hello-world',
        quote: 'hello',
        note: '',
        start: 0,
        end: 5,
        prefix: '',
        suffix: '',
      },
      100,
      'fixed-id',
    );
    const added = upsertAnnotation({ records: [] }, created);
    expect(added.records).toHaveLength(1);
    expect(selectAnnotationsForPost(added, 'zh', 'hello-world')).toHaveLength(1);
    expect(selectAnnotationsForPost(added, 'en', 'hello-world')).toHaveLength(0);
    expect(updateAnnotationNote(added, 'fixed-id', 'changed', 200).records[0].note).toBe('changed');
    expect(removeAnnotation(added, 'fixed-id').records).toHaveLength(0);
    expect(upsertAnnotation({ records: [] }, { ...created, end: 4 })).toEqual({ records: [] });
  });

  it('returns a new id and timestamp when fields are omitted', () => {
    const created = createAnnotationRecord(
      {
        lang: 'en',
        postId: 'hello-world.en',
        quote: 'Hello',
        note: 'note',
        start: 0,
        end: 5,
        prefix: '',
        suffix: '',
      },
      1234,
    );
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.createdAt).toBe(1234);
    expect(created.updatedAt).toBe(1234);
  });
});
```

- [ ] **Step 2: Run the domain tests and verify RED**

Run: `npm test -- tests/annotations.test.ts`

Expected: FAIL because `src/lib/annotations.ts` does not exist.

- [ ] **Step 3: Implement normalization and storage**

Use `ANNOTATION_STORAGE_KEY = 'yukki-annotations-v1'`. A record is valid only when:

- `id` and `postId` are non-empty strings;
- `lang` is `zh` or `en`;
- `quote` is a trimmed 1..2000 string;
- `note` is a trimmed 0..1000 string, preserving internal whitespace and newlines;
- `start` and `end` are non-negative integers, `end > start`, and `end - start === quote.length`;
- `prefix` and `suffix` are strings truncated to 64 code units;
- `createdAt` and `updatedAt` are finite non-negative numbers.

Normalize in this order: trim quote/note, validate offsets and timestamp, deduplicate by id keeping the larger `updatedAt` (first on a tie), sort by `updatedAt` descending, then slice to 200. `readAnnotationStore` must catch a throwing `getItem`; `writeAnnotationStore` must catch a throwing `setItem` and return `false`.

- [ ] **Step 4: Implement selection anchors and recovery**

`createAnnotationAnchor` must:

```ts
if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || end <= start) return null;
while (start < end && /\s/u.test(text[start])) start += 1;
while (end > start && /\s/u.test(text[end - 1])) end -= 1;
const quote = text.slice(start, end);
if (!quote || quote.length > ANNOTATION_QUOTE_LIMIT) return null;
return {
  quote,
  start,
  end,
  prefix: text.slice(Math.max(0, start - ANNOTATION_CONTEXT_LENGTH), start),
  suffix: text.slice(end, Math.min(text.length, end + ANNOTATION_CONTEXT_LENGTH)),
};
```

`createAnnotationRecord` generates an id with `crypto.randomUUID()` when available, then `crypto.getRandomValues()` plus a timestamp, then timestamp plus a monotonic counter. It normalizes the input through the same validator.

`resolveAnnotationAnchor` checks in this order:

1. `text.slice(record.start, record.end) === record.quote`.
2. Find every occurrence of `record.prefix + record.quote + record.suffix`; pick the candidate whose computed start is nearest `record.start`, tie-breaking the earlier occurrence.
3. Find `record.quote`; use it only if exactly one occurrence exists.
4. Return `missing`.

`resolveAnnotationAnchors` sorts records by `updatedAt` descending, then `createdAt` descending, then input order. It accepts each non-overlapping resolved range, and marks any later intersecting record as `conflict` with `start: null`, `end: null`. Missing records remain `missing`.

- [ ] **Step 5: Add paired UI copy**

Add these keys to both `UI.zh` and `UI.en` in `src/consts.ts`:

| key | zh | en |
|---|---|---|
| `annotations` | 摘录 | Excerpts |
| `annotationsOpen` | 查看文章摘录 | View article excerpts |
| `annotationsEmpty` | 还没有摘录 | No excerpts yet |
| `annotationsEmptyHint` | 选中正文即可高亮或写边注。 | Select article text to highlight it or add a note. |
| `annotationHighlight` | 高亮 | Highlight |
| `annotationAddNote` | 边注 | Add note |
| `annotationQuote` | 选中文字 | Selected text |
| `annotationNote` | 边注内容 | Note |
| `annotationNotePlaceholder` | 写下你的想法（可空） | Add a thought (optional) |
| `annotationSave` | 保存 | Save |
| `annotationSaved` | 已保存 | Saved |
| `annotationDelete` | 删除 | Delete |
| `annotationDeleted` | 已删除 | Deleted |
| `annotationCancel` | 取消 | Cancel |
| `annotationClose` | 关闭 | Close |
| `annotationStorageUnavailable` | 本地存储不可用 | Local storage is unavailable |
| `annotationInvalidSelection` | 请选择正文中的有效文字 | Select valid text inside the article |
| `annotationTooLong` | 选中文字太长，无法保存 | The selection is too long to save |
| `annotationOverlap` | 这段文字已经有摘录了 | This text already has an excerpt |
| `annotationSaveFailed` | 保存失败，请稍后再试 | Could not save. Please try again. |
| `annotationDeleteFailed` | 删除失败，请稍后再试 | Could not delete. Please try again. |
| `annotationMoved` | 原文位置已变化 | Original location changed |
| `annotationConflict` | 与较新的摘录重叠 | Overlaps a newer excerpt |
| `annotationJumped` | 已定位到摘录 | Jumped to excerpt |
| `annotationToolbar` | 文字操作 | Text actions |
| `annotationExcerpts` | 摘录 {count} | {count} excerpts |

- [ ] **Step 6: Run the domain tests and verify GREEN**

Run: `npm test -- tests/annotations.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/annotations.ts src/consts.ts tests/annotations.test.ts
git commit -m "feat(annotations): add local annotation domain and anchors"
```

### Task 2: Add the Accessible Article Annotation Shell

**Files:**
- Create: `src/components/ArticleAnnotations.astro`
- Create: `tests/annotations-ui.test.ts`
- Modify: `src/layouts/PostLayout.astro`

**Interfaces:**

```astro
<ArticleAnnotations
  postId={post.id}
  lang={lang}
  title={post.data.title}
/>
```

The component must render hidden-by-default client enhancement controls and the two native dialogs; the component script receives the post identity through escaped `data-*` attributes and uses `UI[lang]` copy.

- [ ] **Step 1: Add failing shell/integration tests**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = existsSync('src/components/ArticleAnnotations.astro')
  ? readFileSync('src/components/ArticleAnnotations.astro', 'utf8')
  : '';
const layout = readFileSync('src/layouts/PostLayout.astro', 'utf8');
const consts = readFileSync('src/consts.ts', 'utf8');

describe('annotation shell', () => {
  it('starts hidden and exposes a compact excerpt entry', () => {
    expect(component).toContain('data-article-annotations');
    expect(component).toContain('data-annotations-open');
    expect(component).toContain('data-annotations-count');
    expect(component).toContain('aria-label');
    expect(component).toContain('hidden');
  });

  it('uses native dialogs and accessible controls', () => {
    expect(component).toContain('<dialog');
    expect(component).toContain('showModal');
    expect(component).toContain('data-annotations-dialog');
    expect(component).toContain('data-annotation-editor');
    expect(component).toContain('role="toolbar"');
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain('data-annotation-toolbar');
  });

  it('is wired after the article header and before the body', () => {
    expect(layout).toContain("import ArticleAnnotations from '../components/ArticleAnnotations.astro'");
    expect(layout).toContain('<ArticleAnnotations');
    expect(layout.indexOf('<ArticleAnnotations')).toBeLessThan(layout.indexOf('<div class="post-layout"'));
  });

  it('keeps all new copy paired', () => {
    for (const key of [
      'annotations',
      'annotationsOpen',
      'annotationsEmpty',
      'annotationsEmptyHint',
      'annotationHighlight',
      'annotationAddNote',
      'annotationSave',
      'annotationDelete',
      'annotationStorageUnavailable',
      'annotationMoved',
      'annotationConflict',
    ]) expect(consts.match(new RegExp(`${key}:`, 'g'))?.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the UI tests and verify RED**

Run: `npm test -- tests/annotations-ui.test.ts`

Expected: FAIL because the component and layout integration do not exist.

- [ ] **Step 3: Render the shell**

Create `ArticleAnnotations.astro` with this stable markup and escaped data:

```astro
<div
  class="article-annotations"
  data-article-annotations
  data-post-id={postId}
  data-lang={lang}
  data-i18n={JSON.stringify(i18n).replace(/</g, '\\u003c')}
>
  <button type="button" class="annotation-entry" data-annotations-open hidden>
    <span>{t.annotations}</span>
    <span data-annotations-count>0</span>
  </button>
  <div
    class="annotation-toolbar"
    data-annotation-toolbar
    role="toolbar"
    aria-label={t.annotationToolbar}
    hidden
  >
    <button type="button" data-annotation-highlight>{t.annotationHighlight}</button>
    <button type="button" data-annotation-note>{t.annotationAddNote}</button>
  </div>
  <p class="annotation-status" data-annotation-status role="status" aria-live="polite"></p>
  <dialog class="annotation-drawer" data-annotations-dialog>
    <header>
      <h2>{t.annotations}</h2>
      <button type="button" data-annotations-close aria-label={t.annotationClose}>×</button>
    </header>
    <p data-annotations-empty>{t.annotationsEmptyHint}</p>
    <ol data-annotations-list></ol>
  </dialog>
  <dialog class="annotation-editor" data-annotation-editor>
    <form method="dialog" data-annotation-form>
      <h2 data-annotation-editor-title>{t.annotationAddNote}</h2>
      <blockquote data-annotation-quote></blockquote>
      <label>
        {t.annotationNote}
        <textarea data-annotation-note-input maxlength="1000"></textarea>
      </label>
      <div class="annotation-editor-actions">
        <button type="submit" value="save">{t.annotationSave}</button>
        <button type="button" data-annotation-delete hidden>{t.annotationDelete}</button>
        <button type="button" data-annotation-cancel>{t.annotationCancel}</button>
      </div>
    </form>
  </dialog>
</div>
```

Use `type="button"` everywhere except the explicit save submit. Keep both dialogs closed initially. Pass only `postId`, `lang`, and i18n text to the client script; do not interpolate article body HTML.

- [ ] **Step 4: Add component styling**

Use existing tokens. Required behavior:

- `.annotation-entry` has a minimum 44px height and fits in the article header.
- `.annotation-toolbar` is fixed/absolute above the selection, uses pixel border/shadow, and its buttons have minimum 44px touch areas.
- `.annotation-drawer` is a right-side modal drawer on desktop: `margin-left: auto; height: 100dvh; width: min(420px, 100%);`.
- At `max-width: 760px`, `.annotation-drawer` fills the viewport from the bottom: `inset: 0; width: 100%; height: 100dvh; max-height: 100dvh; margin: 0;`.
- `.post-body mark[data-annotation-id]` uses `color: inherit`, an accent-color background, a visible underline, and `scroll-margin-top`.
- `.annotation-pulse` is short and removed by the script; `@media (prefers-reduced-motion: reduce)` disables it.
- The dialogs use `::backdrop` with a translucent background and keep internal lists scrollable.

- [ ] **Step 5: Integrate into PostLayout**

Place `<ArticleAnnotations postId={post.id} lang={lang} title={post.data.title} />` after `PostBookmark` and before `PostToc`, so the entry is in the article header and the dialogs exist in the page DOM. Do not put the entry inside `.post-body`.

- [ ] **Step 6: Run the shell tests and verify GREEN**

Run: `npm test -- tests/annotations-ui.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ArticleAnnotations.astro src/layouts/PostLayout.astro tests/annotations-ui.test.ts
git commit -m "feat(annotations): add accessible article shell"
```

### Task 3: Implement Selection Mapping and Range Highlighting

**Files:**
- Modify: `src/components/ArticleAnnotations.astro`
- Modify: `tests/annotations-ui.test.ts`

**Interfaces:**

- The script creates `TextSegment[]` with `{ node, start, end }` from eligible `.post-body` text nodes.
- A selection maps to `AnnotationAnchor`; the DOM renderer maps resolved `start/end` pairs back to text-node ranges.
- Controlled state:

```ts
type PendingAnchor = AnnotationAnchor;
interface EditorState {
  editingId: string | null;
  anchor: PendingAnchor | null;
}
```

- Consumes: `createAnnotationAnchor`, `resolveAnnotationAnchors`, `upsertAnnotation`, `updateAnnotationNote`, `removeAnnotation`, `readAnnotationStore`, `writeAnnotationStore`.
- Produces: non-overlapping `<mark>` elements and a selection toolbar that never mutates the article when invalid.

- [ ] **Step 1: Add failing behavior-source tests**

The tests are source-level because the repository does not install jsdom. Assert the implementation contains the required lifecycle and safety branches:

```ts
expect(component).toContain('TreeWalker');
expect(component).toContain('createTreeWalker');
expect(component).toContain('createAnnotationAnchor');
expect(component).toContain('resolveAnnotationAnchors');
expect(component).toContain('selectionchange');
expect(component).toContain('pointerup');
expect(component).toContain('keydown');
expect(component).toContain('range.getBoundingClientRect');
expect(component).toContain('range.surroundContents');
expect(component).toContain('data-annotation-first');
expect(component).toContain('data-annotation-last');
expect(component).toContain("document.addEventListener('astro:before-swap'");
expect(component).toContain("document.addEventListener('astro:page-load'");
expect(component).not.toMatch(/selection\.toString\(\)/);
expect(component).not.toMatch(/\.innerHTML\s*=/);
expect(component).toContain('getComputedStyle');
expect(component).toContain('checkVisibility');
```

- [ ] **Step 2: Run the behavior-source tests and verify RED**

Run: `npm test -- tests/annotations-ui.test.ts`

Expected: FAIL because selection and Range logic is absent.

- [ ] **Step 3: Implement the text stream and boundary mapping**

The text stream must:

```ts
const EXCLUDED = 'script, style, button, input, select, textarea, svg, [data-annotation-ignore]';

function isEligible(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent || !node.data.length || parent.closest(EXCLUDED)) return false;
  if (parent.closest('[hidden], [aria-hidden="true"]')) return false;
  if (typeof parent.checkVisibility === 'function' && !parent.checkVisibility()) return false;
  const style = getComputedStyle(parent);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function textSegments(body: HTMLElement): { segments: TextSegment[]; text: string } {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const segments: TextSegment[] = [];
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType !== Node.TEXT_NODE || !isEligible(node as Text)) continue;
    const start = text.length;
    const value = (node as Text).data;
    text += value;
    if (value.length) segments.push({ node: node as Text, start, end: start + value.length });
  }
  return { segments, text };
}
```

Map a selection boundary as follows:

- If `container` is a text node, update that segment's local offset directly.
- If `container` is an element, use a collapsed `Range` and `compareBoundaryPoints` to select the first eligible segment at/after the point for the start, and the last segment at/before the point for the end.
- Reject boundaries outside `body`, collapsed selections, selections outside the eligible stream, and ranges where the resulting quote is empty or longer than 2000 code units.

On `pointerup`, `keyup`, `selectionchange` (debounced with `requestAnimationFrame`), and `touchend`, calculate the pending anchor and position the toolbar from `range.getBoundingClientRect()`. Clamp the fixed toolbar to the viewport; hide it on scroll and when the selection is cleared.

- [ ] **Step 4: Implement clearing and wrapping**

Before every render:

1. Unwrap every `.post-body mark[data-annotation-id]`, replacing it with its text content.
2. Call `body.normalize()` so adjacent text nodes merge.
3. Recompute the original text stream.

For each accepted `ResolvedAnnotation`, build ranges for every text segment intersecting `[start, end)`. Process segments from last to first:

```ts
const part = document.createRange();
part.setStart(segment.node, Math.max(0, start - segment.start));
part.setEnd(segment.node, Math.min(segment.node.data.length, end - segment.start));
const mark = document.createElement('mark');
mark.dataset.annotationId = record.id;
mark.dataset.annotationFirst = isFirst ? 'true' : 'false';
mark.dataset.annotationLast = isLast ? 'true' : 'false';
mark.title = record.quote;
mark.textContent = record.quote;
part.surroundContents(mark);
```

For a single-segment range use `mark.textContent = record.quote`; for multi-segment ranges use each segment's original slice. Add `tabIndex=0` only to the first fragment, and delegate `click`/keyboard activation to the nearest annotation id. Do not use `innerHTML`.

- [ ] **Step 5: Implement overlap rejection**

Before saving a new annotation, resolve the current records against the current text stream. If the pending range intersects any `status === 'exact' | 'context' | 'unique'` range, do not write; set the status message to `annotationOverlap` and leave existing markers untouched. A newly saved record is re-rendered through `resolveAnnotationAnchors` so the newer record wins deterministically.

- [ ] **Step 6: Implement storage and cross-tab lifecycle**

`getStorage()` must catch property access. Attempt a read before revealing `data-annotations-open`; if it throws, keep the entry hidden and set the status to `annotationStorageUnavailable` when the user tries an action. `readAnnotationStore` and `writeAnnotationStore` remain the only serialization boundaries. On storage failure, retain the previous store and do not mutate the DOM.

On `astro:page-load`, initialize once and:

- abort stale listeners;
- close both dialogs and clear marks/toolbar;
- attach `storage` with `event.key === ANNOTATION_STORAGE_KEY`;
- attach `astro:before-swap` cleanup that aborts, closes dialogs, removes marks, normalizes text nodes, and clears the pending selection.

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run: `npm test -- tests/annotations-ui.test.ts tests/annotations.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/ArticleAnnotations.astro tests/annotations-ui.test.ts
git commit -m "feat(annotations): map selections and render highlights"
```

### Task 4: Finish Dialogs, Excerpts, Editing, and Navigation

**Files:**
- Modify: `src/components/ArticleAnnotations.astro`
- Modify: `tests/annotations-ui.test.ts`
- Modify: `scripts/check-content.mjs`

**Interfaces:**

- Editor form submit saves a new record or updates the selected record's note.
- `data-annotations-list` is a `textContent`-safe list of excerpt cards.
- The excerpt entry count always reflects records for `lang + postId`.
- Clicking a recoverable excerpt closes the drawer, scrolls to the first mark, focuses it, and adds a temporary pulse class.

- [ ] **Step 1: Add failing dialog/state tests**

```ts
expect(component).toContain('data-annotation-form');
expect(component).toContain('updateAnnotationNote');
expect(component).toContain('removeAnnotation');
expect(component).toContain('scrollIntoView');
expect(component).toContain('focus(');
expect(component).toContain('annotationMoved');
expect(component).toContain('annotationConflict');
expect(component).toContain('data-annotations-list');
expect(component).toContain('textContent');
expect(component).toContain('annotationStorageUnavailable');
expect(component).toContain('annotationSaveFailed');
expect(component).toContain('annotationDeleteFailed');
expect(component).not.toMatch(/\.innerHTML\s*=/);
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/annotations-ui.test.ts`

Expected: FAIL because editing and excerpt rendering are not implemented.

- [ ] **Step 3: Implement quick highlight and note editing**

Quick highlight:

- preserve the pending anchor on toolbar `pointerdown`;
- create an empty-note record with `createAnnotationRecord`;
- reject overlap before writing;
- `upsertAnnotation`, `writeAnnotationStore`, then update local state and render only on success;
- announce `annotationSaved`; on failure announce `annotationSaveFailed`.

Note editor:

- open with the current quote and existing note;
- save as a new record when `editingId` is null;
- otherwise call `updateAnnotationNote(store, id, trimmedNote, Date.now())`;
- delete only after a successful `removeAnnotation` write;
- restore focus to the invoking mark/dialog trigger, then to the excerpt entry, then to the article body.

Use `dialog.showModal()` and `dialog.close()`. Handle the `cancel` event by clearing pending state without writing.

- [ ] **Step 4: Render the excerpt drawer**

Read the current post's records, call `resolveAnnotationAnchors(records, originalText)`, and render one `<li>` per record in newest-first order. For each item:

- quote via `textContent`;
- note via `textContent`;
- date via `Intl.DateTimeFormat`;
- status label for `missing` (`annotationMoved`) or `conflict` (`annotationConflict`);
- a jump button/click only for exact/context/unique records;
- edit/delete controls for every record.

Update `data-annotations-count` with the number of records and hide the drawer empty message only when the list is non-empty. Never build item HTML with string concatenation.

- [ ] **Step 5: Complete focus and motion behavior**

Clicks on a resolved excerpt must:

1. close the excerpt dialog;
2. find the first mark with that id;
3. call `scrollIntoView({ block: 'center' })`;
4. call `focus({ preventScroll: true })`;
5. add an `annotation-pulse` class and remove it after 700ms or an `animationend`.

Set `aria-expanded` on the entry and editor trigger appropriately. Close both dialogs on `astro:before-swap`. Keep `prefers-reduced-motion` styling in CSS.

- [ ] **Step 6: Add the content gate**

In `scripts/check-content.mjs`, assert each built article contains `data-article-annotations`, the excerpt entry, and no generated annotation data in the initial HTML. Do not add a new route requirement for annotations.

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run: `npm test -- tests/annotations-ui.test.ts tests/annotations.test.ts tests/frontend-readiness.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/ArticleAnnotations.astro tests/annotations-ui.test.ts scripts/check-content.mjs
git commit -m "feat(annotations): add excerpt drawer and editor"
```

### Task 5: Verify the Complete Annotation Slice

**Files:**
- Verify only; change code only for a real failing requirement.

- [ ] **Step 1: Run static and unit checks**

Run: `npm run check`

Run: `npm test`

Run: `npm run check:content`

Expected: all commands exit 0.

- [ ] **Step 2: Build and run frontend gates**

Run: `npm run verify:frontend`

Expected: exit 0, with the annotation shell present on generated article pages and no new required route.

- [ ] **Step 3: Browser acceptance**

At 320px, 390px, 760px, 761px, and 1440px, verify:

- select text and use both highlight and note actions;
- create a multi-node selection crossing a paragraph boundary;
- save, refresh, return to the article, and confirm restoration;
- edit a note, delete an annotation, and confirm the count changes;
- open the drawer from keyboard, jump to a mark, and return focus on close;
- make two overlapping selections and confirm the second is rejected;
- simulate corrupted storage and confirm the page and article remain usable;
- confirm no horizontal overflow and no duplicate marks after a View Transition;
- disable JavaScript and confirm article content plus journey navigation remain visible while annotation controls stay hidden.

