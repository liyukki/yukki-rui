import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const share = readFileSync('src/components/PostShare.astro', 'utf8');
const likes = readFileSync('src/components/PostLikes.astro', 'utf8');
const layout = readFileSync('src/layouts/PostLayout.astro', 'utf8');
const consts = readFileSync('src/consts.ts', 'utf8');

describe('article share component', () => {
  it('renders an accessible share button and status', () => {
    for (const token of [
      'data-post-share',
      'data-share-button',
      'data-share-label',
      'data-share-status',
      'aria-live="polite"',
      'role="status"',
      'navigator.share',
      'navigator.clipboard',
      'shareOrCopy',
    ]) {
      expect(share).toContain(token);
    }
    expect(share).toContain("document.addEventListener('astro:page-load'");
    expect(share).not.toMatch(/\.innerHTML\s*=/);
    expect(share).toMatch(/label\.textContent\s*=/);
    expect(share).toMatch(/status\.textContent\s*=/);
  });

  it('places the share component inside the like card', () => {
    expect(likes).toContain('<slot />');
    expect(likes).toContain('post-likes__actions');
    expect(layout.indexOf('<PostShare')).toBeGreaterThan(layout.indexOf('<PostLikes'));
    expect(layout).toContain('url={canonical}');
    expect(layout).toContain('text={post.data.description}');
  });

  it('keeps Chinese and English copy paired', () => {
    for (const key of ['sharePost', 'copyLink', 'linkCopied', 'shareFailed']) {
      expect(consts.match(new RegExp(`${key}:`, 'g'))?.length).toBe(2);
    }
  });
});
