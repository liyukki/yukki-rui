import { describe, expect, it } from 'vitest';
import {
  PERSONAL_LIBRARY_STORAGE_KEY,
  emptyPersonalLibrary,
  normalizePersonalLibrary,
  readPersonalLibrary,
  recordReading,
  selectBookmarks,
  selectContinueReading,
  toggleBookmark,
  writePersonalLibrary,
  type BookmarkRecord,
  type CatalogEntry,
  type ReadingRecord,
} from '../src/lib/personal-library';

const catalog: CatalogEntry[] = [
  { id: 'alpha', lang: 'zh', title: 'Alpha', href: '/zh/posts/alpha/' },
  { id: 'beta', lang: 'zh', title: 'Beta', href: '/zh/posts/beta/' },
  { id: 'alpha', lang: 'en', title: 'Alpha EN', href: '/en/posts/alpha/' },
];

function reading(overrides: Partial<ReadingRecord> = {}): ReadingRecord {
  return {
    id: 'alpha',
    lang: 'zh',
    title: 'Alpha',
    href: '/zh/posts/alpha/',
    progress: 25,
    updatedAt: 100,
    ...overrides,
  };
}

function bookmark(overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  return {
    id: 'alpha',
    lang: 'zh',
    title: 'Alpha',
    href: '/zh/posts/alpha/',
    savedAt: 100,
    ...overrides,
  };
}

describe('normalizePersonalLibrary', () => {
  it('returns an empty library for malformed input', () => {
    expect(normalizePersonalLibrary(null)).toEqual(emptyPersonalLibrary());
    expect(normalizePersonalLibrary('bad')).toEqual(emptyPersonalLibrary());
    expect(normalizePersonalLibrary({ history: 'bad', bookmarks: 42 })).toEqual(
      emptyPersonalLibrary(),
    );
  });

  it('validates records, clamps progress and deduplicates by language and id', () => {
    const value = normalizePersonalLibrary({
      history: [
        reading({ progress: 140, updatedAt: 100 }),
        reading({ progress: -20, updatedAt: 200 }),
        reading({ id: '', updatedAt: 300 }),
        { ...reading(), lang: 'fr' },
        { ...reading(), progress: Number.NaN },
      ],
      bookmarks: [
        bookmark({ savedAt: 100 }),
        bookmark({ savedAt: 200 }),
        { ...bookmark(), href: '' },
      ],
    });

    expect(value.history).toHaveLength(1);
    expect(value.history[0]).toMatchObject({
      id: 'alpha',
      progress: 0,
      updatedAt: 200,
    });
    expect(value.bookmarks).toHaveLength(1);
    expect(value.bookmarks[0].savedAt).toBe(200);
  });

  it('caps history at 20 and bookmarks at 50', () => {
    const value = normalizePersonalLibrary({
      history: Array.from({ length: 25 }, (_, index) =>
        reading({ id: `post-${index}`, updatedAt: index }),
      ),
      bookmarks: Array.from({ length: 55 }, (_, index) =>
        bookmark({ id: `post-${index}`, savedAt: index }),
      ),
    });

    expect(value.history).toHaveLength(20);
    expect(value.bookmarks).toHaveLength(50);
    expect(value.history[0].updatedAt).toBe(24);
    expect(value.bookmarks[0].savedAt).toBe(54);
  });
});

describe('personal library storage', () => {
  it('reads valid storage and recovers from malformed JSON', () => {
    const valid = {
      getItem: () => JSON.stringify({ history: [reading()], bookmarks: [bookmark()] }),
    };
    expect(readPersonalLibrary(valid).history).toHaveLength(1);

    const broken = { getItem: () => '{not json' };
    expect(readPersonalLibrary(broken)).toEqual(emptyPersonalLibrary());
  });

  it('contains read and write failures', () => {
    const brokenRead = {
      getItem() {
        throw new Error('blocked');
      },
    };
    expect(readPersonalLibrary(brokenRead)).toEqual(emptyPersonalLibrary());
    expect(readPersonalLibrary(null)).toEqual(emptyPersonalLibrary());

    let saved = '';
    const working = {
      setItem(_key: string, value: string) {
        saved = value;
      },
    };
    expect(writePersonalLibrary(working, { history: [reading()], bookmarks: [] })).toBe(true);
    expect(JSON.parse(saved).history[0].id).toBe('alpha');

    const brokenWrite = {
      setItem() {
        throw new Error('blocked');
      },
    };
    expect(writePersonalLibrary(brokenWrite, emptyPersonalLibrary())).toBe(false);
    expect(writePersonalLibrary(null, emptyPersonalLibrary())).toBe(false);
    expect(PERSONAL_LIBRARY_STORAGE_KEY).toBe('yukki-personal-library-v1');
  });
});

describe('personal library mutations', () => {
  it('moves an updated reading record to the front without changing bookmarks', () => {
    const original = {
      history: [
        reading({ id: 'beta', updatedAt: 200 }),
        reading({ id: 'alpha', progress: 10, updatedAt: 100 }),
      ],
      bookmarks: [bookmark()],
    };

    const next = recordReading(original, reading({ progress: 65, updatedAt: 300 }));

    expect(next.history).toHaveLength(2);
    expect(next.history[0]).toMatchObject({
      id: 'alpha',
      progress: 65,
      updatedAt: 300,
    });
    expect(next.bookmarks).toEqual(original.bookmarks);
    expect(original.history[1].progress).toBe(10);
  });

  it('toggles a bookmark on and off', () => {
    const added = toggleBookmark(emptyPersonalLibrary(), bookmark());
    expect(added.bookmarks).toHaveLength(1);

    const removed = toggleBookmark(added, bookmark({ savedAt: 999 }));
    expect(removed.bookmarks).toHaveLength(0);
  });
});

describe('personal library selectors', () => {
  it('returns the newest incomplete current-language article with canonical metadata', () => {
    const value = {
      history: [
        reading({ id: 'beta', progress: 100, updatedAt: 400 }),
        reading({
          id: 'alpha',
          title: 'Stored title',
          href: 'javascript:alert(1)',
          progress: 45,
          updatedAt: 300,
        }),
        reading({ id: 'alpha', lang: 'en', progress: 10, updatedAt: 500 }),
      ],
      bookmarks: [],
    };

    expect(selectContinueReading(value, catalog, 'zh')).toMatchObject({
      id: 'alpha',
      title: 'Alpha',
      href: '/zh/posts/alpha/',
      progress: 45,
    });
  });

  it('returns only canonical current-language bookmarks in recency order', () => {
    const value = {
      history: [],
      bookmarks: [
        bookmark({ id: 'missing', savedAt: 500 }),
        bookmark({ id: 'alpha', lang: 'en', savedAt: 400 }),
        bookmark({
          id: 'alpha',
          title: 'Stored title',
          href: 'javascript:alert(1)',
          savedAt: 300,
        }),
        bookmark({ id: 'beta', savedAt: 200 }),
      ],
    };

    expect(selectBookmarks(value, catalog, 'zh', 4)).toMatchObject([
      { id: 'alpha', title: 'Alpha', href: '/zh/posts/alpha/' },
      { id: 'beta', title: 'Beta', href: '/zh/posts/beta/' },
    ]);
    expect(selectBookmarks(value, catalog, 'zh', 1)).toHaveLength(1);
  });
});
