import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  existsSync(path) ? readFileSync(path, 'utf8') : '';

const card = read('src/components/QuestTrailCard.astro');
const list = read('src/components/JourneyList.astro');
const route = read('src/components/QuestRouteNav.astro');
const page = read('src/pages/[lang]/quests.astro');
const consts = readFileSync('src/consts.ts', 'utf8');

describe('quest UI contracts', () => {
  it('adds paired quest copy', () => {
    for (const key of [
      'quests',
      'questsHint',
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
      'questCurrent',
    ]) {
      expect(consts.match(new RegExp(`${key}:`, 'g'))?.length).toBe(2);
    }
  });

  it('server-renders a compact home card and enhances it from local history', () => {
    for (const token of [
      'data-quest-trail',
      'data-journeys',
      'data-journey-id',
      'data-progress',
      'data-state',
      'readPersonalLibrary',
      'selectHomeJourney',
      'PERSONAL_LIBRARY_STORAGE_KEY',
      "addEventListener('storage'",
      'textContent',
      'withBase',
    ]) {
      expect(card).toContain(token);
    }
    expect(card).not.toMatch(/\.innerHTML\s*=/);
  });

  it('renders a stable journey list before local progress enhancement', () => {
    for (const token of [
      'data-journey-list',
      'data-journey-card',
      'data-journey-step',
      'data-journey-state',
      'computeJourneyProgress',
      'readPersonalLibrary',
      'PERSONAL_LIBRARY_STORAGE_KEY',
      "addEventListener('storage'",
      'textContent',
    ]) {
      expect(list).toContain(token);
    }
    expect(list).not.toMatch(/\.innerHTML\s*=/);
  });

  it('renders one compact route per matching journey before enhancement', () => {
    for (const token of [
      'data-quest-route',
      'data-post-id={postId}',
      'data-progress',
      'data-current-step',
      'computeJourneyProgress',
      'questPrevious',
      'questNext',
      'questOverview',
      'aria-current',
      'withBase',
    ]) {
      expect(route).toContain(token);
    }
    expect(route).not.toMatch(/\.innerHTML\s*=/);
  });

  it('generates both language quest pages from validated content', () => {
    for (const token of [
      "getCollection('journeys')",
      'resolveJourneys',
      'selectPublishedJourneys',
      '<JourneyList',
      'getStaticPaths',
      '<BaseLayout',
      'withBase',
    ]) {
      expect(page).toContain(token);
    }
    expect(page).toContain('journeys.length === 0');
  });
});
