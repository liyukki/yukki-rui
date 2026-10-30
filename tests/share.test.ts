import { describe, expect, it, vi } from 'vitest';
import { shareOrCopy } from '../src/lib/share';

const base = {
  title: 'Title',
  text: 'Description',
  url: 'https://example.com/posts/hello/',
};

describe('shareOrCopy', () => {
  it('uses native share before clipboard', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareOrCopy({ ...base, share, writeText })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: base.title,
      text: base.text,
      url: base.url,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('treats AbortError as a silent cancellation', async () => {
    const share = vi.fn().mockRejectedValue(
      Object.assign(new Error('cancelled'), { name: 'AbortError' }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareOrCopy({ ...base, share, writeText })).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to clipboard when share fails', async () => {
    const share = vi.fn().mockRejectedValue(new Error('not allowed'));
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareOrCopy({ ...base, share, writeText })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(base.url);
  });

  it('copies when native share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareOrCopy({ ...base, writeText })).resolves.toBe('copied');
  });

  it('returns failed when clipboard fails or URL is empty', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));

    await expect(shareOrCopy({ ...base, writeText })).resolves.toBe('failed');
    await expect(shareOrCopy({ ...base, url: '   ', writeText })).resolves.toBe('failed');
  });
});
