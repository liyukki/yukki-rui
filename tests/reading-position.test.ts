import { describe, expect, it } from 'vitest';
import {
  readingProgressAt,
  scrollTargetForProgress,
} from '../src/lib/reading-position';

const bounds = {
  bodyTop: 700,
  bodyHeight: 2500,
  viewportHeight: 900,
};

describe('readingProgressAt', () => {
  it('measures progress inside the article body instead of the whole document', () => {
    expect(readingProgressAt(0, bounds)).toBe(0);
    expect(readingProgressAt(700, bounds)).toBe(0);
    expect(readingProgressAt(1500, bounds)).toBe(50);
    expect(readingProgressAt(2300, bounds)).toBe(100);
  });

  it('handles short articles and clamps out-of-range positions', () => {
    const shortBody = { bodyTop: 700, bodyHeight: 600, viewportHeight: 900 };
    expect(readingProgressAt(699, shortBody)).toBe(0);
    expect(readingProgressAt(700, shortBody)).toBe(100);
    expect(readingProgressAt(9999, shortBody)).toBe(100);
  });
});

describe('scrollTargetForProgress', () => {
  it('reverses body progress and clamps invalid values', () => {
    expect(scrollTargetForProgress(0, bounds)).toBe(700);
    expect(scrollTargetForProgress(50, bounds)).toBe(1500);
    expect(scrollTargetForProgress(100, bounds)).toBe(2300);
    expect(scrollTargetForProgress(-20, bounds)).toBe(700);
    expect(scrollTargetForProgress(180, bounds)).toBe(2300);
    expect(scrollTargetForProgress(Number.NaN, bounds)).toBe(700);
  });
});
