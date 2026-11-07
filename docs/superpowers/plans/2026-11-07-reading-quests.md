# Reading Quests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add author-curated, bilingual reading quests with local progress, a home next-quest card, quest pages, article route navigation, and archive discovery.

**Architecture:** Store journeys as JSON content entries, resolve and validate them through the DOM-free `src/lib/journeys.ts` module, and derive all reader progress from the existing personal-library history. Server-render stable semantic markup, then progressively enhance it in the browser with localStorage data.

**Tech Stack:** Astro 7, TypeScript, Vitest, Astro content collections, Sveltia/Decap YAML configuration, existing CSS tokens.

## Global Constraints

- Journeys use collection key `${lang}:${slug}` and must contain at least two unique, published, same-language posts.
- A chapter is complete at `progress >= 90`; all state is derived from `readPersonalLibrary()` with no new progress storage.
- Draft journeys must still validate but must not appear in any UI.
- Sort by `order` ascending and then `slug` ascending.
- `nextStep` is the first incomplete step; `activeStep` is the most recently read incomplete step and otherwise falls back to `nextStep`.
- Every new Chinese UI string must have a paired English string.
- Every generated site link must pass through `withBase()`.
- Do not add a backend, account system, client framework, or npm dependency.
- Use TDD: add a failing test, verify the expected failure, implement minimally, then rerun the relevant suite.

---

### Task 1: Lock the Journey Content Contract

**Files:**
- Modify: `src/content.config.ts`
- Create: `src/content/journeys/build-this-site.zh.json`
- Create: `src/content/journeys/site-notes.en.json`
- Modify: `public/admin/config.yml`
- Create: `tests/journeys.test.ts`

**Interfaces:**

```ts
export type JourneyLang = 'zh' | 'en';

export interface JourneyStepInput {
  postId: string;
  label?: string;
}

export interface JourneyInput {
  slug: string;
  lang: JourneyLang;
  title: string;
  description: string;
  draft?: boolean;
  order?: number;
  steps: JourneyStepInput[];
}
```

- Consumes: Astro content loader, Zod schemas, current published post IDs.
- Produces: A typed `journeys` collection whose entry IDs are `${lang}:${slug}` and whose JSON shape matches the CMS.

- [ ] **Step 1: Write the failing schema and CMS contract tests**

Add this test file. It intentionally reads the collection and CMS source as text because the project already tests generated content contracts without booting Astro.

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const contentConfig = readFileSync('src/content.config.ts', 'utf8');
const cms = readFileSync('public/admin/config.yml', 'utf8');

describe('journeys content contract', () => {
  it('registers the collection with stable language-slug ids and bounded steps', () => {
    expect(contentConfig).toContain('const journeys = defineCollection');
    expect(contentConfig).toContain("pattern: '**/*.json'");
    expect(contentConfig).toContain("base: './src/content/journeys'");
    expect(contentConfig).toContain('`${data.lang}:${data.slug}`');
    expect(contentConfig).toContain('steps: z.array');
    expect(contentConfig).toContain('.min(2)');
    expect(contentConfig).toContain('postId: z.string().min(1)');
    expect(contentConfig).toContain('export const collections = { posts, site, pages, journeys }');
  });

  it('matches the CMS folder collection and step fields', () => {
    expect(cms).toContain('name: journeys');
    expect(cms).toContain('folder: src/content/journeys');
    expect(cms).toContain('name: steps');
    expect(cms).toContain('name: postId');
    expect(cms).toContain('name: label');
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm test -- tests/journeys.test.ts`

Expected: FAIL because the `journeys` collection is absent.

- [ ] **Step 3: Add the collection schema**

Append this collection to `src/content.config.ts` and include it in `collections`:

```ts
const journeys = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: './src/content/journeys',
    generateId: ({ data }) => `${data.lang}:${data.slug}`,
  }),
  schema: z.object({
    slug: z.string().min(1),
    lang: z.enum(['zh', 'en']),
    title: z.string().min(1),
    description: z.string().min(1),
    draft: z.boolean().default(false),
    order: z.number().int().default(0),
    steps: z
      .array(
        z.object({
          postId: z.string().min(1),
          label: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
        }),
      )
      .min(2),
  }),
});
```

- [ ] **Step 4: Add the two publishable journey examples**

Create `src/content/journeys/build-this-site.zh.json`:

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

Create `src/content/journeys/site-notes.en.json`:

```json
{
  "slug": "site-notes",
  "lang": "en",
  "title": "Notes From This Site",
  "description": "Two short stops through the first experiments on this site.",
  "draft": false,
  "order": 1,
  "steps": [
    { "postId": "hello-world.en", "label": "Start with hello" },
    { "postId": "an-experiment", "label": "Try one small experiment" }
  ]
}
```

- [ ] **Step 5: Add the CMS collection**

Append a folder collection to `public/admin/config.yml`:

```yaml
  - name: journeys
    label: 阅读任务线
    folder: src/content/journeys
    create: true
    delete: true
    extension: json
    format: json
    identifier_field: slug
    summary: '{{title}}（{{lang}}）'
    sortable_fields: [order, title]
    fields:
      - { label: 标识 slug, name: slug, widget: string }
      - { label: 语言, name: lang, widget: select, options: [{ label: 中文, value: zh }, { label: English, value: en }], default: zh }
      - { label: 标题, name: title, widget: string }
      - { label: 简介, name: description, widget: text }
      - { label: 草稿, name: draft, widget: boolean, default: false }
      - { label: 排序, name: order, widget: number, value_type: int, default: 0 }
      - label: 阅读步骤
        name: steps
        widget: list
        fields:
          - { label: 文章 ID, name: postId, widget: string }
          - { label: 章节名（可空，默认文章标题）, name: label, widget: string, required: false }
