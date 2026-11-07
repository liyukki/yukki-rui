import type { ReadingRecord } from './personal-library';

export type JourneyLang = 'zh' | 'en';

export const JOURNEY_COMPLETION_PERCENT = 90;

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

export function journeyKey(lang: JourneyLang, slug: string): string {
  return `${lang}:${slug}`;
}

function compareJourneyOrder(
  a: Pick<Journey, 'order' | 'slug'>,
  b: Pick<Journey, 'order' | 'slug'>,
): number {
  return a.order - b.order || a.slug.localeCompare(b.slug);
}

/**
 * Validate and resolve content references before any page renders.
 *
 * Draft journeys intentionally pass through the same checks. Callers use
 * `selectPublishedJourneys` only after this resolver succeeds.
 */
export function resolveJourneys(
  inputs: JourneyInput[],
  posts: JourneyPost[],
): Journey[] {
  const postsById = new Map<string, JourneyPost>();
  for (const post of posts) {
    postsById.set(journeyKey(post.lang, post.id), post);
  }

  const seenJourneys = new Set<string>();
  const journeys: Journey[] = [];

  for (const input of inputs) {
    const id = journeyKey(input.lang, input.slug);
    if (seenJourneys.has(id)) {
      throw new Error(`duplicate journey slug "${id}"`);
    }
    seenJourneys.add(id);

    if (input.steps.length < 2) {
      throw new Error(`${id} step 0: journey must contain at least 2 steps`);
    }

    const seenPostIds = new Set<string>();
    const steps = input.steps.map((step, index): JourneyStep => {
      if (seenPostIds.has(step.postId)) {
        throw new Error(`${id} step ${index}: duplicate postId "${step.postId}"`);
      }
      seenPostIds.add(step.postId);

      const post = postsById.get(journeyKey(input.lang, step.postId));
      if (!post) {
        const otherLanguage = posts.find(
          (candidate) =>
            candidate.id === step.postId && candidate.lang !== input.lang,
        )?.lang;
        throw new Error(
          otherLanguage
            ? `${id} step ${index}: postId "${step.postId}" belongs to ${otherLanguage}`
            : `${id} step ${index}: invalid postId "${step.postId}"`,
        );
      }

      return {
        index,
        postId: post.id,
        label: step.label?.trim() || post.title,
        title: post.title,
        href: post.href,
      };
    });

    journeys.push({
      id,
      slug: input.slug,
      lang: input.lang,
      title: input.title,
      description: input.description,
      draft: input.draft ?? false,
      order: input.order ?? 0,
      steps,
    });
  }

  return journeys.sort(compareJourneyOrder);
}

export function selectPublishedJourneys(
  journeys: Journey[],
  lang: JourneyLang,
): Journey[] {
  return journeys
    .filter((journey) => !journey.draft && journey.lang === lang)
    .sort(compareJourneyOrder);
}

export function selectJourneysForPost(
  journeys: Journey[],
  postId: string,
): Journey[] {
  return journeys
    .filter(
      (journey) =>
        !journey.draft && journey.steps.some((step) => step.postId === postId),
    )
    .sort(compareJourneyOrder);
}

function clampProgress(progress: number): number {
  return Math.min(100, Math.max(0, progress));
}

function readingByPost(history: ReadingRecord[], lang: JourneyLang): Map<string, ReadingRecord> {
  const records = new Map<string, ReadingRecord>();
  for (const record of history) {
    if (record.lang !== lang) continue;
    const existing = records.get(record.id);
    if (!existing || record.updatedAt >= existing.updatedAt) {
      records.set(record.id, record);
    }
  }
  return records;
}

export function computeJourneyProgress(
  journey: Journey,
  history: ReadingRecord[],
): JourneyProgress {
  const records = readingByPost(history, journey.lang);
  const steps = journey.steps.map((step): JourneyStepProgress => {
    const record = records.get(step.postId);
    const progress = record ? clampProgress(record.progress) : 0;
    return {
      ...step,
      progress,
      completed: progress >= JOURNEY_COMPLETION_PERCENT,
      active: false,
    };
  });

  const nextStep = steps.find((step) => !step.completed) ?? null;
  const started = steps
    .filter((step) => !step.completed && step.progress > 0)
    .sort((a, b) => {
      const aTime = records.get(a.postId)?.updatedAt ?? 0;
      const bTime = records.get(b.postId)?.updatedAt ?? 0;
      return bTime - aTime || a.index - b.index;
    });
  const activeStep = started[0] ?? nextStep;
  if (activeStep) activeStep.active = true;

  const activityTimes = steps
    .filter((step) => step.progress > 0)
    .map((step) => records.get(step.postId)?.updatedAt ?? 0);
  const lastActivityAt = activityTimes.length > 0 ? Math.max(...activityTimes) : 0;

  const completedTimes = steps
    .filter((step) => step.completed)
    .map((step) => records.get(step.postId)?.updatedAt ?? 0);
  const completedAt = completedTimes.length > 0 ? Math.max(...completedTimes) : null;
  const completedCount = steps.filter((step) => step.completed).length;
  const state: JourneyState =
    completedCount === steps.length
      ? 'completed'
      : lastActivityAt > 0
        ? 'in-progress'
        : 'not-started';

  return {
    journey,
    state,
    completedCount,
    total: steps.length,
    nextStep,
    activeStep,
    lastActivityAt,
    completedAt,
    steps,
  };
}

export function selectHomeJourney(
  journeys: Journey[],
  history: ReadingRecord[],
  lang: JourneyLang,
): JourneyProgress | null {
  const progress = selectPublishedJourneys(journeys, lang).map((journey) =>
    computeJourneyProgress(journey, history),
  );
  if (progress.length === 0) return null;

  const byOrder = (a: JourneyProgress, b: JourneyProgress): number =>
    compareJourneyOrder(a.journey, b.journey);

  const started = progress
    .filter((item) => item.state === 'in-progress')
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt || byOrder(a, b));
  if (started[0]) return started[0];

  const untouched = progress
    .filter((item) => item.state === 'not-started')
    .sort(byOrder);
  if (untouched[0]) return untouched[0];

  return progress
    .filter((item) => item.state === 'completed')
    .sort(
      (a, b) =>
        (b.completedAt ?? 0) - (a.completedAt ?? 0) || byOrder(a, b),
    )[0] ?? null;
}
