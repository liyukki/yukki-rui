import { describe, expect, it } from 'vitest';
import { pickHeroImage } from '../src/lib/hero-image';

describe('pickHeroImage（形象照跨语言同步规则）', () => {
  it('本语言有照片时用本语言的（分语言各自上传时互不干扰）', () => {
    const own = { src: '/uploads/zh.png', width: 200, height: 200 };
    const other = { src: '/uploads/en.png', width: 320, height: 320 };
    expect(pickHeroImage(own, other)).toEqual(own);
  });

  it('本语言没有照片时回退到另一语言（传一次两边都显示）', () => {
    const other = { src: '/uploads/zh.png', width: 200, height: 200 };
    expect(pickHeroImage(undefined, other)).toEqual(other);
    expect(pickHeroImage({}, other)).toEqual(other);
  });

  it('本语言 src 为空字符串视为没有照片', () => {
    const other = { src: '/uploads/zh.png' };
    expect(pickHeroImage({ src: '', width: 320, height: 320 }, other)).toEqual(other);
  });

  it('本语言只有尺寸没有 src 时也回退另一语言', () => {
    const other = { src: '/uploads/zh.png', width: 100, height: 100 };
    expect(pickHeroImage({ width: 640, height: 480 }, other)).toEqual(other);
  });

  it('两边都没有照片返回 undefined（由调用方回落到 HERO_IMAGE）', () => {
    expect(pickHeroImage(undefined, undefined)).toBeUndefined();
    expect(pickHeroImage({ src: '' }, { src: '' })).toBeUndefined();
  });
});
