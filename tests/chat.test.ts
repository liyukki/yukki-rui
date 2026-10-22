import { describe, expect, it } from 'vitest';
import {
  chatApiUrl,
  chatEndpoint,
  chatErrorMessage,
  createSseParser,
  extractChatDelta,
  normalizeChatMessages,
} from '../src/lib/chat';

describe('chatEndpoint / chatApiUrl', () => {
  it('Cloudflare 同源使用相对地址', () => {
    expect(chatEndpoint('https://yukki-rui.pages.dev', 'https://yukki-rui.pages.dev')).toBe('');
    expect(chatApiUrl('https://yukki-rui.pages.dev', '')).toBe('/api/chat');
  });

  it('GitHub Pages 镜像使用主站地址', () => {
    expect(chatEndpoint('https://liyukki.github.io', 'https://yukki-rui.pages.dev')).toBe(
      'https://yukki-rui.pages.dev/api/chat',
    );
    expect(chatApiUrl('https://liyukki.github.io', 'https://yukki-rui.pages.dev/api/chat')).toBe(
      'https://yukki-rui.pages.dev/api/chat',
    );
  });

  it('本地预览始终走同源相对地址', () => {
    expect(chatApiUrl('http://127.0.0.1:4321', 'https://yukki-rui.pages.dev/api/chat')).toBe('/api/chat');
  });
});

describe('normalizeChatMessages', () => {
  it('过滤空白与非法角色，只保留最后 20 条', () => {
    const input = [
      { role: 'system', content: 'ignore' },
      { role: 'user', content: '  第一问  ' },
      { role: 'assistant', content: '第一答' },
      { role: 'user', content: '   ' },
      ...Array.from({ length: 21 }, (_, index) => ({ role: 'user', content: `问 ${index}` })),
    ];
    const result = normalizeChatMessages(input);
    expect(result).toHaveLength(20);
    expect(result[0].content).toBe('问 1');
    expect(result.at(-1)?.content).toBe('问 20');
    expect(result.every((item) => item.role === 'user' || item.role === 'assistant')).toBe(true);
  });

  it('去除首尾空白但保留消息内部换行', () => {
    expect(normalizeChatMessages([{ role: 'user', content: '  第一行\n第二行  ' }])).toEqual([
      { role: 'user', content: '第一行\n第二行' },
    ]);
  });

  it('拒绝恶意对象与超长内容', () => {
    const hostile = { toString: null, valueOf: null };
    expect(normalizeChatMessages([{ role: 'user', content: hostile }])).toEqual([]);
    expect(normalizeChatMessages([{ role: 'user', content: '字'.repeat(8001) }])).toEqual([]);
    expect(normalizeChatMessages('not-an-array')).toEqual([]);
  });
});

describe('extractChatDelta', () => {
  it('读取 OpenAI 流式 delta', () => {
    expect(extractChatDelta(JSON.stringify({ choices: [{ delta: { content: '你好' } }] }))).toBe('你好');
  });

  it('兼容 message.content、text 和 [DONE]', () => {
    expect(extractChatDelta(JSON.stringify({ choices: [{ message: { content: '完整回复' } }] }))).toBe('完整回复');
    expect(extractChatDelta(JSON.stringify({ choices: [{ text: '旧格式' }] }))).toBe('旧格式');
    expect(extractChatDelta('[DONE]')).toBe('');
  });

  it('忽略空内容和坏 JSON', () => {
    expect(extractChatDelta(JSON.stringify({ choices: [{ delta: { content: '' } }] }))).toBe('');
    expect(extractChatDelta('{oops')).toBe('');
    expect(extractChatDelta(JSON.stringify({ choices: [] }))).toBe('');
  });
});

describe('createSseParser', () => {
  it('跨 chunk 拼接并处理多行 data', () => {
    const output: string[] = [];
    const parser = createSseParser((data) => output.push(data));
    parser.push('data: {"choices":[{"delta":');
    parser.push('{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\r');
    parser.push('\n\r\n');
    parser.finish();
    expect(output).toHaveLength(2);
    expect(JSON.parse(output[0]).choices[0].delta.content).toBe('你');
    expect(JSON.parse(output[1]).choices[0].delta.content).toBe('好');
  });

  it('合并同一事件的多行 data 并忽略注释', () => {
    const output: string[] = [];
    const parser = createSseParser((data) => output.push(data));
    parser.push(': keep-alive\n\n');
    parser.push('data: 第一行\ndata: 第二行\n\n');
    parser.finish();
    expect(output).toEqual(['第一行\n第二行']);
  });

  it('flush 没有结尾空行的最后一个事件', () => {
    const output: string[] = [];
    const parser = createSseParser((data) => output.push(data));
    parser.push('data: [DONE]');
    parser.finish();
    expect(output).toEqual(['[DONE]']);
  });
});

describe('chatErrorMessage', () => {
  it('把关键错误映射成可直接展示的双语文案', () => {
    expect(chatErrorMessage(503, 'ai-not-configured', 'zh')).toContain('尚未配置');
    expect(chatErrorMessage(429, 'rate-limited', 'zh')).toContain('太频繁');
    expect(chatErrorMessage(429, 'ai-rate-limited', 'en')).toContain('Too many');
    expect(chatErrorMessage(502, 'upstream-auth', 'zh')).toContain('授权');
    expect(chatErrorMessage(502, 'upstream-unavailable', 'en')).toContain('unavailable');
    expect(chatErrorMessage(400, 'invalid-messages', 'zh')).toContain('消息');
  });
});

