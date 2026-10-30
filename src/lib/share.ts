export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'failed';

export interface ShareOrCopyOptions {
  title: string;
  text: string;
  url: string;
  share?: (data: ShareData) => Promise<void>;
  writeText?: (value: string) => Promise<void>;
}

export async function shareOrCopy({
  title,
  text,
  url,
  share,
  writeText,
}: ShareOrCopyOptions): Promise<ShareResult> {
  const target = url.trim();
  if (!target) return 'failed';

  if (share) {
    try {
      await share({ title, text, url: target });
      return 'shared';
    } catch (error) {
      const cancelled =
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'AbortError';
      if (cancelled) return 'cancelled';
    }
  }

  if (!writeText) return 'failed';

  try {
    await writeText(target);
    return 'copied';
  } catch {
    return 'failed';
  }
}
