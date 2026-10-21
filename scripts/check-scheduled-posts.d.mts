export interface ScheduledPostMeta {
  draft: boolean;
  publishAt: string | null;
}

export interface ScheduledPostEntry {
  path: string;
  draft: boolean;
  publishAtMs: number;
  fileCommitMs: number;
}

export function parsePostMeta(text: string): ScheduledPostMeta;
export function findDuePosts(
  entries: ScheduledPostEntry[],
  nowMs: number,
  lastSuccessMs?: number,
): ScheduledPostEntry[];
export function checkRepository(
  root: string,
  nowMs: number,
  lastSuccessMs: number,
): ScheduledPostEntry[];