```

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm test -- tests/journeys.test.ts`

Expected: PASS.

```bash
git add src/content.config.ts src/content/journeys public/admin/config.yml tests/journeys.test.ts
git commit -m "feat(content): add reading journey collection"
```

### Task 2: Build the Pure Journey Resolver and Progress Selectors

**Files:**
- Create: `src/lib/journeys.ts`
- Modify: `tests/journeys.test.ts`

**Interfaces:**

```ts
export const JOURNEY_COMPLETION_PERCENT = 90;

export interface JourneyPost {
  id: string;
  lang: JourneyLang;
  title: string;
  href: string;
}

export interface JourneyStep {
  index: number;
  postId: string;
  label: string;
  title: string;
  href: string;
}

export interface Journey {
  id: string;
  slug: string;
  lang: JourneyLang;
  title: string;
  description: string;
  draft: boolean;
  order: number;
  steps: JourneyStep[];
}

export type JourneyState = 'completed' | 'in-progress' | 'not-started';

export interface JourneyStepProgress extends JourneyStep {
  progress: number;
  completed: boolean;
  active: boolean;
}

export interface JourneyProgress {
  journey: Journey;
  state: JourneyState;
  completedCount: number;
  total: number;
  nextStep: JourneyStepProgress | null;
  activeStep: JourneyStepProgress | null;
  lastActivityAt: number;
  completedAt: number | null;
  steps: JourneyStepProgress[];
}

export function resolveJourneys(inputs: JourneyInput[], posts: JourneyPost[]): Journey[];
export function selectPublishedJourneys(journeys: Journey[], lang: JourneyLang): Journey[];
export function selectJourneysForPost(journeys: Journey[], postId: string): Journey[];
export function computeJourneyProgress(
  journey: Journey,
  history: ReadingRecord[],
): JourneyProgress;
export function selectHomeJourney(
  journeys: Journey[],
  history: ReadingRecord[],
  lang: JourneyLang,
): JourneyProgress | null;
```

- Consumes: `JourneyInput` from the content collection and `ReadingRecord` from `src/lib/personal-library.ts`.
- Produces: A deterministic resolver plus all progress/selection logic used by every UI component.

- [ ] **Step 1: Add failing resolver tests**

Append tests covering valid sorting, drafts, language isolation, duplicate slugs, duplicate post IDs, short routes, unpublished references, and explicit error text.

