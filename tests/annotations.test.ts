import { describe, expect, it } from 'vitest';
import {
  ANNOTATION_CONTEXT_LENGTH,
  ANNOTATION_LIMIT,
  ANNOTATION_NOTE_LIMIT,
  ANNOTATION_QUOTE_LIMIT,
  ANNOTATION_STORAGE_KEY,
  createAnnotationAnchor,
  createAnnotationRecord,
  normalizeAnnotationStore,
  readAnnotationStore,
  removeAnnotation,
  resolveAnnotationAnchor,
  resolveAnnotationAnchors,
  selectAnnotationsForPost,
  updateAnnotationNote,
  upsertAnnotation,
  writeAnnotationStore,
  type AnnotationRecord,
} from '../src/lib/annotations';

function record(overrides: Partial<AnnotationRecord> = {}): AnnotationRecord {
  return {
    id: 'one',
    lang: 'zh',
    postId: 'hello-world',
    quote: 'hello',
    note: 'note',
    start: 0,
    end: 5,
    prefix: '',
    suffix: ' world',
    createdAt: 10,
    updatedAt: 10,
    ...overrides,
  };
}

describe('annotation normalization', () => {
  it('rejects malformed records and trims stored text', () => {
    const store = normalizeAnnotationStore({
      records: [
        record({ quote: '  hello  ', note: '  keep\nthis  ', start: 0, end: 5 }),
        record({ id: 'bad-offset', start: 0, end: 4 }),
        record({ id: 'bad-lang', lang: 'fr' as never }),
        record({ id: 'bad-time', updatedAt: Number.NaN }),
        record({ id: 'empty-quote', quote: '   ', end: 0 }),
        { note: 'missing id' },
      ],
    });

    expect(store.records).toHaveLength(1);
    expect(store.records[0].quote).toBe('hello');
    expect(store.records[0].note).toBe('keep\nthis');
  });

  it('bounds context, quotes, and notes', () => {
    const contextLimit = ANNOTATION_CONTEXT_LENGTH * 2;
    const prefix = 'p'.repeat(contextLimit + 10);
    const suffix = 's'.repeat(contextLimit + 10);
    const store = normalizeAnnotationStore({
      records: [
        record({ prefix, suffix }),
        record({
          id: 'long-quote',
          quote: 'q'.repeat(ANNOTATION_QUOTE_LIMIT + 1),
          end: ANNOTATION_QUOTE_LIMIT + 1,
        }),
        record({
          id: 'long-note',
          note: 'n'.repeat(ANNOTATION_NOTE_LIMIT + 1),
        }),
      ],
    });

    expect(store.records).toHaveLength(1);
    expect(store.records[0].prefix).toHaveLength(contextLimit);
    expect(store.records[0].suffix).toHaveLength(contextLimit);
  });

  it('deduplicates newer ids, caps the store, and sorts newest first', () => {
    const records = Array.from({ length: ANNOTATION_LIMIT + 5 }, (_, index) =>
      record({ id: `id-${index}`, updatedAt: index }),
    );
    records.push(record({ id: 'id-0', note: 'newer', updatedAt: 9999 }));

    const store = normalizeAnnotationStore({ records });

    expect(store.records).toHaveLength(ANNOTATION_LIMIT);
    expect(store.records[0].id).toBe('id-0');
    expect(store.records[0].note).toBe('newer');
    expect(store.records[1].id).toBe(`id-${ANNOTATION_LIMIT + 4}`);
  });

  it('keeps the first record when duplicate timestamps tie', () => {
    const store = normalizeAnnotationStore({
      records: [
        record({ id: 'same', note: 'first' }),
        record({ id: 'same', note: 'second' }),
      ],
    });

    expect(store.records[0].note).toBe('first');
  });

  it('guards storage reads and writes', () => {
    expect(readAnnotationStore(null)).toEqual({ records: [] });
    expect(readAnnotationStore({ getItem: () => '{broken' })).toEqual({ records: [] });
    expect(
      readAnnotationStore({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toEqual({ records: [] });
    expect(
      writeAnnotationStore(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        { records: [] },
      ),
    ).toBe(false);
    expect(ANNOTATION_STORAGE_KEY).toBe('yukki-annotations-v1');
  });
});

describe('annotation anchors', () => {
  it('trims selection whitespace and stores UTF-16 offsets', () => {
    const text = '  keep this idea  ';
    const start = text.indexOf('keep');
    const end = text.indexOf('idea') + 4;
    const anchor = createAnnotationAnchor(text, start, end);

    expect(anchor).toMatchObject({
      quote: 'keep this idea',
      start: 2,
      end: 16,
      prefix: '  ',
      suffix: '  ',
    });
  });

  it('counts surrogate pairs as two JS offsets', () => {
    const text = `\u{1F600} keep`;
    const anchor = createAnnotationAnchor(text, 3, 7);

    expect(anchor).toMatchObject({
      quote: 'keep',
      start: 3,
      end: 7,
      prefix: '\u{1F600} ',
    });
  });

  it('rejects invalid and whitespace-only ranges', () => {
    expect(createAnnotationAnchor('hello', -1, 2)).toBeNull();
    expect(createAnnotationAnchor('hello', 2, 2)).toBeNull();
    expect(createAnnotationAnchor('hello', 3, 2)).toBeNull();
    expect(createAnnotationAnchor('hello', 0, 6)).toBeNull();
    expect(createAnnotationAnchor('   ', 0, 3)).toBeNull();
  });

  it('resolves exact, nearest context, unique quote, and missing anchors', () => {
    const text = 'alpha target beta ... repeat target repeat target';
    const exact = record({
      quote: 'target',
      start: 6,
      end: 12,
      prefix: 'alpha ',
      suffix: ' beta',
    });
    expect(resolveAnnotationAnchor(exact, text)).toMatchObject({
      status: 'exact',
      start: 6,
      end: 12,
    });

    const context = record({
      quote: 'target',
      start: 99,
      end: 105,
      prefix: 'repeat ',
      suffix: ' repeat',
    });
    expect(resolveAnnotationAnchor(context, text)).toMatchObject({
      status: 'context',
      start: text.indexOf('target', 20),
    });

    const unique = record({
      quote: 'alpha',
      start: 99,
      end: 104,
      prefix: 'ZZ',
      suffix: 'ZZ',
    });
    expect(resolveAnnotationAnchor(unique, text)).toMatchObject({
      status: 'unique',
      start: 0,
    });
    expect(resolveAnnotationAnchor(record({ quote: 'absent' }), text)).toMatchObject({
      status: 'missing',
      start: null,
      end: null,
    });
  });

  it('breaks equally near context matches toward the earlier occurrence', () => {
    const text = 'target  target';
    const anchor = record({
      quote: 'target',
      start: 4,
      end: 10,
      prefix: '',
      suffix: '',
    });

    expect(resolveAnnotationAnchor(anchor, text)).toMatchObject({
      status: 'context',
      start: 0,
    });
  });

  it('marks older overlapping restores as conflicts', () => {
    const text = 'abcdef';
    const newer = record({ id: 'new', quote: 'abc', start: 0, end: 3, updatedAt: 20 });
    const older = record({ id: 'old', quote: 'bcd', start: 1, end: 4, updatedAt: 10 });

    expect(resolveAnnotationAnchors([older, newer], text)).toEqual([
      expect.objectContaining({
        record: newer,
        status: 'exact',
        start: 0,
        end: 3,
      }),
      expect.objectContaining({
        record: older,
        status: 'conflict',
        start: null,
        end: null,
      }),
    ]);
  });

  it('allows adjacent restored ranges', () => {
    const text = 'abcdef';
    const first = record({ id: 'first', quote: 'abc', start: 0, end: 3 });
    const second = record({ id: 'second', quote: 'def', start: 3, end: 6 });

    expect(
      resolveAnnotationAnchors([first, second], text).map(({ status }) => status),
    ).toEqual(['exact', 'exact']);
  });
});

describe('annotation mutations', () => {
  it('adds, edits, filters, and removes valid records', () => {
    const created = createAnnotationRecord(
      {
        lang: 'zh',
        postId: 'hello-world',
        quote: 'hello',
        note: '',
        start: 0,
        end: 5,
        prefix: '',
        suffix: '',
      },
      100,
      'fixed-id',
    );
    const added = upsertAnnotation({ records: [] }, created);

    expect(added.records).toHaveLength(1);
    expect(selectAnnotationsForPost(added, 'zh', 'hello-world')).toHaveLength(1);
    expect(selectAnnotationsForPost(added, 'en', 'hello-world')).toHaveLength(0);
    expect(
      updateAnnotationNote(added, 'fixed-id', '  changed  ', 200).records[0],
    ).toMatchObject({
      note: 'changed',
      createdAt: 100,
      updatedAt: 200,
    });
    expect(removeAnnotation(added, 'fixed-id').records).toHaveLength(0);
  });

  it('preserves the current store when an attempted mutation is invalid', () => {
    const current = { records: [record()] };

    expect(upsertAnnotation(current, { ...record(), end: 4 })).toEqual(current);
    expect(
      updateAnnotationNote(current, 'one', 'n'.repeat(ANNOTATION_NOTE_LIMIT + 1), 200),
    ).toEqual(current);
  });

  it('returns a new id and timestamp when fields are omitted', () => {
    const created = createAnnotationRecord(
      {
        lang: 'en',
        postId: 'hello-worlden',
        quote: 'Hello',
        note: 'note',
        start: 0,
        end: 5,
        prefix: '',
        suffix: '',
      },
      1234,
    );

    expect(created.id.length).toBeGreaterThan(0);
    expect(created.createdAt).toBe(1234);
    expect(created.updatedAt).toBe(1234);
  });
});
