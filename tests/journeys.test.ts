import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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

const contentConfig = readFileSync('src/content.config.ts', 'utf8');
const cms = readFileSync('public/admin/config.yml', 'utf8');

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

const reading = (id: string, progress: number, updatedAt: number): ReadingRecord => ({
  id,
  lang: 'zh',
  title: id.toUpperCase(),
  href: `/zh/posts/${id}/`,
  progress,
  updatedAt,
});

describe('journeys content contract', () => {
  it('registers the collection with stable language-slug ids and bounded steps', () => {
    expect(contentConfig).toContain('const journeys = defineCollection');
    expect(contentConfig).toContain("pattern: '**/*.json'");
    expect(contentConfig).toContain("base: './src/content/journeys'");
    expect(contentConfig).toContain('`${data.lang}:${data.slug}`');
    expect(contentConfig).toContain('steps: z');
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

describe('resolveJourneys', () => {
  it('resolves labels, hrefs, ids, and order/slug sorting', () => {
    const journeys = resolveJourneys(
      [
        input({ slug: 'zeta', order: 2 }),
        input({
          slug: 'beta',
          order: 1,
          steps: [{ postId: 'b' }, { postId: 'c', label: 'Third' }],
        }),
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

  it('validates one language at a time without blocking an equivalent slug elsewhere', () => {
    const journeys = resolveJourneys(
      [
        input({ slug: 'shared' }),
        input({
          slug: 'shared',
          lang: 'en',
          steps: [{ postId: 'en-a' }, { postId: 'en-b' }],
        }),
      ],
      posts,
    );

    expect(selectPublishedJourneys(journeys, 'zh').map((item) => item.id)).toEqual([
      'zh:shared',
    ]);
    expect(selectPublishedJourneys(journeys, 'en').map((item) => item.id)).toEqual([
      'en:shared',
    ]);
  });

  it('rejects invalid routes with stable actionable errors', () => {
    expect(() =>
      resolveJourneys([input({ steps: [{ postId: 'a' }] })], posts),
    ).toThrow('zh:site step 0: journey must contain at least 2 steps');

    expect(() =>
      resolveJourneys(
        [input({ steps: [{ postId: 'a' }, { postId: 'a' }] })],
        posts,
      ),
    ).toThrow('zh:site step 1: duplicate postId "a"');

    expect(() =>
      resolveJourneys(
        [input({ steps: [{ postId: 'a' }, { postId: 'missing' }] })],
        posts,
      ),
    ).toThrow('zh:site step 1: invalid postId "missing"');

    expect(() =>
      resolveJourneys(
        [input({ steps: [{ postId: 'a' }, { postId: 'en-b' }] })],
        posts,
      ),
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
    expect(result.steps.find((step) => step.active)?.postId).toBe('c');
    expect(result.state).toBe('in-progress');
  });

  it('uses nextStep as the active fallback when no chapter has started', () => {
    const result = computeJourneyProgress(journey, []);

    expect(result.nextStep?.postId).toBe('a');
    expect(result.activeStep?.postId).toBe('a');
    expect(result.state).toBe('not-started');
  });

  it('reports completion and the latest completion timestamp', () => {
    const result = computeJourneyProgress(journey, [
      reading('a', 90, 100),
      reading('b', 100, 300),
      reading('c', 95, 200),
    ]);

    expect(result.state).toBe('completed');
    expect(result.nextStep).toBeNull();
    expect(result.activeStep).toBeNull();
    expect(result.completedAt).toBe(300);
  });
});

describe('home journey selection', () => {
  const journeys = resolveJourneys(
    [
      input({ slug: 'started', order: 2 }),
      input({
        slug: 'untouched',
        order: 1,
        steps: [{ postId: 'b' }, { postId: 'c' }],
      }),
    ],
    posts,
  );

  it('prefers a started incomplete route, then order/slug', () => {
    const selected = selectHomeJourney(
      journeys,
      [reading('b', 30, 500)],
      'zh',
    );

    expect(selected?.journey.id).toBe('zh:untouched');
    expect(selected?.activeStep?.postId).toBe('b');
  });

  it('returns the first untouched route when nothing is started', () => {
    const selected = selectHomeJourney(journeys, [], 'zh');

    expect(selected?.journey.id).toBe('zh:untouched');
    expect(selected?.state).toBe('not-started');
  });

  it('returns the most recently completed route when all routes are complete', () => {
    const selected = selectHomeJourney(
      journeys,
      [
        reading('a', 100, 100),
        reading('b', 100, 200),
        reading('c', 100, 900),
      ],
      'zh',
    );

    expect(selected?.journey.id).toBe('zh:untouched');
    expect(selected?.completedAt).toBe(900);
  });

  it('finds every published route containing an article', () => {
    expect(selectJourneysForPost(journeys, 'b').map((item) => item.id)).toEqual([
      'zh:untouched',
      'zh:started',
    ]);
  });
});
