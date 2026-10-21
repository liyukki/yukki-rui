import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findDuePosts, parsePostMeta } from '../scripts/check-scheduled-posts.mjs';

const JAN = Date.parse('2026-01-01T00:00:00Z');
const FEB = Date.parse('2026-02-01T00:00:00Z');
const MAR = Date.parse('2026-03-01T00:00:00Z');

function entry(overrides: Partial<{ publishAtMs: number; draft: boolean; fileCommitMs: number }> = {}) {
  return {
    path: 'src/content/posts/demo.md',
    draft: false,
    publishAtMs: FEB,
    fileCommitMs: JAN,
    ...overrides,
  };
}

describe('定时发布水位判断', () => {
  it('到点且晚于上次成功部署 → 需要部署', () => {
    expect(findDuePosts([entry()], MAR, JAN).map((item) => item.path)).toEqual([
      'src/content/posts/demo.md',
    ]);
  });

  it('还没到点 → 不部署', () => {
    expect(findDuePosts([entry()], JAN, 0)).toEqual([]);
  });

  it('上次成功部署已经晚于 publishAt → 不重复部署', () => {
    expect(findDuePosts([entry()], MAR, MAR)).toEqual([]);
  });

  it('同一天发布后又有文件提交 → 需要部署', () => {
    expect(findDuePosts([entry({ publishAtMs: JAN, fileCommitMs: MAR })], MAR, FEB)).toHaveLength(1);
  });

  it('早提交、未来到点，即使上次部署发生在文件提交之后也会补部署', () => {
    expect(findDuePosts([entry({ publishAtMs: MAR, fileCommitMs: JAN })], MAR, FEB)).toHaveLength(1);
  });

  it('draft 永远不触发', () => {
    expect(findDuePosts([entry({ draft: true })], MAR, JAN)).toEqual([]);
  });

  it('完整时间戳按毫秒精度比较', () => {
    const atNoon = Date.parse('2026-02-01T12:00:00Z');
    const beforeNoon = Date.parse('2026-02-01T11:59:59Z');
    expect(findDuePosts([entry({ publishAtMs: atNoon })], beforeNoon, JAN)).toEqual([]);
    expect(findDuePosts([entry({ publishAtMs: atNoon })], atNoon, JAN)).toHaveLength(1);
  });
});

describe('定时发布工作流契约', () => {
  const workflow = readFileSync('.github/workflows/publish-scheduled.yml', 'utf8');

  it('显式调度 GitHub Pages，并允许 GITHUB_TOKEN 调用 Actions', () => {
    expect(workflow).toContain('actions: write');
    expect(workflow).toContain('gh workflow run deploy.yml --ref master');
    expect(workflow).toContain('gh run watch "$run_id" --exit-status');
  });

  it('只允许从 master 触发，checkout 也固定到 master', () => {
    expect(workflow).toContain("if: github.event_name == 'schedule' || github.ref == 'refs/heads/master'");
    expect(workflow).toContain('ref: master');
  });

  it('水位线同时纳入 push 与 workflow_dispatch 的成功部署', () => {
    const watermarkLine = workflow.split('\n').find((line) => line.includes('last_success=')) ?? '';
    expect(watermarkLine).toContain('--branch master');
    expect(watermarkLine).not.toContain('--event push');
  });
});

describe('frontmatter 解析', () => {
  it('支持引号与递归目录中的普通 frontmatter', () => {
    expect(parsePostMeta('---\ntitle: x\ndraft: false\npublishAt: "2026-02-01T12:00:00Z"\n---\n正文')).toEqual({
      draft: false,
      publishAt: '2026-02-01T12:00:00Z',
    });
  });

  it('草稿和缺省 publishAt 可识别', () => {
    expect(parsePostMeta('---\ndraft: true\n---\n正文')).toEqual({ draft: true, publishAt: null });
  });
});
