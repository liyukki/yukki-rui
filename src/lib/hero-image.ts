/**
 * 形象照的跨语言解析规则（纯函数，可单测）。
 *
 * 照片不是语言特定的内容：站长在后台传一次，中文和英文页都应显示。
 * 规则 = 本语言资料里的照片优先；本语言没有就用另一语言的
 * （想分语言各用一张时，在两个语言的「个人资料 → 形象照片」各传一张即可）。
 * 两边都没有时返回 undefined，由调用方回落到 consts.ts 的 HERO_IMAGE。
 */
export type HeroImageInfo = { src?: string; width?: number; height?: number };

export function pickHeroImage(
  own: HeroImageInfo | undefined,
  other: HeroImageInfo | undefined,
): HeroImageInfo | undefined {
  if (own?.src) return own;
  if (other?.src) return other;
  return undefined;
}
