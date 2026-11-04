import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tracker = readFileSync('src/components/ReadingProgressTracker.astro', 'utf8');
const bookmark = readFileSync('src/components/PostBookmark.astro', 'utf8');
const layout = readFileSync('src/layouts/PostLayout.astro', 'utf8');
const consts = readFileSync('src/consts.ts', 'utf8');
const home = readFileSync('src/pages/[lang]/index.astro', 'utf8');
const shelf = existsSync('src/components/PersonalShelf.astro')
  ? readFileSync('src/components/PersonalShelf.astro', 'utf8')
  : '';

describe('reading progress tracker', () => {
  it('stores canonical post metadata on a hidden progressive-enhancement root', () => {
    for (const token of [
      'data-reading-tracker',
      'data-entry={JSON.stringify',
      'postId',
      'lang',
      'title',
      'href',
    ]) {
      expect(tracker).toContain(token);
    }
    expect(tracker).toMatch(/hidden/);
  });

  it('saves throttled reading progress through the personal-library domain', () => {
    for (const token of [
      "'scroll'",
      'requestAnimationFrame',
      "'pagehide'",
      "'visibilitychange'",
      "'astro:before-swap'",
      'recordReading',
      'writePersonalLibrary',
      'readPersonalLibrary',
    ]) {
      expect(tracker).toContain(token);
    }
    expect(tracker).not.toMatch(/\.innerHTML\s*=/);
  });

  it('guards browser storage access and avoids duplicate final writes', () => {
    expect(tracker).toContain('function getStorage');
    expect(tracker).not.toContain("signal.addEventListener('abort'");
    expect(tracker).not.toContain('flush(true)');
  });
});

describe('article bookmark control', () => {
  it('renders an accessible toggle with status feedback', () => {
    for (const token of [
      'data-post-bookmark',
      'data-bookmark-button',
      'data-bookmark-label',
      'data-bookmark-status',
      'aria-pressed="false"',
      'aria-live="polite"',
      'role="status"',
      'hidden',
    ]) {
      expect(bookmark).toContain(token);
    }
  });

  it('toggles local state and keeps text updates safe', () => {
    for (const token of [
      'toggleBookmark',
      'readPersonalLibrary',
      'writePersonalLibrary',
      'window.localStorage',
      "document.addEventListener('astro:page-load'",
      'bookmarkFailed',
    ]) {
      expect(bookmark).toContain(token);
    }
    expect(bookmark).not.toMatch(/\.innerHTML\s*=/);
    expect(bookmark).toMatch(/label\.textContent\s*=/);
    expect(bookmark).toMatch(/status\.textContent\s*=/);
  });

  it('guards browser storage access before reading or writing', () => {
    expect(bookmark).toContain('function getStorage');
    expect(bookmark).not.toMatch(/readPersonalLibrary\(window\.localStorage\)/);
    expect(bookmark).not.toMatch(/writePersonalLibrary\(window\.localStorage/);
  });
});

describe('article integration', () => {
  it('places progress and bookmark controls outside likes and sharing', () => {
    expect(layout).toContain(
      "import ReadingProgressTracker from '../components/ReadingProgressTracker.astro'",
    );
    expect(layout).toContain("import PostBookmark from '../components/PostBookmark.astro'");
    expect(layout).toContain('<ReadingProgressTracker');
    expect(layout).toContain('<PostBookmark');
    expect(layout.indexOf('<PostBookmark')).toBeLessThan(layout.indexOf('<PostLikes'));
    expect(layout.indexOf('<ReadingProgressTracker')).toBeLessThan(layout.indexOf('<PostLikes'));
  });

  it('keeps bookmark copy paired in both languages', () => {
    for (const key of [
      'bookmarkPost',
      'bookmarkedPost',
      'bookmarkSaved',
      'bookmarkRemoved',
      'bookmarkFailed',
    ]) {
      expect(consts.match(new RegExp(`${key}:`, 'g'))?.length).toBe(2);
    }
  });
});

describe('home personal shelf', () => {
  it('starts hidden and receives the current-language canonical catalog', () => {
    for (const token of [
      'data-personal-shelf',
      'data-catalog',
      'data-lang={lang}',
      'hidden',
      'JSON.stringify',
    ]) {
      expect(shelf).toContain(token);
    }
    expect(shelf).toContain('type CatalogEntry');
    expect(shelf).not.toMatch(/data-catalog=.*(?:javascript:|stored title)/i);
  });

  it('selects one resume entry and at most four bookmarks from local data', () => {
    for (const token of [
      'readPersonalLibrary',
      'selectContinueReading',
      'selectBookmarks',
      'selectBookmarks(library, catalog, lang, 4)',
      "'storage'",
      'PERSONAL_LIBRARY_STORAGE_KEY',
    ]) {
      expect(shelf).toContain(token);
    }
  });

  it('renders local records with DOM APIs instead of HTML injection', () => {
    for (const token of [
      "document.createElement('li')",
      "document.createElement('a')",
      'textContent',
      'replaceChildren',
    ]) {
      expect(shelf).toContain(token);
    }
    expect(shelf).toContain('function getStorage');
    expect(shelf).not.toMatch(/\.innerHTML\s*=/);
  });

  it('is integrated above the recent posts section', () => {
    expect(home).toContain("import PersonalShelf from '../../components/PersonalShelf.astro'");
    expect(home).toContain('<PersonalShelf');
    expect(home.indexOf('<PersonalShelf')).toBeLessThan(home.indexOf('<section id="latest"'));
    expect(home).toContain('catalog=');
  });

  it('keeps shelf copy paired in both languages', () => {
    for (const key of [
      'personalShelf',
      'continueReading',
      'bookmarks',
      'readingProgress',
    ]) {
      expect(consts.match(new RegExp(`${key}:`, 'g'))?.length).toBe(2);
    }
  });
});
