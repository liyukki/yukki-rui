import { describe, expect, it } from 'vitest';
import {
  buildOgCard,
  clampText,
  ogImagePath,
  ogTextLimits,
  OG_HEIGHT,
  OG_WIDTH,
} from '../src/lib/og';

describe('ogImagePath', () => {
  it('普通 id 直接拼成 /og/<id>.png', () => {
    expect(ogImagePath('hello-world')).toBe('/og/hello-world.png');
  });

  it('中文 id 原样保留（由部署层做 URL 编码）', () => {
    expect(ogImagePath('在线后台成功上线')).toBe('/og/在线后台成功上线.png');
  });

  it('去掉 id 里的点，与 Astro 路由参数的行为保持一致', () => {
    expect(ogImagePath('hello-world.en')).toBe('/og/hello-worlden.png');
  });
});

describe('clampText', () => {
  it('短文本原样返回并压平空白', () => {
    expect(clampText('  你好 \n 世界  ', 20)).toBe('你好 世界');
  });

  it('超长文本截断并补省略号', () => {
    const result = clampText('一二三四五六七八九十', 5);
    expect(result).toBe('一二三四…');
    expect([...result].length).toBe(5);
  });

  it('按字符而不是字节计算，中文不会被切坏', () => {
    expect(clampText('中文标题', 4)).toBe('中文标题');
  });
});

describe('ogTextLimits', () => {
  it('中文版面能放的标题比英文短', () => {
    expect(ogTextLimits('zh').title).toBeLessThan(ogTextLimits('en').title);
    expect(ogTextLimits('zh').description).toBeLessThan(ogTextLimits('en').description);
  });
});

describe('buildOgCard', () => {
  const base = {
    title: '用 Markdown 写作',
    description: '这是一篇讲 Markdown 的文章。',
    lang: 'zh' as const,
    tags: ['Markdown', '写作'],
    dateLabel: '2026年10月12日',
    siteName: 'yukki rui',
    siteUrl: 'yukki-rui.pages.dev',
  };

  it('卡片尺寸固定为 1200×630', () => {
    const card = buildOgCard(base);
    expect(card.props.style.width).toBe(`${OG_WIDTH}px`);
    expect(card.props.style.height).toBe(`${OG_HEIGHT}px`);
  });

  it('标题、摘要、站名、日期都进卡片', () => {
    const flat = JSON.stringify(buildOgCard(base));
    expect(flat).toContain('用 Markdown 写作');
    expect(flat).toContain(base.description);
    expect(flat).toContain('yukki rui');
    expect(flat).toContain('2026年10月12日');
  });

  it('超长标题会被截断，不会撑破版面', () => {
    const longTitle = '这是一个非常非常非常非常非常非常非常非常长的标题'.repeat(3);
    const flat = JSON.stringify(buildOgCard({ ...base, title: longTitle }));
    expect(flat).not.toContain(longTitle);
    expect(flat).toContain('…');
  });

  it('标签最多展示 3 个', () => {
    const flat = JSON.stringify(buildOgCard({ ...base, tags: ['一', '二', '三', '四'] }));
    expect(flat).toContain('#一');
    expect(flat).toContain('#三');
    expect(flat).not.toContain('#四');
  });

  it('没有标签时不渲染标签行', () => {
    const flat = JSON.stringify(buildOgCard({ ...base, tags: [] }));
    // 配色里的 #fdf3e3 之类是十六进制色值，不算标签；标签长这样：#Markdown
    expect(flat.match(/#(?![0-9a-fA-F]{3,8}\b)/g)).toBeNull();
  });

  it('英文语言标记与其他字段按英文渲染', () => {
    const flat = JSON.stringify(buildOgCard({ ...base, lang: 'en', title: 'Writing in Markdown' }));
    expect(flat).toContain('EN');
    expect(flat).toContain('Writing in Markdown');
  });
});