```ts
import {
  computeJourneyProgress,
  resolveJourneys,
  selectHomeJourney,
  selectJourneysForPost,
  selectPublishedJourneys,
  type JourneyInput,
  type JourneyPost,
} from '../src/lib/journeys';
import type { ReadingRecord } from '../src/lib/personal-library';

const posts: JourneyPost[] = [
  { id: 'a', lang: 'zh', title: 'A', href: '/zh/posts/a/' },
  { id: 'b', lang: 'zh', title: 'B', href: '/zh/posts/b/' },
  { id: 'c', lang: 'zh', title: 'C', href: '/zh/posts/c/' },
  { id: 'en-a', lang: 'en', title: 'EN A', href: '/en/posts/en-a/' },
  { id: 'en-b', lang: 'en', title: 'EN B', href: '/en/posts/en-b/' },
];

const input = (overrides: Partial<JourneyInput> = {}): JourneyInput => ({
  slug: 'site',
  lang: 'zh',
  title: 'Site',
  description: 'A route',
  draft: false,
  order: 1,
  steps: [{ postId: 'a' }, { postId: 'b' }],
  ...overrides,
});

describe('resolveJourneys', () => {
  it('resolves labels, hrefs, ids, and order/slug sorting', () => {
    const journeys = resolveJourneys(
      [
        input({ slug: 'zeta', order: 2 }),
        input({ slug: 'beta', order: 1, steps: [{ postId: 'b' }, { postId: 'c', label: 'Third' }] }),
        input({ slug: 'alpha', order: 1 }),
      ],
      posts,
    );
    expect(journeys.map((item) => item.id)).toEqual([
      'zh:alpha',
      'zh:beta',
      'zh:zeta',
    ]);
    expect(journeys[1].steps[1]).toMatchObject({
      index: 1,
      postId: 'c',
      label: 'Third',
      title: 'C',
      href: '/zh/posts/c/',
    });
  });

  it('keeps drafts resolved but removes them from published selectors', () => {
    const journeys = resolveJourneys([input({ draft: true })], posts);
    expect(journeys).toHaveLength(1);
    expect(selectPublishedJourneys(journeys, 'zh')).toEqual([]);
  });

  it('rejects invalid routes with stable actionable errors', () => {
    expect(() => resolveJourneys([input({ steps: [{ postId: 'a' }] })], posts)).toThrow(
      'zh:site step 0: journey must contain at least 2 steps',
    );
    expect(() =>
      resolveJourneys([input({ steps: [{ postId: 'a' }, { postId: 'a' }] })], posts),
    ).toThrow('zh:site step 1: duplicate postId "a"');
    expect(() =>
      resolveJourneys([input({ steps: [{ postId: 'a' }, { postId: 'missing' }] })], posts),
    ).toThrow('zh:site step 1: invalid postId "missing"');
    expect(() =>
      resolveJourneys([input({ steps: [{ postId: 'a' }, { postId: 'en-b' }] })], posts),
    ).toThrow('zh:site step 1: postId "en-b" belongs to en');
    expect(() => resolveJourneys([input(), input()], posts)).toThrow(
      'duplicate journey slug "zh:site"',
    );
  });
});

describe('journey progress', () => {
  const journey = resolveJourneys(
    [input({ steps: [{ postId: 'a' }, { postId: 'b' }, { postId: 'c' }] })],
    posts,
  )[0];
  const reading = (id: string, progress: number, updatedAt: number): ReadingRecord => ({
    id,
    lang: 'zh',
    title: id.toUpperCase(),
    href: `/zh/posts/${id}/`,
    progress,
    updatedAt,
  });

  it('uses the 90 percent boundary and ignores other languages', () => {
    const result = computeJourneyProgress(journey, [
      reading('a', 89, 100),
      { ...reading('b', 100, 200), lang: 'en' },
    ]);
    expect(result.completedCount).toBe(0);
    expect(result.nextStep?.postId).toBe('a');
    expect(result.activeStep?.postId).toBe('a');
    expect(result.state).toBe('in-progress');

    const completed = computeJourneyProgress(journey, [reading('a', 90, 100)]);
    expect(completed.steps[0].completed).toBe(true);
    expect(completed.nextStep?.postId).toBe('b');
  });

  it('uses the newest incomplete step as active and the first incomplete as next', () => {
    const result = computeJourneyProgress(journey, [
      reading('a', 100, 100),
      reading('c', 30, 500),
      reading('b', 20, 400),
    ]);
    expect(result.nextStep?.postId).toBe('b');
    expect(result.activeStep?.postId).toBe('c');
    expect(result.state).toBe('in-progress');
  });

  it('reports completion and the latest completion timestamp', () => {
    const result = computeJourneyProgress(journey, [
      reading('a', 90, 100),
      reading('b', 100, 300),
      reading('c', 95, 200),
    ]);
    expect(result.state).toBe('completed');
    expect(result.nextStep).toBeNull();
    expect(result.completedAt).toBe(300);
  });
});

describe('home journey selection', () => {
  const journeys = resolveJourneys(
    [
      input({ slug: 'started', order: 2 }),
      input({ slug: 'untouched', order: 1, steps: [{ postId: 'b' }, { postId: 'c' }] }),
    ],
    posts,
  );

  it('prefers a started incomplete route, then order/slug', () => {
    const selected = selectHomeJourney(
      journeys,
      [{ id: 'b', lang: 'zh', title: 'B', href: '/zh/posts/b/', progress: 30, updatedAt: 500 }],
      'zh',
    );
    expect(selected?.journey.id).toBe('zh:untouched');
  });

  it('returns the first untouched route when nothing is started', () => {
    const selected = selectHomeJourney(journeys, [], 'zh');
    expect(selected?.journey.id).toBe('zh:untouched');
  });

  it('finds every published route containing an article', () => {
    expect(selectJourneysForPost(journeys, 'b').map((item) => item.id)).toEqual([
      'zh:untouched',
      'zh:started',
    ]);
  });
});
```

