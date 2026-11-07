/** Local-only article highlights and notes. No annotation data leaves the browser. */

export const ANNOTATION_STORAGE_KEY = 'yukki-annotations-v1';
export const ANNOTATION_LIMIT = 200;
export const ANNOTATION_QUOTE_LIMIT = 2000;
export const ANNOTATION_NOTE_LIMIT = 1000;
export const ANNOTATION_CONTEXT_LENGTH = 32;

const ANNOTATION_CONTEXT_LIMIT = 64;
const LANGUAGES: readonly AnnotationLang[] = ['zh', 'en'];

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

let annotationIdSequence = 0;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function languageValue(value: unknown): AnnotationLang | null {
  return typeof value === 'string' && LANGUAGES.includes(value as AnnotationLang)
    ? (value as AnnotationLang)
    : null;
}

function timestampValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function contextValue(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, ANNOTATION_CONTEXT_LIMIT) : null;
}

function normalizeAnnotationRecord(value: unknown): AnnotationRecord | null {
  const candidate = asRecord(value);
  const id = textValue(candidate.id, Number.POSITIVE_INFINITY);
  const lang = languageValue(candidate.lang);
  const postId = textValue(candidate.postId, Number.POSITIVE_INFINITY);
  const quote =
    typeof candidate.quote === 'string' ? candidate.quote.trim() : null;
  const note = typeof candidate.note === 'string' ? candidate.note.trim() : null;
  const start = candidate.start;
  const end = candidate.end;
  const prefix = contextValue(candidate.prefix);
  const suffix = contextValue(candidate.suffix);
  const createdAt = timestampValue(candidate.createdAt);
  const updatedAt = timestampValue(candidate.updatedAt);

  if (!id || !lang || !postId || quote === null || note === null) return null;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if ((start as number) < 0 || (end as number) <= (start as number)) return null;
  if ((end as number) - (start as number) !== quote.length) return null;
  if (quote.length < 1 || quote.length > ANNOTATION_QUOTE_LIMIT) return null;
  if (note.length > ANNOTATION_NOTE_LIMIT) return null;
  if (prefix === null || suffix === null) return null;
  if (createdAt === null || updatedAt === null) return null;

  return {
    id,
    lang,
    postId,
    quote,
    note,
    start: start as number,
    end: end as number,
    prefix,
    suffix,
    createdAt,
    updatedAt,
  };
}

export function normalizeAnnotationStore(input: unknown): AnnotationStore {
  const candidate = asRecord(input);
  if (!Array.isArray(candidate.records)) return { records: [] };

  const byId = new Map<string, AnnotationRecord>();
  for (const item of candidate.records) {
    const record = normalizeAnnotationRecord(item);
    if (!record) continue;

    const existing = byId.get(record.id);
    if (!existing || record.updatedAt > existing.updatedAt) {
      byId.set(record.id, record);
    }
  }

  const records = [...byId.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, ANNOTATION_LIMIT);

  return { records };
}

export function readAnnotationStore(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): AnnotationStore {
  if (!storage) return { records: [] };
  try {
    return normalizeAnnotationStore(
      JSON.parse(storage.getItem(ANNOTATION_STORAGE_KEY) ?? 'null'),
    );
  } catch {
    return { records: [] };
  }
}

export function writeAnnotationStore(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  value: AnnotationStore,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      ANNOTATION_STORAGE_KEY,
      JSON.stringify(normalizeAnnotationStore(value)),
    );
    return true;
  } catch {
    return false;
  }
}

export function createAnnotationAnchor(
  text: string,
  start: number,
  end: number,
): AnnotationAnchor | null {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > text.length ||
    end <= start
  ) {
    return null;
  }

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
}

function createAnnotationId(now: number): string {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // Continue to the randomness and timestamp fallbacks.
    }
  }

  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      const random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return `annotation-${now}-${random}`;
    } catch {
      // Continue to the monotonic fallback.
    }
  }

  annotationIdSequence += 1;
  return `annotation-${now}-${annotationIdSequence}`;
}

