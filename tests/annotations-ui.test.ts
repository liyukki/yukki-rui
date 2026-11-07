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
      'annotationEdit',
      'annotationJump',
      'annotationSave',
      'annotationDelete',
      'annotationStorageUnavailable',
      'annotationMoved',
      'annotationConflict',
    ]) {
      expect(consts.match(new RegExp(`${key}:`, 'g'))?.length).toBe(2);
    }
  });

  it('maps selections safely and renders Range highlights across lifecycle swaps', () => {
    expect(component).toContain('TreeWalker');
    expect(component).toContain('createTreeWalker');
    expect(component).toContain('createAnnotationAnchor');
    expect(component).toContain('resolveAnnotationAnchors');
    expect(component).toContain('selectionchange');
    expect(component).toContain('pointerup');
    expect(component).toContain('keydown');
    expect(component).toContain('range.getBoundingClientRect');
    expect(component).toContain('range.surroundContents');
    expect(component).toContain('data-annotation-first');
    expect(component).toContain('data-annotation-last');
    expect(component).toContain("document.addEventListener('astro:before-swap'");
    expect(component).toContain("document.addEventListener('astro:page-load'");
    expect(component).not.toMatch(/selection\.toString\(\)/);
    expect(component).not.toMatch(/\.innerHTML\s*=/);
    expect(component).toContain('getComputedStyle');
    expect(component).toContain('checkVisibility');
  });

  it('completes saving, editing, deleting, and excerpt navigation safely', () => {
    expect(component).toContain('createAnnotationRecord');
    expect(component).toContain('upsertAnnotation');
    expect(component).toContain('writeAnnotationStore');
    expect(component).toContain('updateAnnotationNote');
    expect(component).toContain('removeAnnotation');
    expect(component).toContain('data-annotation-form');
    expect(component).toContain('scrollIntoView');
    expect(component).toContain('focus(');
    expect(component).toContain('annotation-pulse');
    expect(component).toContain('Intl.DateTimeFormat');
    expect(component).toContain('annotationMoved');
    expect(component).toContain('annotationConflict');
    expect(component).toContain('data-annotations-list');
    expect(component).toContain('textContent');
    expect(component).toContain('annotationStorageUnavailable');
    expect(component).toContain('annotationSaveFailed');
    expect(component).toContain('annotationDeleteFailed');
    expect(component).not.toMatch(/\.innerHTML\s*=/);
  });
});