- [ ] **Step 2: Run the resolver tests and verify RED**

Run: `npm test -- tests/journeys.test.ts`

Expected: FAIL because `src/lib/journeys.ts` does not exist.

- [ ] **Step 3: Implement the pure module**

Use the exported interfaces above. Implement validation before resolving, with these exact rules:

```ts
const key = journeyKey(input.lang, input.slug);
if (input.steps.length < 2) {
  throw new Error(`${key} step 0: journey must contain at least 2 steps`);
}
for (const [index, step] of input.steps.entries()) {
  if (seenPostIds.has(step.postId)) {
    throw new Error(`${key} step ${index}: duplicate postId "${step.postId}"`);
  }
  const post = postsById.get(postKey(input.lang, step.postId));
  if (!post) {
    const otherLanguage = posts.find(
      (candidate) => candidate.id === step.postId && candidate.lang !== input.lang,
    )?.lang;
    throw new Error(
      otherLanguage
        ? `${key} step ${index}: postId "${step.postId}" belongs to ${otherLanguage}`
        : `${key} step ${index}: invalid postId "${step.postId}"`,
    );
  }
}
```

Resolve `label` to `step.label?.trim() || post.title`, store a zero-based `index`, and return a new sorted copy. `selectPublishedJourneys` filters `!draft` and language; the same filter applies inside `computeJourneyProgress` inputs are already resolved.

For progress, use `history` keyed by `${lang}:${id}`. Clamp stored progress to `0..100`, treat missing history as `0`, and calculate:

```ts
const steps = journey.steps.map((step) => {
  const record = recordsByKey.get(`${journey.lang}:${step.postId}`);
  const progress = record ? Math.min(100, Math.max(0, record.progress)) : 0;
  return { ...step, progress, completed: progress >= JOURNEY_COMPLETION_PERCENT, active: false };
});
const nextStep = steps.find((step) => !step.completed) ?? null;
const activeCandidate = steps
  .filter((step) => !step.completed && step.progress > 0)
  .sort((a, b) => {
    const aTime = recordFor(a.postId)?.updatedAt ?? 0;
    const bTime = recordFor(b.postId)?.updatedAt ?? 0;
    return bTime - aTime || a.index - b.index;
  })[0] ?? nextStep;
if (activeCandidate) activeCandidate.active = true;
```

`lastActivityAt` is the maximum `updatedAt` of same-language records with positive progress. `completedAt` is the maximum `updatedAt` of completed chapter records or `null`. `state` is `completed`, `in-progress`, or `not-started` in that order.

`selectHomeJourney` filters published journeys, computes progress for every route, then chooses:

1. An `in-progress` route with the highest `lastActivityAt`, tie-broken by `order`, `slug`.
2. Otherwise the first `not-started` route by `order`, `slug`.
3. Otherwise the completed route with the highest `completedAt`, tie-broken by `order`, `slug`.

- [ ] **Step 4: Run the resolver tests and verify GREEN**

Run: `npm test -- tests/journeys.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/journeys.ts tests/journeys.test.ts
git commit -m "feat(journeys): resolve routes and reading progress"
```

### Task 3: Render the Journey Page and Shared Cards

**Files:**
- Create: `src/components/QuestTrailCard.astro`
- Create: `src/components/JourneyList.astro`
- Create: `src/components/QuestRouteNav.astro`
- Create: `src/pages/[lang]/quests.astro`
- Modify: `src/consts.ts`
- Create: `tests/quests-ui.test.ts`

**Interfaces:**

- `QuestTrailCard` consumes `{ lang: Lang; journeys: Journey[] }` and renders one fallback card for the first route.
- `JourneyList` consumes `{ lang: Lang; journeys: Journey[] }` and renders every published route.
- `QuestRouteNav` consumes `{ lang: Lang; journeys: Journey[]; postId: string }` and renders one compact route for each match.
- `quests.astro` loads `journeys` entries, maps entry data to `JourneyInput`, loads current-language `getPosts(lang)`, resolves, filters published, and renders `JourneyList`.

Both client scripts embed escaped JSON in `data-*`, parse it defensively, use `textContent`, listen for the personal-library storage key, and recompute with `selectHomeJourney`/`computeJourneyProgress`.

- [ ] **Step 1: Add failing UI/page tests**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const card = existsSync('src/components/QuestTrailCard.astro')
  ? readFileSync('src/components/QuestTrailCard.astro', 'utf8')
  : '';
const list = existsSync('src/components/JourneyList.astro')
  ? readFileSync('src/components/JourneyList.astro', 'utf8')
  : '';
const route = existsSync('src/components/QuestRouteNav.astro')
  ? readFileSync('src/components/QuestRouteNav.astro', 'utf8')
  : '';
const page = existsSync('src/pages/[lang]/quests.astro')
  ? readFileSync('src/pages/[lang]/quests.astro', 'utf8')
  : '';
const consts = readFileSync('src/consts.ts', 'utf8');

describe('quest UI', () => {
  it('adds paired quest copy', () => {
    for (const key of [
      'quests',
      'questTrail',
      'nextQuest',
      'questProgress',
      'questContinue',
      'questOverview',
      'questPrevious',
      'questNext',
      'questEmpty',
      'questCompleted',
      'questInProgress',
      'questNotStarted',
    ]) expect(consts.match(new RegExp(`${key}:`, 'g'))?.length).toBe(2);
  });

  it('renders the home card with a local-only enhancement root', () => {
    expect(card).toContain('data-quest-trail');
    expect(card).toContain('readPersonalLibrary');
    expect(card).toContain('selectHomeJourney');
    expect(card).toContain('textContent');
    expect(card).toContain('withBase');
  });

  it('renders every route and route navigation safely', () => {
    expect(list).toContain('data-journey-list');
    expect(list).toContain('computeJourneyProgress');
    expect(route).toContain('data-quest-route');
    expect(route).toContain('data-post-id={postId}');
    expect(route).toContain('aria-current');
    expect(route).not.toMatch(/\.innerHTML\s*=/);
  });

  it('generates both language quest pages from content', () => {
    expect(page).toContain("getCollection('journeys')");
    expect(page).toContain('resolveJourneys');
    expect(page).toContain('selectPublishedJourneys');
    expect(page).toContain('<JourneyList');
    expect(page).toContain('getStaticPaths');
  });
});
```

- [ ] **Step 2: Run the UI tests and verify RED**

Run: `npm test -- tests/quests-ui.test.ts`

Expected: FAIL because the three components and page are absent.

- [ ] **Step 3: Add paired copy**

Add these exact keys to both UI maps in `src/consts.ts`:

| key | zh | en |
|---|---|---|
| `quests` | 阅读任务线 | Reading quests |
| `questTrail` | 下一段旅程 | Next quest |
| `nextQuest` | 下一关 | NEXT QUEST |
| `questProgress` | 已完成 {completed} / {total} | {completed} of {total} |
| `questContinue` | 继续这段旅程 | Continue this trail |
| `questOverview` | 查看全部任务线 | View all quests |
| `questPrevious` | 上一章 | Previous chapter |
| `questNext` | 下一章 | Next chapter |
| `questEmpty` | 这里还没有阅读任务线。 | No reading quests yet. |
| `questCompleted` | 已完成 | Complete |
| `questInProgress` | 进行中 | In progress |
| `questNotStarted` | 未开始 | Not started |
| `questCurrent` | 当前章节 | Current chapter |

- [ ] **Step 4: Build the static components**

`QuestTrailCard.astro` must render a single `<article data-quest-trail>` only when `journeys.length > 0`. Its initial server markup uses the first sorted journey and first step. Embed all journey data in an escaped `data-journeys` attribute. On `astro:page-load`, parse data, call `readPersonalLibrary(getStorage())`, call `selectHomeJourney`, and update title, progress, state, next-step label, and href via `textContent`/`setAttribute`. Listen for `'storage'` only when `event.key === PERSONAL_LIBRARY_STORAGE_KEY`.

`JourneyList.astro` must render a grid of `<article data-journey-card>` cards. Each card contains:

```astro
<span data-journey-state>{UI[lang].questNotStarted}</span>
<h2>{journey.title}</h2>
<p>{journey.description}</p>
<span data-journey-progress>{UI[lang].questProgress.replace('{completed}', '0').replace('{total}', String(journey.steps.length))}</span>
<ol>
  {journey.steps.map((step) => (
    <li data-journey-step data-post-id={step.postId}>
      <span>{String(step.index + 1).padStart(2, '0')}</span>
      <a href={step.href}>{step.label}</a>
    </li>
  ))}
