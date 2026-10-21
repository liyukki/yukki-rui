import { describe, expect, it } from 'vitest';
import {
  commentThread,
  commentsApiUrl,
  commentsEndpoint,
  formatCommentTime,
  reactionsEndpoint,
} from '../src/lib/comments';

describe('commentThread：两种部署下的同一篇文章必须得到同一个 thread', () => {
  it('Cloudflare 部署（base 为 /）原样返回', () => {
    expect(commentThread('/zh/posts/hello-world/', '/')).toBe('/zh/posts/hello-world/');
  });

  it('GitHub Pages 部署（base 为 /yukki-rui/）去掉 base 后与上面一致', () => {
    expect(commentThread('/yukki-rui/zh/posts/hello-world/', '/yukki-rui/')).toBe('/zh/posts/hello-world/');
  });

  it('base 不带尾斜杠也认', () => {
    expect(commentThread('/yukki-rui/zh/about/', '/yukki-rui')).toBe('/zh/about/');
  });

  it('只去掉完整的 base 段，不误伤同前缀路径', () => {
    expect(commentThread('/yukki-rui-other/zh/', '/yukki-rui/')).toBe('/yukki-rui-other/zh/');
  });

  it('合并多余斜杠、补齐首尾斜杠', () => {
    expect(commentThread('/zh//posts///hello//', '/')).toBe('/zh/posts/hello/');
    expect(commentThread('zh/posts/hello', '/')).toBe('/zh/posts/hello/');
  });

  it('去掉查询串与锚点', () => {
    expect(commentThread('/zh/posts/hello/?from=rss#comments', '/')).toBe('/zh/posts/hello/');
  });

  it('百分号编码的中文路径保持编码形态', () => {
    expect(commentThread('/zh/posts/%E5%9C%A8%E7%BA%BF/', '/')).toBe('/zh/posts/%E5%9C%A8%E7%BA%BF/');
  });

  it('空值或非法字符退化成根路径', () => {
    expect(commentThread('', '/')).toBe('/');
    expect(commentThread('/zh/posts/a?b=<script>', '/')).toBe('/zh/posts/a/');
  });
});

describe('commentsEndpoint：构建期决定相对还是绝对地址', () => {
  it('部署源与主站一致时用相对路径', () => {
    expect(commentsEndpoint('https://yukki-rui.pages.dev', 'https://yukki-rui.pages.dev')).toBe('');
  });

  it('镜像部署（GitHub Pages）用主站绝对地址', () => {
    expect(commentsEndpoint('https://liyukki.github.io', 'https://yukki-rui.pages.dev')).toBe(
      'https://yukki-rui.pages.dev/api/comments',
    );
  });

  it('主站地址带尾斜杠也不会拼出双斜杠', () => {
    expect(commentsEndpoint('https://liyukki.github.io', 'https://yukki-rui.pages.dev/')).toBe(
      'https://yukki-rui.pages.dev/api/comments',
    );
  });
});

describe('reactionsEndpoint：由评论地址推导同源 reactions 地址', () => {
  it('同源相对地址与跨域绝对地址都能正确推导', () => {
    expect(reactionsEndpoint('')).toBe('/api/reactions');
    expect(reactionsEndpoint('https://yukki-rui.pages.dev/api/comments')).toBe(
      'https://yukki-rui.pages.dev/api/reactions',
    );
    expect(reactionsEndpoint('https://yukki-rui.pages.dev/api/comments/')).toBe(
      'https://yukki-rui.pages.dev/api/reactions',
    );
  });
});

describe('commentsApiUrl：运行期决定请求落到哪里', () => {
  it('同源页面用相对路径', () => {
    expect(commentsApiUrl('https://yukki-rui.pages.dev', 'https://yukki-rui.pages.dev/api/comments')).toBe(
      '/api/comments',
    );
  });

  it('本机预览（wrangler pages dev）用相对路径', () => {
    expect(commentsApiUrl('http://localhost:8788', '')).toBe('/api/comments');
    expect(commentsApiUrl('http://127.0.0.1:8788', '')).toBe('/api/comments');
  });

  it('镜像站用绝对地址', () => {
    expect(commentsApiUrl('https://liyukki.github.io', 'https://yukki-rui.pages.dev/api/comments')).toBe(
      'https://yukki-rui.pages.dev/api/comments',
    );
  });
});

describe('formatCommentTime', () => {
  it('非法输入返回空串，不抛异常', () => {
    expect(formatCommentTime('not-a-date', 'zh')).toBe('');
    expect(formatCommentTime('', 'en')).toBe('');
  });

  it('合法 ISO 时间给出可读文案', () => {
    expect(formatCommentTime('2026-10-18T05:06:00.000Z', 'zh')).toMatch(/\d{2}:\d{2}/);
    expect(formatCommentTime('2026-10-18T05:06:00.000Z', 'en')).toMatch(/\d/);
  });
});
