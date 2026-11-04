import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const baseLayout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
const header = readFileSync('src/components/Header.astro', 'utf8');
const home = readFileSync('src/pages/[lang]/index.astro', 'utf8');
const settings = readFileSync('src/components/ReadingSettings.astro', 'utf8');
const globalCss = readFileSync('src/styles/global.css', 'utf8');
const worldCss = readFileSync('src/styles/world.css', 'utf8');
const consts = readFileSync('src/consts.ts', 'utf8');

describe('experience polish', () => {
  it('provides a skip link to a focusable main landmark', () => {
    expect(baseLayout).toContain('class="skip-link"');
    expect(baseLayout).toContain('href="#main-content"');
    expect(baseLayout).toContain('id="main-content"');
    expect(baseLayout).toContain('tabindex="-1"');
  });

  it('marks the current navigation destination', () => {
    expect(baseLayout).toContain('currentPath={Astro.url.pathname}');
    expect(header).toContain('currentPath');
    expect(header).toContain('aria-current');
    expect(header).toContain('normalizeNavPath');
  });

  it('shows four recent posts and links to the archive', () => {
    expect(home).toContain('posts.slice(0, 4)');
    expect(home).toContain('recentPosts.map');
    expect(home).toContain('viewAllPosts');
  });

  it('uses a native mobile disclosure while keeping a no-JS fallback', () => {
    expect(settings).toContain('<details');
    expect(settings).toContain('<summary');
    expect(settings).toContain('data-reading-settings');
    expect(settings).toContain('open');
    expect(settings).toContain("matchMedia('(max-width: 760px)')");
  });

  it('removes intrinsic grid and project-art overflow at narrow widths', () => {
    expect(globalCss).toMatch(
      /\.grid-2\s*>\s*\*[\s\S]{0,80}\.grid-3\s*>\s*\*\s*\{[^}]*min-width:\s*0/,
    );
    expect(globalCss).toMatch(/\.project-card[^{]*\{[^}]*min-width:\s*0/);
    expect(globalCss).not.toContain('overflow-x: hidden');
    expect(worldCss).toMatch(/\.mini-window\s*\{[^}]*width:\s*min\(240px,\s*100%\)/);
  });

  it('keeps the new copy paired in both languages', () => {
    for (const key of ['skipToContent', 'viewAllPosts']) {
      expect(consts.match(new RegExp(`${key}:`, 'g'))?.length).toBe(2);
    }
  });
});
