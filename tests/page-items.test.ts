import { describe, expect, it } from 'vitest';
import { normalizeItems } from '../src/lib/page-items';

describe('normalizeItems', () => {
  it('没有标题的条目被丢掉(后台里点出来的半成品)', () => {
    expect(normalizeItems([{ title: '  ' }, { title: '在听', meta: 'hitorie' }])).toEqual([
      { title: '在听', meta: 'hitorie' },
    ]);
  });

  it('缺失或空数组返回空列表', () => {
    expect(normalizeItems(undefined)).toEqual([]);
    expect(normalizeItems([])).toEqual([]);
  });

  it('文本去掉首尾空白,空字符串字段不出现', () => {
    const [item] = normalizeItems([{ title: '  loveless  ', meta: '  ', text: '  hitorie  ' }]);
    expect(item).toEqual({ title: 'loveless', text: 'hitorie' });
  });

  it('链接必须文字与地址成对,只有一半就当作没填', () => {
    expect(normalizeItems([{ title: 'a', linkLabel: '线上地址' }])[0].link).toBeUndefined();
    expect(normalizeItems([{ title: 'a', linkUrl: 'https://example.com' }])[0].link).toBeUndefined();
    expect(normalizeItems([{ title: 'a', linkLabel: '线上地址', linkUrl: ' https://example.com ' }])[0].link).toEqual({
      label: '线上地址',
      url: 'https://example.com',
    });
  });

  it('状态与顺序原样保留', () => {
    const items = normalizeItems([
      { title: '一', status: 'LIVE' },
      { title: '二', status: 'WIP' },
      { title: '三' },
    ]);
    expect(items.map((item) => item.title)).toEqual(['一', '二', '三']);
    expect(items[0].status).toBe('LIVE');
    expect(items[1].status).toBe('WIP');
    expect(items[2].status).toBeUndefined();
  });
});

