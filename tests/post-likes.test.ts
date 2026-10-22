import { describe, expect, it } from 'vitest';
import {
  parsePostLikeState,
  postLikeKey,
  postLikesEndpoint,
  togglePostLikeState,
} from '../src/lib/post-likes';

describe('postLikeKey：中英文译文共享同一个点赞键', () => {
  it('有 translationKey 时忽略语言与文件 id', () => {
    expect(postLikeKey({ id: 'hello-world', data: { translationKey: 'hello-world' } })).toBe(
      'translation:hello-world',
    );
    expect(postLikeKey({ id: 'hello-worlden', data: { translationKey: 'hello-world' } })).toBe(
      'translation:hello-world',
    );
  });

  it('translationKey 会去除首尾空白', () => {
    expect(postLikeKey({ id: 'x', data: { translationKey: '  shared  ' } })).toBe('translation:shared');
  });

  it('没有译文时使用文章 id', () => {
    expect(postLikeKey({ id: 'building-this-site', data: {} })).toBe('post:building-this-site');
    expect(postLikeKey({ id: '在线后台成功上线', data: {} })).toBe('post:在线后台成功上线');
  });

  it('空白 translationKey 视为没有译文', () => {
    expect(postLikeKey({ id: 'hello-world', data: { translationKey: '   ' } })).toBe('post:hello-world');
  });
});

describe('postLikesEndpoint：从评论地址推导点赞地址', () => {
  it('同源相对地址', () => {
    expect(postLikesEndpoint('')).toBe('/api/post-likes');
  });

  it('跨域绝对地址', () => {
    expect(postLikesEndpoint('https://yukki-rui.pages.dev/api/comments')).toBe(
      'https://yukki-rui.pages.dev/api/post-likes',
    );
    expect(postLikesEndpoint('https://yukki-rui.pages.dev/api/comments/')).toBe(
      'https://yukki-rui.pages.dev/api/post-likes',
    );
  });
});

describe('parsePostLikeState：只接受合法服务端状态', () => {
  it('解析计数与已赞状态', () => {
    expect(parsePostLikeState({ count: 12, liked: true })).toEqual({ count: 12, liked: true });
  });

  it('拒绝负数、小数、错误类型与恶意对象', () => {
    for (const value of [
      null,
      {},
      { count: -1, liked: true },
      { count: 1.5, liked: true },
      { count: '1', liked: true },
      { count: 1, liked: 'true' },
      { count: { valueOf: null }, liked: true },
    ]) {
      expect(parsePostLikeState(value)).toBeNull();
    }
  });

  it('拒绝 getter 和代理异常，不执行不可信取值逻辑', () => {
    const getterState = Object.defineProperty({ liked: true }, 'count', {
      enumerable: true,
      get() {
        throw new Error('must not run');
      },
    });
    expect(parsePostLikeState(getterState)).toBeNull();

    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('hostile proxy');
        },
      },
    );
    expect(parsePostLikeState(hostile)).toBeNull();
  });
});

describe('togglePostLikeState：乐观更新不会产生负数', () => {
  it('未赞时加一，已赞时减一', () => {
    expect(togglePostLikeState({ count: 3, liked: false })).toEqual({ count: 4, liked: true });
    expect(togglePostLikeState({ count: 3, liked: true })).toEqual({ count: 2, liked: false });
  });

  it('异常零计数也不会变成负数', () => {
    expect(togglePostLikeState({ count: 0, liked: true })).toEqual({ count: 0, liked: false });
  });
});
