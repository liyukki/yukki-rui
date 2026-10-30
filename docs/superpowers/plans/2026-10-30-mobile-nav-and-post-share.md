# 移动端导航与文章分享 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `760px` 以下把全站导航收进像素风菜单，并在文章点赞卡片内加入原生分享与复制链接兜底。

**Architecture:** 分享逻辑先抽成不依赖 DOM 的 `shareOrCopy()`，再由 `PostShare.astro` 绑定浏览器能力；`PostLikes.astro` 增加动作 slot，让分享和点赞共享一张卡片。移动导航在 `Header.astro` 内用原生按钮和 `astro:page-load` 生命周期切换两列导航面板，桌面端保持现有横向导航。

**Tech Stack:** Astro 7、TypeScript、原生 DOM API、Vitest、现有 CSS 令牌与 ClientRouter。

## Global Constraints

- Node.js 版本保持 `>=22.12.0`，不新增第三方依赖。
- 移动导航断点固定为 `760px`；`761px` 起恢复桌面横向导航。
- 分享 URL 使用 `PostLayout.astro` 已计算的 canonical 绝对地址。
- 不新增后端接口、数据库迁移、环境变量或第三方分享 SDK。
- 所有动态文本使用 `textContent`；禁止使用 `innerHTML` 写入用户可见内容。
- 保留像素/杂志风、深浅主题变量、现有导航顺序和中英文文案。
- 分享取消使用 `AbortError` 识别，取消时不显示错误。
- 每个任务完成前必须运行对应测试；每个任务单独提交。

---

### Task 1: 分享/复制纯函数

**Files:**
- Create: `src/lib/share.ts`
- Test: `tests/share.test.ts`

**Interfaces:**
- Produces: `shareOrCopy(options: ShareOrCopyOptions): Promise<ShareResult>`
- Produces: `ShareResult = 'shared' | 'cancelled' | 'copied' | 'failed'`
- Produces: `ShareOrCopyOptions` with `title`, `text`, `url`, optional `share(data: ShareData): Promise<void>`, optional `writeText(value: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `tests/share.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { shareOrCopy } from '../src/lib/share';

const base = {
  title: 'Title',
  text: 'Description',
  url: 'https://example.com/posts/hello/',
};

