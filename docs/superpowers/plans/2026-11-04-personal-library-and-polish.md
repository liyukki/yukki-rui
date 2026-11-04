# Personal Library and Experience Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the reader-experience polish and add a private, local-only reading history, progress, and bookmark system.

**Architecture:** Keep the Astro site static and dependency-free. Add a small typed localStorage domain module, thin progressive-enhancement components for article tracking/bookmarking and the home shelf, and static markup/accessibility fixes that work without JavaScript.

**Tech Stack:** Astro 7, TypeScript, Vitest, browser localStorage, existing global CSS.

## Global Constraints

- Do not add a backend, account system, client framework, or npm dependency.
- All localStorage reads and writes must catch exceptions; storage failure must not break reading.
- Render personal data with `textContent`; never assign untrusted library data through `innerHTML`.
- Only render links whose post key and canonical href match the current language's generated post catalog.
- Clamp progress to 0-100, retain at most 20 history entries and 50 bookmarks, and deduplicate by `lang:id`.
- The 320px home page must have no horizontal overflow without hiding it via `overflow-x: hidden`.
- Reading settings remain expanded on desktop and without JavaScript; they default closed only on mobile with JavaScript.
- Every new Chinese UI string must have a paired English string.
- Follow TDD: add a failing test, verify the expected failure, implement minimally, then rerun the complete relevant suite.

---

### Task 1: Lock the Experience Polish with Tests

**Files:**
- Create: `tests/experience-polish.test.ts`
- Modify: `tests/header-mobile-nav.test.ts`

**Interfaces:**
- Consumes: Existing Astro component source as plain UTF-8 text.
- Produces: Regression expectations for the skip link, main landmark, navigation state, recent-post limit, mobile settings disclosure, and narrow-layout CSS.

- [ ] **Step 1: Write the failing polish tests**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const baseLayout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
const header = readFileSync('src/components/Header.astro', 'utf8');
const home = readFileSync('src/pages/[lang]/index.astro', 'utf8');
const settings = readFileSync('src/components/ReadingSettings.astro', 'utf8');
const globalCss = readFileSync('src/styles/global.css', 'utf8');
const worldCss = readFileSync('src/styles/world.css', 'utf8');

