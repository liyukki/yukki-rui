/**
 * 定时发布水位检查。
 *
 * 只有同时满足以下条件的文章才需要触发一次新部署：
 *   - draft 不是 true；
 *   - publishAt 已到点；
 *   - publishAt 晚于最近一次成功的 master push 部署，或文章在该部署之后又有提交。
 *
 * 文件提交时间必须取 git commit 时间，不能取 checkout 后的 mtime：Actions 的
 * 全新 checkout 会把所有文件 mtime 都刷新成当前时间，从而每轮都误判为“刚改过”。
 */
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';

export function parsePostMeta(text) {
  const frontmatter = String(text ?? '').replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) return { draft: false, publishAt: null };

  const scalar = (key) => {
    const raw = new RegExp(`^${key}:\\s*(.*?)\\s*$`, 'mi').exec(frontmatter)?.[1] ?? '';
    const trimmed = raw.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };

  return {
    draft: scalar('draft').toLowerCase() === 'true',
    publishAt: scalar('publishAt') || null,
  };
}

/** 纯函数：便于用单测钉死水位线边界。 */
export function findDuePosts(entries, nowMs, lastSuccessMs = 0) {
  return entries.filter((entry) => {
    if (entry.draft || !entry.publishAtMs || !Number.isFinite(entry.publishAtMs)) return false;
    if (entry.publishAtMs > nowMs) return false;
    if (!lastSuccessMs) return true;
    return entry.publishAtMs > lastSuccessMs || Number(entry.fileCommitMs ?? 0) > lastSuccessMs;
  });
}

function markdownFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

function commitTimeSeconds(root, file) {
  const result = spawnSync('git', ['log', '-1', '--format=%ct', '--', relative(root, file)], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return 0;
  const value = Number(result.stdout.trim());
  return Number.isFinite(value) ? value : 0;
}

export function checkRepository(root, nowMs, lastSuccessMs) {
  const entries = markdownFiles(resolve(root, 'src/content/posts')).map((file) => {
    const { draft, publishAt } = parsePostMeta(readFileSync(file, 'utf8'));
    const publishAtMs = publishAt ? Date.parse(publishAt) : 0;
    if (publishAt && !Number.isFinite(publishAtMs)) {
      throw new Error(`${relative(root, file)} 的 publishAt 无法解析：${publishAt}`);
    }
    return {
      path: relative(root, file),
      draft,
      publishAtMs,
      fileCommitMs: commitTimeSeconds(root, file) * 1000,
    };
  });
  return findDuePosts(entries, nowMs, lastSuccessMs);
}

function main() {
  const root = process.cwd();
  const nowMs = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error('NOW 无法解析');
  const lastSuccessMs = Number(process.env.LAST_SUCCESS_TS ?? 0) * 1000;
  const due = checkRepository(root, nowMs, Number.isFinite(lastSuccessMs) ? lastSuccessMs : 0);
  const dueFlag = due.length > 0 ? '1' : '0';
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `due=${dueFlag}\ncount=${due.length}\n`);
  }
  if (due.length) console.log(`需要部署：\n${due.map((entry) => `- ${entry.path}`).join('\n')}`);
  else console.log('没有到点后尚未部署的文章。');
  console.log(`due=${dueFlag} count=${due.length}`);
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) main();