</ol>
```

The client script recomputes each route from history, updates the state class/label, completed count, per-step classes, and the active step. It uses no `innerHTML`.

`QuestRouteNav.astro` filters routes with `selectJourneysForPost` in the frontmatter. Render only when matches exist. Each route card exposes `data-quest-route`, `data-journey-id`, and `data-current-post-id`; display current chapter index, previous and next anchors, and a quest-overview link. The script recomputes progress and updates the progress label and completed markers; route order and anchor targets remain server-rendered.

- [ ] **Step 5: Build the quest page**

Use the same language route pattern as the archive page. The frontmatter must:

```ts
import { getCollection } from 'astro:content';
import { getPosts } from '../../lib/posts';
import { resolveJourneys, selectPublishedJourneys, type JourneyInput } from '../../lib/journeys';

const entries = (await getCollection('journeys'))
  .filter((entry) => entry.data.lang === lang)
  .map((entry) => entry.data as JourneyInput);
const posts = await getPosts(lang);
const journeys = selectPublishedJourneys(
  resolveJourneys(entries, posts.map((post) => ({
    id: post.id,
    lang,
    title: post.data.title,
    href: postHref(lang, post.id),
  }))),
  lang,
);
```

The page uses `BaseLayout`, a `SectionTitle`, a short intro, and `JourneyList`. Render the empty state when no published route exists. Keep all links through `withBase()` or hrefs already generated by `postHref()`.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- tests/quests-ui.test.ts tests/journeys.test.ts`

Expected: PASS.

```bash
git add src/components/QuestTrailCard.astro src/components/JourneyList.astro src/components/QuestRouteNav.astro 'src/pages/[lang]/quests.astro' src/consts.ts tests/quests-ui.test.ts
git commit -m "feat(quests): add journey pages and navigation cards"
```

### Task 4: Integrate Home, Article, Archive, and Build Gates

**Files:**
- Modify: `src/pages/[lang]/index.astro`
- Modify: `src/pages/[lang]/archive.astro`
- Modify: `src/pages/[lang]/posts/[...id].astro`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `scripts/check-frontend.mjs`
- Modify: `tests/frontend-readiness.test.ts`
- Modify: `tests/quests-ui.test.ts`

**Interfaces:**

- Home receives resolved published journeys and renders `QuestTrailCard` after `PersonalShelf` and before `#latest`.
- The article route passes current-post route matches to `PostLayout`; `PostLayout` renders `QuestRouteNav` immediately before `post-related`.
- Archive renders a compact quest link only when published routes exist.
- Frontend readiness treats both quest pages as required output.

