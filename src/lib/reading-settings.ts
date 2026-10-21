/** 阅读设置：字号 / 行高 / 正文宽度。纯函数层，便于单测与组件复用。 */
export interface ReadingSettings {
  size: 'sm' | 'md' | 'lg';
  line: 'tight' | 'normal' | 'loose';
  width: 'narrow' | 'normal' | 'wide';
}

export const READING_DEFAULTS: ReadingSettings = { size: 'md', line: 'normal', width: 'normal' };

export const READING_STORAGE_KEY = 'reading-settings';

const SIZES = ['sm', 'md', 'lg'] as const;
const LINES = ['tight', 'normal', 'loose'] as const;
const WIDTHS = ['narrow', 'normal', 'wide'] as const;

/** 从白名单里挑值，非法值回退默认，避免损坏的 localStorage 撑坏页面。 */
function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function normalizeReadingSettings(input: unknown): ReadingSettings {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    size: pick(record.size, SIZES, READING_DEFAULTS.size),
    line: pick(record.line, LINES, READING_DEFAULTS.line),
    width: pick(record.width, WIDTHS, READING_DEFAULTS.width),
  };
}

/** 读取失败(隐私模式、存储被禁用、JSON 损坏)时一律回退默认值。 */
export function readReadingSettings(storage: Pick<Storage, 'getItem'> | null | undefined): ReadingSettings {
  if (!storage) return { ...READING_DEFAULTS };
  try {
    return normalizeReadingSettings(JSON.parse(storage.getItem(READING_STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...READING_DEFAULTS };
  }
}

/** 把设置写到 <html> 的 data-* 上，CSS 变量据此覆盖正文排版。 */
export function applyReadingSettings(root: HTMLElement, settings: ReadingSettings): void {
  root.dataset.readingSize = settings.size;
  root.dataset.readingLine = settings.line;
  root.dataset.readingWidth = settings.width;
}
