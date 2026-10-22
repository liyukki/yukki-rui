/**
 * 文章点赞的纯逻辑助手。
 *
 * translationKey 是内容的“同一篇文章”标识：中文和英文翻译使用同一个值，
 * 因而点赞数可以跨语言共享。没有译文时退回当前文章 id。
 */

export interface PostLikeSubject {
  id: string;
  data: {
    translationKey?: string;
  };
}

export interface PostLikeState {
  count: number;
  liked: boolean;
}

/** 生成 D1 中使用的稳定文章键。 */
export function postLikeKey(post: PostLikeSubject): string {
  const translationKey = String(post.data.translationKey ?? '').trim();
  return translationKey ? `translation:${translationKey}` : `post:${post.id}`;
}

/** 由评论 API 基址推导同源的 post-likes 地址。 */
export function postLikesEndpoint(commentsApiBase: string): string {
  const base = String(commentsApiBase ?? '').trim();
  if (!base) return '/api/post-likes';
  return base.replace(/\/api\/comments\/?$/, '/api/post-likes');
}

/**
 * 服务端响应不可信：只读取自有数据属性，避免 getter 或 Proxy 的异常取值逻辑。
 * 计数必须是有限、非负的安全整数。
 */
export function parsePostLikeState(value: unknown): PostLikeState | null {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

    const countField = Object.getOwnPropertyDescriptor(value, 'count');
    const likedField = Object.getOwnPropertyDescriptor(value, 'liked');
    if (!countField || !likedField || !('value' in countField) || !('value' in likedField)) {
      return null;
    }

    const count = countField.value;
    const liked = likedField.value;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return null;
    if (typeof liked !== 'boolean') return null;

    return { count, liked };
  } catch {
    return null;
  }
}

/** 先在本地切换状态，网络成功后仍以服务端返回值为准。 */
export function togglePostLikeState(state: PostLikeState): PostLikeState {
  return state.liked
    ? { count: Math.max(0, state.count - 1), liked: false }
    : { count: state.count + 1, liked: true };
}
