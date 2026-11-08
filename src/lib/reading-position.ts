export interface ArticleBounds {
  bodyTop: number;
  bodyHeight: number;
  viewportHeight: number;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function articleScrollRange(bounds: ArticleBounds): number {
  return Math.max(0, finiteOrZero(bounds.bodyHeight) - finiteOrZero(bounds.viewportHeight));
}

export function readingProgressAt(scrollY: number, bounds: ArticleBounds): number {
  const top = finiteOrZero(bounds.bodyTop);
  const position = finiteOrZero(scrollY);
  const range = articleScrollRange(bounds);

  if (position < top) return 0;
  if (range === 0) return 100;

  return Math.min(100, Math.max(0, Math.round(((position - top) / range) * 100)));
}

export function scrollTargetForProgress(progress: number, bounds: ArticleBounds): number {
  const value = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;
  return finiteOrZero(bounds.bodyTop) + (articleScrollRange(bounds) * value) / 100;
}
