import { getEntry, type CollectionEntry } from 'astro:content';
import { HERO_IMAGE, type Lang } from '../consts';
import { pickHeroImage } from './hero-image';

export type SiteInfo = CollectionEntry<'site'>['data'];

/**
 * 读取某语言的个人资料；文件缺失时返回 undefined，由调用方套用代码内兜底文案。
 *
 * 为什么用「代码兜底 + 集合覆盖」而不是「集合必填」：
 * 站点主人随时可能在 CMS 里清空某个字段，那不该让构建失败或页面开天窗 ——
 * 页面渲染规则是「字段为空就用代码里那份默认文案」，这条规则集中在
 * getSiteInfo 的调用处（首页、关于页），与草稿规则集中在 post-select 是同一个思路。
 */
export async function getSiteInfo(lang: Lang): Promise<SiteInfo | undefined> {
  // id 由 content.config.ts 里 site 集合的 generateId 保证等于 lang
  const entry = await getEntry('site', lang);
  return entry?.data;
}

/**
 * 形象照的统一解析入口（首页与关于页共用）。
 *
 * 数据搬运与默认值填充在这里，选取规则在 hero-image.ts 的纯函数里：
 * 本语言照片优先 → 另一语言的照片（传一次两边都显示）→ consts.ts 的 HERO_IMAGE。
 * 尺寸缺失时同样回落到 HERO_IMAGE 的宽高，防止布局跳动。
 */
export async function getHeroImage(
  lang: Lang,
): Promise<{ src: string; width: number; height: number }> {
  const other: Lang = lang === 'zh' ? 'en' : 'zh';
  const picked = pickHeroImage(
    (await getSiteInfo(lang))?.heroImage,
    (await getSiteInfo(other))?.heroImage,
  );
  if (picked?.src) {
    return {
      src: picked.src,
      width: picked.width ?? HERO_IMAGE.width,
      height: picked.height ?? HERO_IMAGE.height,
    };
  }
  return { src: HERO_IMAGE.src, width: HERO_IMAGE.width, height: HERO_IMAGE.height };
}