- [ ] **Step 1: Extend the failing integration tests**

Append assertions to `tests/quests-ui.test.ts` for the exact DOM order:

```ts
const home = readFileSync('src/pages/[lang]/index.astro', 'utf8');
const archive = readFileSync('src/pages/[lang]/archive.astro', 'utf8');
const postPage = readFileSync('src/pages/[lang]/posts/[...id].astro', 'utf8');
const layout = readFileSync('src/layouts/PostLayout.astro', 'utf8');

expect(home.indexOf('<PersonalShelf')).toBeLessThan(home.indexOf('<QuestTrailCard'));
expect(home.indexOf('<QuestTrailCard')).toBeLessThan(home.indexOf('<section id="latest"'));
expect(home).toContain('<QuestTrailCard');
expect(postPage).toContain('journeys');
expect(layout).toContain('<QuestRouteNav');
expect(layout.indexOf('<QuestRouteNav')).toBeLessThan(layout.indexOf('post-related'));
expect(archive).toContain('journeys.length > 0');
```

Add `'zh/quests/index.html'` and `'en/quests/index.html'` to both `required` and `REQUIRED` in the frontend checks.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/quests-ui.test.ts tests/frontend-readiness.test.ts`

Expected: FAIL because the integration points and required routes are absent.

- [ ] **Step 3: Integrate the home card**

In the home frontmatter, load journeys for `lang`, resolve with the already-created current-language post catalog, filter drafts, and render:

```astro
<PersonalShelf lang={lang} catalog={personalCatalog} />
{journeys.length > 0 && <QuestTrailCard lang={lang} journeys={journeys} />}
<section id="latest">…</section>
```

Do not render an empty wrapper when there are no journeys.

- [ ] **Step 4: Integrate article route navigation**

In the post page frontmatter, load current-language journeys, resolve against the current-language published posts, filter drafts, and compute `postJourneys = selectJourneysForPost(journeys, post.id)`. Pass `journeys={postJourneys}` and `postId={post.id}` into `PostLayout`.

Add an optional `journeys` prop to `PostLayout`, import `QuestRouteNav`, and render it immediately before the `post-related` section. The route nav must be absent when the prop is empty.

- [ ] **Step 5: Add the archive link**

Resolve published routes in the archive frontmatter. Inside the heading area render:

```astro
{journeys.length > 0 && (
  <a class="archive-quest-link" href={withBase(`${lang}/quests/`)}>
    {UI[lang].questOverview}
  </a>
)}
```

Style it as a compact inline pixel link with a 44px minimum touch target, and keep it in normal flow.

- [ ] **Step 6: Update build gates and commit**

Run: `npm test -- tests/quests-ui.test.ts tests/frontend-readiness.test.ts`

Expected: PASS.

```bash
git add 'src/pages/[lang]/index.astro' 'src/pages/[lang]/archive.astro' 'src/pages/[lang]/posts/[...id].astro' src/layouts/PostLayout.astro scripts/check-frontend.mjs tests/frontend-readiness.test.ts tests/quests-ui.test.ts
git commit -m "feat(quests): integrate routes across the site"
```

### Task 5: Verify the Complete Quest Slice

**Files:**
- Verify only; change code only for a real failing requirement.

- [ ] **Step 1: Run static and unit checks**

Run: `npm run check`

Run: `npm test`

Run: `npm run check:content`

Run: `npm run check:cms-config`

Expected: all commands exit 0. If `check:cms-config` reports missing Playwright, record it as an environment prerequisite and continue the other checks.

- [ ] **Step 2: Build and run frontend gates**

Run: `npm run verify:frontend`

Expected: exit 0, with both quest pages present in `dist`.

- [ ] **Step 3: Inspect generated HTML and final diff**

Run: `Select-String -Pattern 'data-quest-trail|data-journey-card|data-quest-route' dist/zh/index.html dist/en/index.html dist/zh/quests/index.html dist/en/quests/index.html`

Run: `git diff --check`

Run: `git status --short`

Expected: the HTML contains server-rendered journey structure, no whitespace errors, and only planned files changed.

