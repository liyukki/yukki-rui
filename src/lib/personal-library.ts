/** Local-only reading history and bookmarks. No data leaves the browser. */

export type PersonalLibraryLang = 'zh' | 'en';

export interface ReadingRecord {
  id: string;
  lang: PersonalLibraryLang;
  title: string;
  href: string;
  progress: number;
  updatedAt: number;
  resumeAnchor?: string;
  resumeOffset?: number;
}

export interface BookmarkRecord {
  id: string;
  lang: PersonalLibraryLang;
  title: string;
  href: string;
  savedAt: number;
}

export interface PersonalLibrary {
  history: ReadingRecord[];
  bookmarks: BookmarkRecord[];
}

export interface CatalogEntry {
  id: string;
  lang: PersonalLibraryLang;
  title: string;
  href: string;
}

export const PERSONAL_LIBRARY_STORAGE_KEY = 'yukki-personal-library-v1';
export const PERSONAL_LIBRARY_HISTORY_LIMIT = 20;
export const PERSONAL_LIBRARY_BOOKMARK_LIMIT = 50;

const LANGUAGES: readonly PersonalLibraryLang[] = ['zh', 'en'];

export function emptyPersonalLibrary(): PersonalLibrary {
  return { history: [], bookmarks: [] };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function languageValue(value: unknown): PersonalLibraryLang | null {
  return typeof value === 'string' && LANGUAGES.includes(value as PersonalLibraryLang)
    ? (value as PersonalLibraryLang)
    : null;
}

function timestampValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}

function progressValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : null;
}

function resumeAnchorValue(value: unknown): string | null {
  return stringValue(value, 200);
}

function resumeOffsetValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(-1_000_000, Math.min(1_000_000, Math.round(value)))
    : null;
}

export function personalLibraryKey(lang: PersonalLibraryLang, id: string): string {
  return `${lang}:${id}`;
}

function normalizeReadingRecord(value: unknown): ReadingRecord | null {
  const record = asRecord(value);
  const id = stringValue(record.id, 200);
  const lang = languageValue(record.lang);
  const title = stringValue(record.title, 500);
  const href = stringValue(record.href, 2048);
  const progress = progressValue(record.progress);
  const updatedAt = timestampValue(record.updatedAt);
  if (!id || !lang || !title || !href || progress === null || updatedAt === null) return null;
  const normalized: ReadingRecord = { id, lang, title, href, progress, updatedAt };
  const resumeAnchor = resumeAnchorValue(record.resumeAnchor);
  const resumeOffset = resumeOffsetValue(record.resumeOffset);
  if (resumeAnchor !== null) normalized.resumeAnchor = resumeAnchor;
  if (resumeOffset !== null) normalized.resumeOffset = resumeOffset;
  return normalized;
}

function normalizeBookmarkRecord(value: unknown): BookmarkRecord | null {
  const record = asRecord(value);
  const id = stringValue(record.id, 200);
  const lang = languageValue(record.lang);
  const title = stringValue(record.title, 500);
  const href = stringValue(record.href, 2048);
  const savedAt = timestampValue(record.savedAt);
  if (!id || !lang || !title || !href || savedAt === null) return null;
  return { id, lang, title, href, savedAt };
}

function normalizeHistory(input: unknown): ReadingRecord[] {
  if (!Array.isArray(input)) return [];
  const records = new Map<string, ReadingRecord>();
  for (const candidate of input) {
    const record = normalizeReadingRecord(candidate);
    if (!record) continue;
    const key = personalLibraryKey(record.lang, record.id);
    const existing = records.get(key);
    if (!existing || record.updatedAt >= existing.updatedAt) records.set(key, record);
  }
  return [...records.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, PERSONAL_LIBRARY_HISTORY_LIMIT);
}

function normalizeBookmarks(input: unknown): BookmarkRecord[] {
  if (!Array.isArray(input)) return [];
  const records = new Map<string, BookmarkRecord>();
  for (const candidate of input) {
    const record = normalizeBookmarkRecord(candidate);
    if (!record) continue;
    const key = personalLibraryKey(record.lang, record.id);
    const existing = records.get(key);
    if (!existing || record.savedAt >= existing.savedAt) records.set(key, record);
  }
  return [...records.values()]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, PERSONAL_LIBRARY_BOOKMARK_LIMIT);
}

export function normalizePersonalLibrary(input: unknown): PersonalLibrary {
  const record = asRecord(input);
  return {
    history: normalizeHistory(record.history),
    bookmarks: normalizeBookmarks(record.bookmarks),
  };
}

