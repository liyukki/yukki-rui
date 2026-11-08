import type { Lang } from '../consts';

export interface LanguageSwitchTarget {
  lang: Lang;
  href: string | null;
  available: boolean;
}

/**
 * Resolve the other-language control without guessing an equivalent URL.
 * Callers must provide the real counterpart page (already including the base).
 */
export function resolveLanguageSwitch(
  lang: Lang,
  languageSwitchUrl?: string,
): LanguageSwitchTarget {
  const targetLang: Lang = lang === 'zh' ? 'en' : 'zh';
  const href = languageSwitchUrl?.trim() || null;
  return {
    lang: targetLang,
    href,
    available: href !== null,
  };
}