describe('shareOrCopy', () => {
  it('uses native share before clipboard', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareOrCopy({ ...base, share, writeText })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: base.title,
      text: base.text,
      url: base.url,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('treats AbortError as a silent cancellation', async () => {
    const share = vi.fn().mockRejectedValue(
      Object.assign(new Error('cancelled'), { name: 'AbortError' }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareOrCopy({ ...base, share, writeText })).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to clipboard when share fails', async () => {
    const share = vi.fn().mockRejectedValue(new Error('not allowed'));
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareOrCopy({ ...base, share, writeText })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(base.url);
  });

  it('copies when native share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareOrCopy({ ...base, writeText })).resolves.toBe('copied');
  });

  it('returns failed when clipboard fails or URL is empty', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));

    await expect(shareOrCopy({ ...base, writeText })).resolves.toBe('failed');
    await expect(shareOrCopy({ ...base, url: '   ', writeText })).resolves.toBe('failed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/share.test.ts
```

Expected: FAIL because `src/lib/share.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/share.ts`:

```ts
export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'failed';

export interface ShareOrCopyOptions {
  title: string;
  text: string;
  url: string;
  share?: (data: ShareData) => Promise<void>;
  writeText?: (value: string) => Promise<void>;
}

export async function shareOrCopy({
  title,
  text,
  url,
  share,
  writeText,
}: ShareOrCopyOptions): Promise<ShareResult> {
  const target = url.trim();
  if (!target) return 'failed';

  if (share) {
    try {
      await share({ title, text, url: target });
      return 'shared';
    } catch (error) {
      const cancelled =
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'AbortError';
      if (cancelled) return 'cancelled';
    }
  }

  if (!writeText) return 'failed';

  try {
    await writeText(target);
    return 'copied';
  } catch {
    return 'failed';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npx vitest run tests/share.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/share.ts tests/share.test.ts
git commit -m "feat(share): add share fallback helper"
```

---

### Task 2: 文章分享组件与点赞卡片

**Files:**
- Create: `src/components/PostShare.astro`
- Modify: `src/components/PostLikes.astro`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/consts.ts`
- Test: `tests/post-share-ui.test.ts`
- Test: `tests/post-likes-ui.test.ts`

**Interfaces:**
- Consumes: `shareOrCopy()` from `src/lib/share.ts`
- Produces: `PostShare` props `{ lang: Lang; title: string; text: string; url: string }`
- Produces: `PostLikes` slot content rendered inside `.post-likes__actions`

- [ ] **Step 1: Write the failing tests**

Create `tests/post-share-ui.test.ts`:

```ts
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
```

Update `tests/post-likes-ui.test.ts` so the existing ordering test also asserts the slot:

```ts
expect(layout).toContain('<PostShare');
expect(layout.indexOf('<PostShare')).toBeLessThan(layout.indexOf('</PostLikes>'));
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npx vitest run tests/post-share-ui.test.ts tests/post-likes-ui.test.ts
```

Expected: FAIL because `PostShare.astro` and the new slot do not exist.

- [ ] **Step 3: Add localized copy**

In both `UI.zh` and `UI.en` in `src/consts.ts`, add these keys next to the existing post-like copy:

```ts
sharePost: '分享文章',
copyLink: '复制链接',
linkCopied: '已复制',
shareFailed: '复制失败',
```

English values:

```ts
sharePost: 'Share post',
copyLink: 'Copy link',
linkCopied: 'Copied',
shareFailed: 'Copy failed',
```

- [ ] **Step 4: Add the share component**

Create `src/components/PostShare.astro` with:

```astro
---
import { UI, type Lang } from '../consts';
import { shareOrCopy } from '../lib/share';

interface Props {
  lang: Lang;
  title: string;
  text: string;
  url: string;
}

const { lang, title, text, url } = Astro.props;
const t = UI[lang];
const i18n = {
  share: t.sharePost,
  copy: t.copyLink,
  copied: t.linkCopied,
  failed: t.shareFailed,
};
---

<span
  class="post-share"
  data-post-share
  data-url={url}
  data-title={title}
  data-text={text}
  data-i18n={JSON.stringify(i18n)}
>
  <button class="post-share__button" type="button" data-share-button aria-label={t.sharePost}>
    <svg class="post-share__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 12h8M13 7l5 5-5 5M6 5h5M6 19h5"></path>
    </svg>
    <span data-share-label>{t.sharePost}</span>
  </button>
  <span class="post-share__status" data-share-status role="status" aria-live="polite"></span>
</span>

<script>
  import { shareOrCopy } from '../lib/share';

  interface ShareI18n {
    share: string;
    copy: string;
    copied: string;
    failed: string;
  }

  function readI18n(root: HTMLElement): ShareI18n {
    const label = root.querySelector<HTMLElement>('[data-share-label]')?.textContent?.trim() ?? '';
    const fallback = { share: label, copy: label, copied: label, failed: label };
    try {
      const value = JSON.parse(root.dataset.i18n ?? '{}') as Partial<ShareI18n>;
      return {
        share: typeof value.share === 'string' ? value.share : fallback.share,
        copy: typeof value.copy === 'string' ? value.copy : fallback.copy,
        copied: typeof value.copied === 'string' ? value.copied : fallback.copied,
        failed: typeof value.failed === 'string' ? value.failed : fallback.failed,
      };
    } catch {
      return fallback;
    }
  }

  function initPostShare(root: HTMLElement): void {
    if (root.dataset.ready === '1') return;
    root.dataset.ready = '1';

    const button = root.querySelector<HTMLButtonElement>('[data-share-button]');
    const label = root.querySelector<HTMLElement>('[data-share-label]');
    const status = root.querySelector<HTMLElement>('[data-share-status]');
    if (!button || !label || !status) return;

    const i18n = readI18n(root);
    const canShare = typeof navigator.share === 'function';
    const baseLabel = canShare ? i18n.share : i18n.copy;
    let resetTimer = 0;

    const setLabel = (value: string): void => {
      label.textContent = value;
      button.setAttribute('aria-label', value);
    };

    const reset = (): void => {
      window.clearTimeout(resetTimer);
      resetTimer = 0;
      setLabel(baseLabel);
      status.textContent = '';
    };

    setLabel(baseLabel);

    button.addEventListener('click', async () => {
      window.clearTimeout(resetTimer);
      status.textContent = '';
      button.disabled = true;

      const result = await shareOrCopy({
        title: root.dataset.title ?? '',
        text: root.dataset.text ?? '',
        url: root.dataset.url ?? '',
        share: canShare ? (data) => navigator.share(data) : undefined,
        writeText:
          navigator.clipboard && typeof navigator.clipboard.writeText === 'function'
            ? (value) => navigator.clipboard.writeText(value)
            : undefined,
      });

      button.disabled = false;
      if (result === 'shared' || result === 'cancelled') return;

      const message = result === 'copied' ? i18n.copied : i18n.failed;
      setLabel(message);
      status.textContent = message;
      resetTimer = window.setTimeout(reset, 2000);
    });
  }

  function initAllPostShare(): void {
    document.querySelectorAll<HTMLElement>('[data-post-share]').forEach(initPostShare);
  }

  initAllPostShare();
  document.addEventListener('astro:page-load', initAllPostShare);
</script>

<style>
  .post-share {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .post-share__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 2.75rem;
    padding: 0.5em 0.9em;
    border: 2px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg-soft);
    box-shadow: 0 var(--px) 0 0 var(--card-edge);
    color: var(--text);
    font: inherit;
    font-family: var(--font-pixel);
    font-size: var(--fs-small);
    cursor: pointer;
    transition:
      border-color var(--dur),
      color var(--dur),
      background var(--dur),
      transform var(--dur);
  }

  .post-share__button:hover:not(:disabled) {
    border-color: var(--accent-2);
    color: var(--accent-2);
    transform: translateY(-2px);
  }

  .post-share__button:focus-visible {
    outline: 2px solid var(--accent-2);
    outline-offset: 2px;
  }

  .post-share__button:disabled {
    cursor: progress;
    opacity: 0.72;
  }

  .post-share__icon {
    width: 1.15rem;
    height: 1.15rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .post-share__status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 480px) {
    .post-share {
      width: 100%;
    }

    .post-share__button {
      width: 100%;
    }
  }
</style>
```

- [ ] **Step 5: Add the slot to the like card**

In `src/components/PostLikes.astro`, change the start of the card body to:

```astro
  <div class="post-likes__actions">
    <button
      class="post-likes__button"
      type="button"
      data-like-button
      aria-pressed="false"
      disabled
    >
      <svg class="post-likes__heart" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20.4 4.8 13.7A4.9 4.9 0 0 1 4.8 6.6a4.9 4.9 0 0 1 6.9 0l.3.3.3-.3a4.9 4.9 0 0 1 6.9 0 4.9 4.9 0 0 1 0 7.1Z"></path>
      </svg>
      <span data-like-label>{t.postLike}</span>
      <span class="post-likes__count" data-like-count aria-hidden="true">—</span>
    </button>
    <slot />
  </div>
```

Add these styles inside the existing `.post-likes` style block:

```css
  .post-likes__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  @media (max-width: 480px) {
    .post-likes__actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .post-likes__button {
      width: 100%;
    }
  }
```

The existing mobile `.post-likes__button { width: 100%; }` rule can remain; the two-column action grid is the outer constraint.

- [ ] **Step 6: Wire the share component into the article layout**

In `src/layouts/PostLayout.astro`, import `PostShare`:

```astro
import PostShare from '../components/PostShare.astro';
```

Replace the `<PostLikes ... />` block with:

```astro
    <PostLikes lang={lang} postKey={postLikeKey(post)}>
      <PostShare
        lang={lang}
        title={post.data.title}
        text={post.data.description}
        url={canonical}
      />
    </PostLikes>
```

- [ ] **Step 7: Run targeted tests**

Run:

```powershell
npx vitest run tests/share.test.ts tests/post-share-ui.test.ts tests/post-likes-ui.test.ts
npm run check
```

Expected: all targeted tests pass and Astro reports 0 errors.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/share.ts src/components/PostShare.astro src/components/PostLikes.astro src/layouts/PostLayout.astro src/consts.ts tests/share.test.ts tests/post-share-ui.test.ts tests/post-likes-ui.test.ts
git commit -m "feat(share): add article share action"
```

---

### Task 3: 收起式移动导航

**Files:**
- Modify: `src/components/Header.astro`
- Modify: `src/consts.ts`
- Modify: `src/styles/global.css`
- Modify: `src/styles/world.css`
- Test: `tests/header-mobile-nav.test.ts`

**Interfaces:**
- Consumes: `UI[lang].menu` and `NAV[lang]`
- Produces: header contract `data-site-header`, `data-nav-toggle`, `data-site-nav`, `aria-controls="site-navigation"`, `aria-expanded="false"`

- [ ] **Step 1: Write the failing test**

Create `tests/header-mobile-nav.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npx vitest run tests/header-mobile-nav.test.ts
```

Expected: FAIL because the header contract and mobile menu styles do not exist.

- [ ] **Step 3: Add menu copy**

In both `UI.zh` and `UI.en` in `src/consts.ts`, add:

```ts
menu: '菜单',
```

and:

```ts
menu: 'Menu',
```

- [ ] **Step 4: Replace the Header markup**

Update `src/components/Header.astro` to this structure:

```astro
---
import { NAV, SITE, UI, type Lang } from '../consts';
import { langHref, withBase } from '../lib/url';
import LangSwitch from './LangSwitch.astro';
import PixelSprite from './PixelSprite.astro';
import ThemeToggle from './ThemeToggle.astro';

interface Props {
  lang: Lang;
  alternateUrl?: string;
}
const { lang, alternateUrl } = Astro.props;
---
<header class="site-header" data-site-header>
  <div class="wrap">
    <a class="site-name" href={langHref(lang)}>
      <PixelSprite name="coin-sprite" size={20} />{SITE.name}
    </a>
    <div class="header-tools">
      <LangSwitch lang={lang} alternateUrl={alternateUrl} />
      <ThemeToggle lang={lang} />
      <button
        class="icon-btn nav-toggle"
        type="button"
        data-nav-toggle
        aria-expanded="false"
        aria-controls="site-navigation"
      >
        <span class="nav-toggle__icon" aria-hidden="true">≡</span>
        <span class="nav-toggle__label">{UI[lang].menu}</span>
      </button>
    </div>
    <nav
      id="site-navigation"
      class="site-nav"
      data-site-nav
      aria-label={lang === 'zh' ? '主导航' : 'Main navigation'}
    >
      {NAV[lang].map((item) => <a class="nav-link" href={withBase(item.path)}>{item.label}</a>)}
    </nav>
  </div>
</header>

<noscript>
  <style>
    .nav-toggle { display: none !important; }
    @media (max-width: 760px) {
      .site-nav { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</noscript>

<script>
  let controller: AbortController | null = null;

  function init(): void {
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;

    const header = document.querySelector<HTMLElement>('[data-site-header]');
    const toggle = header?.querySelector<HTMLButtonElement>('[data-nav-toggle]');
    const nav = header?.querySelector<HTMLElement>('[data-site-nav]');
    if (!header || !toggle || !nav) return;

    const mobile = window.matchMedia('(max-width: 760px)');

    const setOpen = (open: boolean, focusToggle = false): void => {
      nav.classList.toggle('is-open', open);
      toggle.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (focusToggle) toggle.focus();
    };

    setOpen(false);

    toggle.addEventListener(
      'click',
      () => setOpen(!nav.classList.contains('is-open')),
      { signal },
    );

    nav.addEventListener(
      'click',
      (event) => {
        if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
      },
      { signal },
    );

    document.addEventListener(
      'click',
      (event) => {
        if (!mobile.matches || !nav.classList.contains('is-open')) return;
        if (!(event.target instanceof Node) || !header.contains(event.target)) setOpen(false);
      },
      { signal },
    );

    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && nav.classList.contains('is-open')) {
          event.preventDefault();
          setOpen(false, true);
        }
      },
      { signal },
    );

    mobile.addEventListener('change', () => setOpen(false), { signal });
  }

  const start = (): void => {
    if (document.querySelector('[data-site-header]')) init();
  };

  document.addEventListener('astro:page-load', start);
  if (document.readyState !== 'loading') start();
</script>
```

- [ ] **Step 5: Add desktop header styles**

In `src/styles/global.css`, replace the existing `.site-header .wrap` and `.site-nav` declarations with the following behavior:

```css
.site-header .wrap {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-2);
  flex-wrap: wrap;
}

.site-name {
  order: 1;
}

.site-nav {
  display: flex;
  order: 2;
  gap: var(--space-2);
  margin-left: auto;
  align-items: center;
  flex-wrap: wrap;
}

.header-tools {
  display: flex;
  order: 3;
  align-items: center;
  gap: var(--space-2);
}

.nav-toggle {
  display: none;
}
```

Keep the existing `.site-nav a.nav-link` and `.icon-btn` rules; add the mobile breakpoint:

```css
@media (max-width: 760px) {
  .site-header .wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2);
  }

  .site-name {
    grid-column: 1;
    min-width: 0;
  }

  .header-tools {
    grid-column: 2;
    justify-self: end;
  }

  .nav-toggle {
    display: inline-flex;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
    padding: 0.35em 0.65em;
  }

  .site-nav {
    display: none;
    grid-column: 1 / -1;
    width: 100%;
    margin: 0;
    padding-top: var(--space-2);
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .site-nav.is-open {
    display: grid;
  }

  .site-nav a.nav-link {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0.55em 0.7em;
    text-align: center;
  }
}
```

- [ ] **Step 6: Override the old 700px header rules**

Append a final block to `src/styles/world.css` so the loaded CSS cannot keep the old centered/wrapping header layout:

```css
@media (max-width: 760px) {
  .site-header .wrap {
    justify-content: normal;
    flex-wrap: nowrap;
  }

  .site-nav {
    margin-left: 0;
  }
}
```

This block comes after the existing minified `@media(max-width:700px)` rule and intentionally overrides only the conflicting flex properties.

- [ ] **Step 7: Run targeted tests and type check**

Run:

```powershell
npx vitest run tests/header-mobile-nav.test.ts tests/post-share-ui.test.ts
npm run check
```

Expected: all targeted tests pass and Astro reports 0 errors.

- [ ] **Step 8: Commit**

```powershell
git add src/components/Header.astro src/consts.ts src/styles/global.css src/styles/world.css tests/header-mobile-nav.test.ts
git commit -m "feat(nav): add collapsible mobile navigation"
```

---

### Task 4: 全量验证与浏览器验收

**Files:**
- Verify: `dist/zh/index.html`
- Verify: `dist/en/index.html`
- Verify: `dist/zh/posts/*/index.html`
- Verify: `dist/en/posts/*/index.html`

- [ ] **Step 1: Run static verification**

Run:

```powershell
npm run check
npm test
npm run build
npm run verify:frontend
```

Expected: all commands exit `0`; `npm test` includes the new share and navigation tests.

- [ ] **Step 2: Start a local preview**

Run in a separate terminal:

```powershell
npm run preview -- --host 127.0.0.1
```

Expected: Astro preview starts and serves the built site locally.

- [ ] **Step 3: Verify mobile layout**

Inspect `http://127.0.0.1:4321/zh/` at `390px`:

- Header is one row when the menu is closed.
- Opening the menu shows all 9 links in two columns without horizontal overflow.
- Clicking outside, `Escape`, and clicking a link close/reload correctly.
- Opening the menu and resizing past `760px` switches to the desktop nav without duplicate links.

- [ ] **Step 4: Verify share behavior**

Open a post page and check:

- Desktop: the share button copies the canonical URL and shows `已复制`.
- Browser with native Web Share: the button opens the share sheet.
- Cancelling the share sheet leaves no error text.
- Denying clipboard access shows `复制失败` and the button becomes usable again.

- [ ] **Step 5: Verify themes and reduced motion**

Repeat the header and share checks in light theme, dark theme, and with reduced motion enabled. Expected: no overflow, no missing focus, and no transition that ignores the preference.

- [ ] **Step 6: Final commit if verification required fixes**

If browser verification required changes, commit only those fixes:

```powershell
git add src tests
git commit -m "fix: polish mobile navigation and sharing"
```

If no changes are required, do not create an empty commit.

---

## Plan Self-Review

- Spec coverage: Task 1 covers share result handling; Task 2 covers copy, slot placement, canonical URL and i18n; Task 3 covers the 760px disclosure menu, outside click, `Escape`, responsive reset and no-script fallback; Task 4 covers build, browser and accessibility checks.
- Placeholder scan: no TBD/TODO markers; every code step includes concrete files and code.
- Type consistency: `shareOrCopy`, `ShareResult`, `ShareOrCopyOptions`, `PostShare` props and the `data-*` names are identical across tasks.
