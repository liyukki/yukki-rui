import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const header = readFileSync('src/components/Header.astro', 'utf8');
const css = readFileSync('src/styles/global.css', 'utf8');
const mobileCss = readFileSync('src/styles/world.css', 'utf8');
const consts = readFileSync('src/consts.ts', 'utf8');

describe('mobile navigation', () => {
  it('exposes a disclosure button and stable navigation id', () => {
    for (const token of [
      'data-site-header',
      'data-nav-toggle',
      'data-site-nav',
      'aria-controls="site-navigation"',
      'aria-expanded="false"',
      'id="site-navigation"',
    ]) {
      expect(header).toContain(token);
    }
  });

  it('closes with escape, outside click and viewport changes', () => {
    expect(header).toContain('AbortController');
    expect(header).toContain("event.key === 'Escape'");
    expect(header).toContain("astro:page-load");
    expect(header).toContain('matchMedia');
    expect(header).toContain('header.contains');
  });

  it('uses the 760px breakpoint and two-column menu', () => {
    expect(css).toMatch(/@media \(max-width: 760px\)/);
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toContain('display: none');
    expect(mobileCss).toContain('justify-content: normal');
  });

  it('keeps menu copy paired', () => {
    expect(consts.match(/menu:/g)?.length).toBe(2);
  });
});
