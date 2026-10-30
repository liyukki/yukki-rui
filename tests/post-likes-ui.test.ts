import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync('src/layouts/PostLayout.astro', 'utf8');
const componentPath = 'src/components/PostLikes.astro';

function componentSource() {
  return readFileSync(componentPath, 'utf8');
}

describe('文章点赞组件接入', () => {
  it('位于上一篇/下一篇和评论区之间，并把共享文章键传给组件', () => {
    const nav = layout.indexOf('<PostNav');
    const likes = layout.indexOf('<PostLikes');
    const comments = layout.indexOf('<Comments');
    expect(nav).toBeGreaterThanOrEqual(0);
    expect(likes).toBeGreaterThan(nav);
    expect(comments).toBeGreaterThan(likes);
    expect(layout).toContain("import PostLikes from '../components/PostLikes.astro'");
    expect(layout).toContain("import { postLikeKey } from '../lib/post-likes'");
    expect(layout).toContain('<PostLikes');
    expect(layout).toContain('lang={lang}');
    expect(layout).toContain('postKey={postLikeKey(post)}');
    expect(layout).toContain('<PostShare');
    expect(layout.indexOf('<PostShare')).toBeLessThan(layout.indexOf('</PostLikes>'));
  });

  it('提供稳定的 DOM 契约和无障碍状态', () => {
    const source = componentSource();
    for (const token of [
      'data-post-likes',
      'data-like-button',
      'data-like-label',
      'data-like-count',
      'data-like-status',
      'aria-pressed="false"',
      'role="status"',
      'aria-live="polite"',
    ]) {
      expect(source).toContain(token);
    }
  });

  it('只接受合法服务端状态，并包含请求锁与失败回滚', () => {
    const source = componentSource();
    expect(source).toContain('parsePostLikeState');
    expect(source).toContain('const previous = state');
    expect(source).toContain('togglePostLikeState');
    expect(source).toContain('state = previous');
    expect(source).toMatch(/button\.disabled = true/);
    expect(source).toMatch(/button\.disabled = false/);
    expect(source).toContain("document.addEventListener('astro:page-load'");
    expect(source).not.toMatch(/\.innerHTML\s*=/);
  });

  it('所有动态文案都用 textContent 写入', () => {
    const source = componentSource();
    expect(source).toMatch(/label\.textContent\s*=/);
    expect(source).toMatch(/count\.textContent\s*=/);
    expect(source).toMatch(/status\.textContent\s*=/);
  });

  it('中英文点赞文案齐全', () => {
    const consts = readFileSync('src/consts.ts', 'utf8');
    for (const key of [
      'postLikes',
      'postLike',
      'postLiked',
      'postLikeLoading',
      'postLikeLoadError',
      'postLikeUnavailable',
      'postLikeFailed',
    ]) {
      expect(consts.match(new RegExp(`${key}:`, 'g'))?.length).toBe(2);
    }
  });
});
