import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  existsSync(path) ? readFileSync(path, 'utf8') : '';

const card = read('src/components/QuestTrailCard.astro');
const list = read('src/components/JourneyList.astro');
const route = read('src/components/QuestRouteNav.astro');
const page = read('src/pages/[lang]/quests.astro');
const home = read('src/pages/[lang]/index.astro');
const archive = read('src/pages/[lang]/archive.astro');
const postPage = read('src/pages/[lang]/posts/[...id].astro');
const layout = read('src/layouts/PostLayout.astro');
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
    expect(card).toContain('readPersonalLibrary(getStorage()).history');
    expect(card).toMatch(
      /addEventListener\(\s*PERSONAL_LIBRARY_CHANGE_EVENT/,
    );
    expect(card).toMatch(/import\s+\{\s*UI[^}]*\}\s+from\s+'\.\.\/consts'/);
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
    expect(list).toContain('readPersonalLibrary(getStorage()).history');
    expect(list).toMatch(
      /addEventListener\(\s*PERSONAL_LIBRARY_CHANGE_EVENT/,
    );
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
    expect(route).toContain('readPersonalLibrary(getStorage()).history');
    expect(route).toMatch(
      /addEventListener\(\s*PERSONAL_LIBRARY_CHANGE_EVENT/,
    );
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

  it('integrates quests across home, archive, and article routes', () => {
    expect(home.indexOf('<PersonalShelf')).toBeLessThan(
      home.indexOf('<QuestTrailCard'),
    );
    expect(home.indexOf('<QuestTrailCard')).toBeLessThan(
      home.indexOf('<section id="latest"'),
    );
    expect(home).toContain('<QuestTrailCard');
    expect(postPage).toContain('journeys');
    expect(layout).toContain('<QuestRouteNav');
    expect(layout.indexOf('<QuestRouteNav')).toBeLessThan(
      layout.indexOf('post-related'),
    );
    expect(archive).toContain('journeys.length > 0');
  });
});
