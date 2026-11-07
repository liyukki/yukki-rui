import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = existsSync('src/components/ArticleAnnotations.astro')
  ? readFileSync('src/components/ArticleAnnotations.astro', 'utf8')
  : '';
const layout = readFileSync('src/layouts/PostLayout.astro', 'utf8');
const consts = readFileSync('src/consts.ts', 'utf8');

describe('annotation shell', () => {
  it('starts hidden and exposes a compact excerpt entry', () => {
    expect(component).toContain('data-article-annotations');
    expect(component).toContain('data-annotations-open');
    expect(component).toContain('data-annotations-count');
    expect(component).toContain('aria-label');
    expect(component).toContain('hidden');
  });

  it('uses native dialogs and accessible controls', () => {
    expect(component).toContain('<dialog');
    expect(component).toContain('showModal');
    expect(component).toContain('data-annotations-dialog');
    expect(component).toContain('data-annotation-editor');
    expect(component).toContain('role="toolbar"');
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain('data-annotation-toolbar');
  });

  it('is wired after the article header and before the body', () => {
    expect(layout).toContain(
      "import ArticleAnnotations from '../components/ArticleAnnotations.astro'",
    );
    expect(layout).toContain('<ArticleAnnotations');
    expect(layout.indexOf('<ArticleAnnotations')).toBeLessThan(
      layout.indexOf('<div class="post-layout"'),
    );
  });

  it('keeps all new copy paired', () => {
    for (const key of [
      'annotations',
      'annotationsOpen',
      'annotationsEmpty',
      'annotationsEmptyHint',
      'annotationHighlight',
      'annotationAddNote',
      'annotationSave',
      'annotationDelete',
      'annotationStorageUnavailable',
      'annotationMoved',
      'annotationConflict',
    ]) {
      expect(consts.match(new RegExp(`${key}:`, 'g'))?.length).toBe(2);
    }
  });
});
