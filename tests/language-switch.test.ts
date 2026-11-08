import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLanguageSwitch } from '../src/lib/language-switch';

interface PostMeta {
  file: string;
  lang: string;
  draft: boolean;
  translationKey?: string;
}

function frontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
}

function publishedPosts(): PostMeta[] {
  return readdirSync(join('src', 'content', 'posts'))
    .filter((file) => /\.(md|mdx)$/.test(file))
    .map((file) => {
      const source = readFileSync(join('src', 'content', 'posts', file), 'utf8');
      const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
      return {
        file,
        lang: frontmatterValue(frontmatter, 'lang') ?? '',
        draft: frontmatterValue(frontmatter, 'draft') === 'true',
        translationKey: frontmatterValue(frontmatter, 'translationKey'),
      };
    })
    .filter((post) => !post.draft);
}

describe('language switch target', () => {
  it('uses an explicit equivalent page when one exists', () => {
    expect(resolveLanguageSwitch('zh', '/yukki-rui/en/posts/hello-world/')).toEqual({
      lang: 'en',
      href: '/yukki-rui/en/posts/hello-world/',
      available: true,
    });
  });

  it('never invents a homepage fallback when no equivalent page exists', () => {
    expect(resolveLanguageSwitch('zh')).toEqual({
      lang: 'en',
      href: null,
      available: false,
    });
    expect(resolveLanguageSwitch('en', '   ')).toEqual({
      lang: 'zh',
      href: null,
      available: false,
    });
  });

  it('renders unavailable translations as a disabled control instead of a link', () => {
    const component = readFileSync('src/components/LangSwitch.astro', 'utf8');
    const baseLayout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');

    expect(component).toContain('resolveLanguageSwitch');
    expect(component).toContain('aria-disabled="true"');
    expect(component).not.toContain('langHref');
    expect(component).not.toContain('alternateUrl');
    expect(baseLayout).toContain('languageSwitchUrl');
    expect(baseLayout).toContain('languageSwitchUrl ?? alternate');
  });
});

describe('equivalent static pages', () => {
  for (const [file, expected] of [
    ['src/pages/[lang]/archive.astro', 'archive'],
    ['src/pages/[lang]/search.astro', 'search'],
    ['src/pages/[lang]/tags/index.astro', 'tags'],
    ['src/pages/[lang]/quests.astro', 'quests'],
  ] as const) {
    it(`${file} links to the same page in the other language`, () => {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain(`alternate={withBase(lang === 'zh' ? 'en/${expected}/' : 'zh/${expected}/')}`);
    });
  }

  it('tag detail pages switch to the matching tag when it exists, otherwise the tag index', () => {
    const source = readFileSync('src/pages/[lang]/tags/[tag].astro', 'utf8');
    expect(source).toContain('getTagNames(otherLang)');
    expect(source).toContain('languageSwitchUrl');
    expect(source).toContain('tagHref(otherLang, tag)');
  });
});

describe('published article translations', () => {
  const posts = publishedPosts();

  it('gives every published article a stable translation key', () => {
    const missing = posts.filter((post) => !post.translationKey).map((post) => post.file);
    expect(missing).toEqual([]);
  });

  it('pairs every published article with exactly one visible article in the other language', () => {
    const failures = posts.flatMap((post) => {
      const otherLang = post.lang === 'zh' ? 'en' : 'zh';
      const matches = posts.filter(
        (candidate) =>
          candidate.lang === otherLang && candidate.translationKey === post.translationKey,
      );
      return matches.length === 1
        ? []
        : [`${post.file}: expected 1 ${otherLang} match, found ${matches.length}`];
    });
    expect(failures).toEqual([]);
  });
});