export function readPersonalLibrary(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): PersonalLibrary {
  if (!storage) return emptyPersonalLibrary();
  try {
    return normalizePersonalLibrary(
      JSON.parse(storage.getItem(PERSONAL_LIBRARY_STORAGE_KEY) ?? 'null'),
    );
  } catch {
    return emptyPersonalLibrary();
  }
}

export function writePersonalLibrary(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  value: PersonalLibrary,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      PERSONAL_LIBRARY_STORAGE_KEY,
      JSON.stringify(normalizePersonalLibrary(value)),
    );
    return true;
  } catch {
    return false;
  }
}

export function recordReading(value: PersonalLibrary, record: ReadingRecord): PersonalLibrary {
  const current = normalizePersonalLibrary(value);
  const normalized = normalizeReadingRecord(record);
  if (!normalized) return current;
  const key = personalLibraryKey(normalized.lang, normalized.id);
  return normalizePersonalLibrary({
    history: [
      normalized,
      ...current.history.filter(
        (entry) => personalLibraryKey(entry.lang, entry.id) !== key,
      ),
    ],
    bookmarks: current.bookmarks,
  });
}

export function toggleBookmark(
  value: PersonalLibrary,
  bookmark: BookmarkRecord,
): PersonalLibrary {
  const current = normalizePersonalLibrary(value);
  const normalized = normalizeBookmarkRecord(bookmark);
  if (!normalized) return current;
  const key = personalLibraryKey(normalized.lang, normalized.id);
  const exists = current.bookmarks.some(
    (entry) => personalLibraryKey(entry.lang, entry.id) === key,
  );
  return normalizePersonalLibrary({
    history: current.history,
    bookmarks: exists
      ? current.bookmarks.filter(
          (entry) => personalLibraryKey(entry.lang, entry.id) !== key,
        )
      : [normalized, ...current.bookmarks],
  });
}

function catalogByKey(
  catalog: CatalogEntry[],
  lang: PersonalLibraryLang,
): Map<string, CatalogEntry> {
  const entries = new Map<string, CatalogEntry>();
  for (const candidate of catalog) {
    if (
      candidate.lang !== lang ||
      typeof candidate.id !== 'string' ||
      typeof candidate.title !== 'string' ||
      typeof candidate.href !== 'string'
    ) {
      continue;
    }
    const key = personalLibraryKey(lang, candidate.id);
    if (!entries.has(key)) entries.set(key, candidate);
  }
  return entries;
}

export function selectContinueReading(
  value: PersonalLibrary,
  catalog: CatalogEntry[],
  lang: PersonalLibraryLang,
): ReadingRecord | null {
  const current = normalizePersonalLibrary(value);
  const entries = catalogByKey(catalog, lang);
  for (const record of current.history) {
    if (record.lang !== lang || record.progress >= 100) continue;
    const canonical = entries.get(personalLibraryKey(lang, record.id));
    if (!canonical) continue;
    return {
      ...record,
      title: canonical.title,
      href: canonical.href,
    };
  }
  return null;
}

export function readingResumeHref(record: ReadingRecord): string {
  const normalized = normalizeReadingRecord(record);
  const href = normalized?.href ?? record.href;
  const progress = normalized?.progress ?? progressValue(record.progress) ?? 0;
  const hashIndex = href.indexOf('#');
  const hrefWithoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const separator = hrefWithoutHash.includes('?') ? '&' : '?';
  const anchor = resumeAnchorValue(record.resumeAnchor);
  const offset = resumeOffsetValue(record.resumeOffset);
  let resumeHref = `${hrefWithoutHash}${separator}resume=${progress}`;
  if (anchor !== null) resumeHref += `&anchor=${encodeURIComponent(anchor)}`;
  if (offset !== null) resumeHref += `&offset=${offset}`;
  if (anchor !== null) resumeHref += `#${encodeURIComponent(anchor)}`;
  return resumeHref;
}

export function selectBookmarks(
  value: PersonalLibrary,
  catalog: CatalogEntry[],
  lang: PersonalLibraryLang,
  limit = 4,
): BookmarkRecord[] {
  const current = normalizePersonalLibrary(value);
  const entries = catalogByKey(catalog, lang);
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.min(PERSONAL_LIBRARY_BOOKMARK_LIMIT, Math.floor(limit)))
    : 4;
  const selected: BookmarkRecord[] = [];
  for (const record of current.bookmarks) {
    if (record.lang !== lang) continue;
    const canonical = entries.get(personalLibraryKey(lang, record.id));
    if (!canonical) continue;
    selected.push({
      ...record,
      title: canonical.title,
      href: canonical.href,
    });
    if (selected.length >= boundedLimit) break;
  }
  return selected;
}