export function createAnnotationRecord(
  input: Omit<AnnotationRecord, 'id' | 'createdAt' | 'updatedAt'>,
  now = Date.now(),
  id?: string,
): AnnotationRecord {
  const timestamp = timestampValue(now) ?? Date.now();
  const identifier = id?.trim() || createAnnotationId(timestamp);
  const record = normalizeAnnotationRecord({
    ...input,
    id: identifier,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  if (!record) {
    throw new TypeError('Invalid annotation record');
  }

  return record;
}

export function upsertAnnotation(
  store: AnnotationStore,
  record: AnnotationRecord,
): AnnotationStore {
  const current = normalizeAnnotationStore(store);
  const normalized = normalizeAnnotationRecord(record);
  if (!normalized) return current;

  return normalizeAnnotationStore({
    records: [
      normalized,
      ...current.records.filter((entry) => entry.id !== normalized.id),
    ],
  });
}

export function updateAnnotationNote(
  store: AnnotationStore,
  id: string,
  note: string,
  now = Date.now(),
): AnnotationStore {
  const current = normalizeAnnotationStore(store);
  const existing = current.records.find((record) => record.id === id);
  if (!existing) return current;

  const trimmed = note.trim();
  if (trimmed.length > ANNOTATION_NOTE_LIMIT) return current;

  const updated = normalizeAnnotationRecord({
    ...existing,
    note: trimmed,
    updatedAt: timestampValue(now) ?? Date.now(),
  });
  if (!updated) return current;

  return upsertAnnotation(current, updated);
}

export function removeAnnotation(store: AnnotationStore, id: string): AnnotationStore {
  const current = normalizeAnnotationStore(store);
  return normalizeAnnotationStore({
    records: current.records.filter((record) => record.id !== id),
  });
}

export function selectAnnotationsForPost(
  store: AnnotationStore,
  lang: AnnotationLang,
  postId: string,
): AnnotationRecord[] {
  return normalizeAnnotationStore(store).records.filter(
    (record) => record.lang === lang && record.postId === postId,
  );
}

function occurrences(haystack: string, needle: string): number[] {
  const indexes: number[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    indexes.push(index);
    index = haystack.indexOf(needle, index + 1);
  }
  return indexes;
}

export function resolveAnnotationAnchor(
  record: AnnotationRecord,
  text: string,
): ResolvedAnnotation {
  if (
    Number.isInteger(record.start) &&
    Number.isInteger(record.end) &&
    record.start >= 0 &&
    record.end > record.start &&
    record.end <= text.length &&
    text.slice(record.start, record.end) === record.quote
  ) {
    return {
      record,
      status: 'exact',
      start: record.start,
      end: record.end,
    };
  }

  const contextual = record.prefix + record.quote + record.suffix;
  const contextMatches = occurrences(text, contextual);
  if (contextMatches.length > 0) {
    let closest = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const match of contextMatches) {
      const start = match + record.prefix.length;
      const distance = Math.abs(start - record.start);
      if (distance < closestDistance) {
        closest = start;
        closestDistance = distance;
      }
    }
    if (closest !== -1) {
      return {
        record,
        status: 'context',
        start: closest,
        end: closest + record.quote.length,
      };
    }
  }

  const quoteMatches = occurrences(text, record.quote);
  if (quoteMatches.length === 1) {
    return {
      record,
      status: 'unique',
      start: quoteMatches[0],
      end: quoteMatches[0] + record.quote.length,
    };
  }

  return {
    record,
    status: 'missing',
    start: null,
    end: null,
  };
}

export function resolveAnnotationAnchors(
  records: AnnotationRecord[],
  text: string,
): ResolvedAnnotation[] {
  const ordered = records
    .map((record, index) => ({ record, index }))
    .sort(
      (a, b) =>
        b.record.updatedAt - a.record.updatedAt ||
        b.record.createdAt - a.record.createdAt ||
        a.index - b.index,
    );

  const accepted: ResolvedAnnotation[] = [];
  const resolved: ResolvedAnnotation[] = [];

  for (const { record } of ordered) {
    const candidate = resolveAnnotationAnchor(record, text);
    if (candidate.start === null || candidate.end === null) {
      resolved.push(candidate);
      continue;
    }

    const overlaps = accepted.some(
      (entry) =>
        entry.start !== null &&
        entry.end !== null &&
        candidate.start! < entry.end &&
        candidate.end! > entry.start,
    );

    if (overlaps) {
      resolved.push({
        record,
        status: 'conflict',
        start: null,
        end: null,
      });
      continue;
    }

    accepted.push(candidate);
    resolved.push(candidate);
  }

  return resolved;
}
