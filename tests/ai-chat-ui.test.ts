import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildChatRequestPayload,
  chatI18n,
  resolveChatPageContext,
  shouldShowQuickPrompts,
} from '../src/lib/chat';
import { parseAiIndex } from '../src/lib/ai-context';

const component = readFileSync('src/components/AiChat.astro', 'utf8');
const baseLayout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
const postLayout = readFileSync('src/layouts/PostLayout.astro', 'utf8');
const consts = readFileSync('src/consts.ts', 'utf8');

describe('文章问答界面接入', () => {
  it('文章页把文章 id 传到聊天组件，并留下跨页可读取的页面标记', () => {
    expect(postLayout).toContain('aiArticleId={post.id}');
    expect(baseLayout).toContain('data-ai-page-context');
    expect(baseLayout).toContain('data-article-id={aiArticleId ?? \'\'}');
    expect(baseLayout).toContain('<AiChat lang={lang} articleId={aiArticleId} />');
  });

  it('聊天组件加载索引并生成来源卡片', () => {
    for (const token of [
      'data-context-enabled',
      'data-index={indexSrc}',
      'data-chat-quick',
      'data-chat-prompt',
      'buildChatRequestPayload',
      'parseAiIndex',
      'renderSources',
      'syncPageContext',
      'welcome.bubble.dataset.chatWelcome',
      'ai-chat-sources',
      'link.textContent',
      'link.href = sourceHref',
    ]) {
      expect(component).toContain(token);
    }
    expect(component).not.toMatch(/\.innerHTML\s*=/);
    expect(component).not.toContain('${index + 1}. ${source.title}');
  });

  it('来源链接在组件内防御性复核站内路径', () => {
    const helper = component.match(/function sourceHref\(source: AiSource\): string \{[\s\S]*?\n    \}/u)?.[0] ?? '';
    expect(helper).not.toBe('');

    for (const token of [
      "source.url.startsWith('/')",
      "source.url.startsWith('//')",
      "source.url.includes('//')",
      '/[\\u0000-\\u001f\\u007f-\\u009f\\s]/u.test',
      "source.url.includes('..')",
      "source.url.includes('\\\\')",
      '/[?#]/u.test',
      '/%(?![0-9a-f]{2})/iu.test',
      'while (/%[0-9a-f]{2}/iu.test(decoded))',
      'decodeURIComponent(decoded)',
      'if (unsafePathPart(decoded)',
      'catch',
      'encodeURIComponent(source.anchor)',
      'link.href = sourceHref(source)',
      'link.removeAttribute(\'href\')',
    ]) {
      expect(token === 'link.href = sourceHref(source)' || token === "link.removeAttribute('href')" ? component : helper).toContain(token);
    }

    // 每一轮 decode 之后都必须重新拒绝任意位置的 //，而不只是开头。
    expect(helper).toMatch(/value\.includes\('\/\/'\)/u);
  });

  it('快捷问题和来源文案在中英文都存在', () => {
    for (const key of [
      'aiContextUnavailable',
      'aiSources',
      'aiQuickSummary',
      'aiQuickPoints',
      'aiQuickExplain',
      'aiQuickRelated',
    ]) {
      expect(consts.match(new RegExp(`${key}:`, 'g'))?.length).toBe(2);
    }
  });

  it('配置里包含可回退的 contextEnabled 开关', () => {
    expect(consts).toMatch(/export const AI_CHAT = \{[\s\S]*contextEnabled: true,/);
  });
});

describe('跨页问答状态刷新', () => {
  it('文章页切到非文章页后清空当前文章并隐藏快捷问题', () => {
    const next = resolveChatPageContext(
      { lang: 'zh', articleId: '' },
      { lang: 'zh', articleId: 'zh/posts/previous' },
    );

    expect(next.articleId).toBe('');
    expect(shouldShowQuickPrompts(true, next.articleId, 0)).toBe(false);
    expect(component).toContain('resolveChatPageContext(');
    expect(component).toContain('shouldShowQuickPrompts(');
  });

  it('中文文章切到英文文章后使用英文快捷问题并生成 en context 请求体', () => {
    const next = resolveChatPageContext(
      { lang: 'en', articleId: 'en/posts/next' },
      { lang: 'zh', articleId: 'zh/posts/previous' },
    );
    const t = chatI18n(next.lang);
    const index = parseAiIndex({
      version: 1,
      lang: 'en',
      posts: [
        {
          id: 'en/posts/next',
          title: 'English post',
          description: 'English summary',
          url: '/en/posts/next/',
          tags: ['writing'],
        },
      ],
      chunks: [
        {
          id: 'en/posts/next:summary',
          postId: 'en/posts/next',
          title: 'English post',
          url: '/en/posts/next/',
          heading: 'Summary',
          anchor: 'summary',
          text: 'Summarize this post with one key point.',
        },
      ],
    });
    const messages = [{ role: 'user' as const, content: t.quickSummary }];
    const payload = buildChatRequestPayload(messages, t.quickSummary, next.lang, next.articleId, index);

    expect(t.quickSummary).toBe('Summarize this post');
    expect(payload.context?.lang).toBe('en');
    expect(payload.context?.currentPostId).toBe('en/posts/next');
    expect(payload.context?.sources.length).toBeGreaterThan(0);
  });
});