describe('experience polish', () => {
  it('provides a skip link to a focusable main landmark', () => {
    expect(baseLayout).toContain('class="skip-link"');
    expect(baseLayout).toContain('href="#main-content"');
    expect(baseLayout).toContain('id="main-content"');
    expect(baseLayout).toContain('tabindex="-1"');
  });

  it('marks the current navigation destination', () => {
    expect(baseLayout).toContain('currentPath={Astro.url.pathname}');
    expect(header).toContain('currentPath');
    expect(header).toContain('aria-current');
  });

  it('shows four recent posts and links to the archive', () => {
    expect(home).toContain('posts.slice(0, 4)');
    expect(home).toContain('recentPosts.map');
    expect(home).toContain('viewAllPosts');
  });

  it('uses a native mobile disclosure while keeping a no-JS fallback', () => {
    expect(settings).toContain('<details');
    expect(settings).toContain('<summary');
    expect(settings).toContain('open');
    expect(settings).toContain("matchMedia('(max-width: 760px)')");
  });

  it('removes intrinsic grid and project-art overflow at narrow widths', () => {
    expect(globalCss).toMatch(/\.grid-2\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
    expect(globalCss).toMatch(/\.project-card[^{]*\{[^}]*min-width:\s*0/);
    expect(worldCss).toMatch(/\.mini-window\s*\{[^}]*width:\s*min\(240px,\s*100%\)/);
  });
});
```

- [ ] **Step 2: Extend the navigation test**

Add a case asserting that the header compares normalized paths and emits `aria-current="page"` only for the matching destination.

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npm test -- tests/experience-polish.test.ts tests/header-mobile-nav.test.ts`

Expected: the new polish test fails because the skip link, recent-post limit, disclosure markup, and min-width rules do not exist yet.

### Task 2: Implement the Experience Polish

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/components/Header.astro`
- Modify: `src/components/ReadingSettings.astro`
- Modify: `src/pages/[lang]/index.astro`
- Modify: `src/consts.ts`
- Modify: `src/styles/global.css`
- Modify: `src/styles/world.css`

**Interfaces:**
- Consumes: `UI[lang]` paired copy and `Astro.url.pathname`.
- Produces: `<main id="main-content" tabindex="-1">`, active navigation links, a limit of four home cards, a mobile-native reading-settings disclosure, and fixed narrow-layout CSS.

- [ ] **Step 1: Add paired copy**

Add `skipToContent` and `viewAllPosts` in both languages.

- [ ] **Step 2: Add the skip link and main landmark**

Render a focus-visible `.skip-link` immediately after `<body>`, pass `currentPath={Astro.url.pathname}` to Header, and change the main element to:

```astro
<main id="main-content" class="wrap" tabindex="-1">
  <slot />
</main>
```

- [ ] **Step 3: Mark the current navigation item**

In Header, normalize paths by removing duplicate leading/trailing slashes, compare each destination with the current pathname, and set `aria-current={active ? 'page' : undefined}`.

- [ ] **Step 4: Make reading settings a mobile disclosure**

Use `<details class="reading-settings" data-reading-settings open>` with a semantic `<summary>`. Add an immediate inline script that removes `open` only when the mobile media query matches, plus a small module script that reopens on desktop and closes on mobile after viewport changes. Keep the module's storage behavior unchanged.

- [ ] **Step 5: Limit the home feed**

Set `const recentPosts = posts.slice(0, 4)`, render `recentPosts`, and add a `viewAllPosts` link to the language archive.

- [ ] **Step 6: Fix the narrow intrinsic widths**

Add `min-width: 0` to grid children, project cards, and project art. Change the mini window to `width: min(240px, 100%)`. Do not add an `overflow-x: hidden` workaround.

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run: `npm test -- tests/experience-polish.test.ts tests/header-mobile-nav.test.ts`

Expected: PASS.

### Task 3: Build and Test the Local Library Domain

**Files:**
- Create: `src/lib/personal-library.ts`
- Create: `tests/personal-library.test.ts`

**Interfaces:**

```ts
type Lang = 'zh' | 'en';

interface ReadingRecord {
  id: string;
  lang: Lang;
  title: string;
  href: string;
  progress: number;
  updatedAt: number;
}

interface BookmarkRecord {
  id: string;
  lang: Lang;
  title: string;
  href: string;
  savedAt: number;
}

interface PersonalLibrary {
  history: ReadingRecord[];
  bookmarks: BookmarkRecord[];
}

function normalizePersonalLibrary(input: unknown): PersonalLibrary;
function readPersonalLibrary(storage: Pick<Storage, 'getItem'> | null | undefined): PersonalLibrary;
function writePersonalLibrary(storage: Pick<Storage, 'setItem'> | null | undefined, value: PersonalLibrary): boolean;
function recordReading(value: PersonalLibrary, record: ReadingRecord): PersonalLibrary;
function toggleBookmark(value: PersonalLibrary, bookmark: BookmarkRecord): PersonalLibrary;
function selectContinueReading(value: PersonalLibrary, catalog: CatalogEntry[], lang: Lang): CatalogEntry | null;
function selectBookmarks(value: PersonalLibrary, catalog: CatalogEntry[], lang: Lang, limit?: number): CatalogEntry[];
```

- [ ] **Step 1: Write failing domain tests**

Cover malformed storage, throwing getters/setters, validation, progress clamping, deduplication, recency ordering, limits, bookmark toggling, language filtering, canonical-catalog filtering, and completed-history exclusion from Continue reading.

- [ ] **Step 2: Run the domain test and verify RED**

Run: `npm test -- tests/personal-library.test.ts`

Expected: FAIL because `src/lib/personal-library.ts` does not exist.

- [ ] **Step 3: Implement the domain module**

Use the key `yukki-personal-library-v1`. Keep all serialization and normalization pure except the two explicitly guarded storage helpers. Use a `lang:id` key for deduplication. Sort newest first and enforce caps after normalization and mutation.

- [ ] **Step 4: Run the domain test and verify GREEN**

Run: `npm test -- tests/personal-library.test.ts`

Expected: PASS.

### Task 4: Add Article Progress and Bookmarking

**Files:**
- Create: `src/components/ReadingProgressTracker.astro`
- Create: `src/components/PostBookmark.astro`
- Create: `tests/personal-library-ui.test.ts`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/consts.ts`

**Interfaces:**
- Consumes: `recordReading`, `toggleBookmark`, `readPersonalLibrary`, and `writePersonalLibrary`.
- Produces: Hidden article metadata that records document progress, plus an accessible bookmark button that toggles localStorage state.

- [ ] **Step 1: Write failing article UI tests**

Assert the tracker exposes post metadata and handles `scroll`, `pagehide`, `visibilitychange`, and `astro:before-swap`; assert the bookmark button exposes `aria-pressed`, `aria-live`, and uses only `textContent`; assert PostLayout imports and places both components outside the like/share card.

- [ ] **Step 2: Run the UI test and verify RED**

Run: `npm test -- tests/personal-library-ui.test.ts`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the tracker**

Render hidden `data-reading-tracker` metadata with canonical post id, language, title, and href. Compute progress from document scroll distance, persist the initial value, then throttle scroll updates with `requestAnimationFrame`. Flush on page hide, visibility change, and before-swap. Abort stale listeners on repeated Astro page loads.

- [ ] **Step 4: Implement bookmarking**

Render the button hidden until the script initializes. On init, read storage, reflect the current state, then toggle through `toggleBookmark` and `writePersonalLibrary`. On write failure, keep the previous state and announce `bookmarkFailed`. Use paired labels for unbookmarked, bookmarked, saved, removed, and failed states.

- [ ] **Step 5: Place both components in PostLayout**

Place `PostBookmark` near the title/tags so it is separate from the like/share row. Place the tracker near the top of the article.

- [ ] **Step 6: Run article UI tests and verify GREEN**

Run: `npm test -- tests/personal-library-ui.test.ts tests/post-share-ui.test.ts tests/post-likes-ui.test.ts`

Expected: PASS.

### Task 5: Add the Home Continue-Reading and Bookshelf UI

**Files:**
- Create: `src/components/PersonalShelf.astro`
- Modify: `src/pages/[lang]/index.astro`
- Modify: `src/consts.ts`
- Modify: `tests/personal-library-ui.test.ts`

**Interfaces:**
- Consumes: Current-language post metadata plus `readPersonalLibrary`, `selectContinueReading`, and `selectBookmarks`.
- Produces: A hidden-by-default home section that renders one Continue-reading row and up to four bookshelf rows only when local data exists.

- [ ] **Step 1: Extend the UI test with failing shelf expectations**

Assert the shelf starts hidden, consumes the current-language canonical catalog, filters through the pure selectors, updates on `storage` events, renders through `textContent`, and never assigns `innerHTML`.

- [ ] **Step 2: Run the UI test and verify RED**

Run: `npm test -- tests/personal-library-ui.test.ts`

Expected: FAIL because `PersonalShelf.astro` and its home integration do not exist.

- [ ] **Step 3: Implement PersonalShelf**

Pass a JSON catalog through an escaped data attribute. After load, parse it defensively, read the library, select canonical entries, build rows with `createElement` and `textContent`, and hide the whole section when both groups are empty. Add a progress label to Continue reading and a link to the archive for the bookshelf.

- [ ] **Step 4: Integrate the shelf on the home page**

Place the shelf above the recent-posts section so returning readers can resume quickly. Keep it absent from the visual flow when empty.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- tests/personal-library-ui.test.ts tests/experience-polish.test.ts`

Expected: PASS.

### Task 6: Full Verification

**Files:**
- Verify only; modify code only if a failing check reveals a real regression.

- [ ] **Step 1: Run static and automated checks**

Run: `npm run check`

Run: `npm test`

Run: `npm run build`

Run: `npm run verify:frontend`

Expected: all commands exit 0.

- [ ] **Step 2: Run browser checks**

Use the installed system Chrome through Playwright at 320, 390, 760, 761, and 1440px. Verify no horizontal overflow, open/closed reading settings, four-card home feed, skip link focus, current navigation state, no-JS visibility, successful progress/bookmark persistence, and graceful behavior when localStorage throws.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors and only planned files changed.
