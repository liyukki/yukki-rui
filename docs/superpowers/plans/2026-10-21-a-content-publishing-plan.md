# A 类(定时发布 publishAt + 精选置顶 featured)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 给文章增加「到点才发布」与「精选置顶」两个后台可勾选的字段,不破坏现有归档/RSS 的时间顺序。

**Architecture:** 所有可见性与排序规则集中在零依赖纯函数 `src/lib/post-select.ts`,`src/lib/posts.ts` 只做数据搬运。`featured` 只影响首页/标签列表顺序,归档与 RSS 改走新增的 `getPostsByDate()`。

**Tech Stack:** Astro 7 content collections、Zod(astro/zod)、Vitest、Sveltia CMS config、GitHub Actions cron。

## Global Constraints

- 依赖:不新增任何 npm 依赖。
- 规则:`draft: true` 永远压过 `publishAt`;时间统一 UTC。
- 回退:字段全部可选或带默认值,旧文章文件无需改动即可通过校验。
- 禁止改:`src/pages/[lang]/archive.astro`、`src/pages/rss.xml.ts`、`src/pages/rss-en.xml.ts` 的时间语义 —— 它们改用 `getPostsByDate()` 后行为必须与今天完全一致。

---

### Task A1: 定时发布字段与可见性规则

**Files:**
- Modify: `src/content.config.ts`(posts schema)
- Modify: `public/admin/config.yml`(posts fields + view_filters)
- Modify: `src/lib/post-select.ts`(`PostData`、`selectPosts`)
- Modify: `src/lib/posts.ts`(传 now)
- Test: `tests/post-select.test.ts`
- Modify: `scripts/check-content.mjs`

**Interfaces:**
- Produces: `PostData.publishAt?: Date`;`selectPosts(entries, lang, isProd, now?: Date): T[]`
- Produces: `export function isVisibleOn(data: PostData, isProd: boolean, now: Date): boolean`

- [ ] **Step 1: 写失败测试**

在 `tests/post-select.test.ts` 的 `post()` 工厂里补充两个字段的透传,并新增用例:

```ts
it('生产模式隐藏未到点的定时文章', () => {
  const now = new Date('2026-05-10T00:00:00Z');
  const future = post({ id: 'future', pubDate: new Date('2026-05-01'), publishAt: new Date('2026-06-01T00:00:00Z') });
  const ids = selectPosts([...entries, future], 'zh', true, now).map((p) => p.id);
  expect(ids).not.toContain('future');
});

it('到点后定时文章可见', () => {
  const now = new Date('2026-06-02T00:00:00Z');
  const due = post({ id: 'due', pubDate: new Date('2026-05-01'), publishAt: new Date('2026-06-01T00:00:00Z') });
  const ids = selectPosts([...entries, due], 'zh', true, now).map((p) => p.id);
  expect(ids).toContain('due');
});

it('draft 压过 publishAt', () => {
  const now = new Date('2026-06-02T00:00:00Z');
  const blocked = post({ id: 'blocked', draft: true, publishAt: new Date('2026-06-01T00:00:00Z') });
  const ids = selectPosts([...entries, blocked], 'zh', true, now).map((p) => p.id);
  expect(ids).not.toContain('blocked');
});

it('开发模式保留未到点的定时文章以便本地预览', () => {
  const future = post({ id: 'future', publishAt: new Date('2030-01-01T00:00:00Z') });
  const ids = selectPosts([...entries, future], 'zh', false).map((p) => p.id);
  expect(ids).toContain('future');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/post-select.test.ts`
Expected: 编译失败,`publishAt` 不存在于 `Partial<PostLike['data']>`。

- [ ] **Step 3: 改 schema 与后台字段**

`src/content.config.ts` 的 `posts` schema 增加:

```ts
publishAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
featured: z.boolean().default(false),
```

`public/admin/config.yml` 在 `translationKey` 之后追加(保持与其他字段同样的中文 label + hint 风格):

```yaml
      - { label: 定时发布(可空;到点才出现在线上,留空=立即), name: publishAt, widget: datetime, date_format: 'YYYY-MM-DD', time_format: false, format: 'YYYY-MM-DD', required: false, hint: 用 UTC 判断;draft 打开时此字段被忽略。需等下一次定时重建才会生效 }
      - { label: 精选置顶(仅影响首页列表顺序,归档与 RSS 不变), name: featured, widget: boolean, default: false }
```

`view_filters` 增加:

```yaml
      - { label: 精选, field: featured, pattern: true }
      - { label: 定时, field: publishAt, pattern: '.+' }
```

- [ ] **Step 4: 实现纯函数规则**

`src/lib/post-select.ts` 的 `PostData` 增加 `publishAt?: Date;` 与 `featured: boolean;`,并新增:

```ts
/** 生产环境的可见性:草稿永远不可见;定时文章到点才可见。 */
export function isVisibleOn(data: PostData, isProd: boolean, now: Date): boolean {
  if (!isProd) return true;
  if (data.draft) return false;
  return !data.publishAt || data.publishAt.getTime() <= now.getTime();
}
```

`selectPosts` 改为:

```ts
export function selectPosts<T extends PostLike>(
  entries: readonly T[],
  lang: 'zh' | 'en',
  isProd: boolean,
  now: Date = new Date(),
): T[] {
  return entries
    .filter((entry) => entry.data.lang === lang)
    .filter((entry) => isVisibleOn(entry.data, isProd, now))
    .sort(byFeaturedThenDate);
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/post-select.test.ts`
Expected: PASS,含原有 4 条 `selectPosts` 用例。

- [ ] **Step 6: 内容检查加断言**

`scripts/check-content.mjs`:在生成的探针文章里增加一篇 `publishAt` 设为未来日期的文章,断言它在两种 base 的 HTML 产物与 RSS 中都不出现。复用文件里已有的探针写入与断言范式。

- [ ] **Step 7: 提交**

```
git add src/content.config.ts public/admin/config.yml src/lib/post-select.ts src/lib/posts.ts tests/post-select.test.ts scripts/check-content.mjs
git commit -m "feat(content): 定时发布 publishAt 与可见性规则"
```

---

### Task A2: 精选置顶排序

**Files:**
- Modify: `src/lib/post-select.ts`(排序比较器)
- Modify: `src/lib/posts.ts`(新增 `getPostsByDate`)
- Modify: `src/pages/[lang]/archive.astro`、`src/pages/rss.xml.ts`、`src/pages/rss-en.xml.ts`(改调 `getPostsByDate`)
- Test: `tests/post-select.test.ts`

**Interfaces:**
- Consumes: `PostData.featured`(Task A1 已加)
- Produces: `export function byFeaturedThenDate(a: PostLike, b: PostLike): number`
- Produces: `export function compareByDateDesc(a: PostLike, b: PostLike): number`
- Produces: `getPostsByDate(lang: 'zh' | 'en'): Promise<Post[]>` —— 时间倒序,忽略 featured

- [ ] **Step 1: 写失败测试**

```ts
it('精选文章排在最前,其余仍按日期倒序', () => {
  const list = [
    post({ id: 'zh-old', pubDate: new Date('2026-01-01'), featured: true }),
    post({ id: 'zh-new', pubDate: new Date('2026-05-01') }),
    post({ id: 'zh-mid', pubDate: new Date('2026-03-01') }),
  ];
  expect(selectPosts(list, 'zh', true).map((p) => p.id)).toEqual(['zh-old', 'zh-new', 'zh-mid']);
});

it('同一天且都精选时按 id 升序,结果稳定', () => {
  const date = new Date('2026-05-01');
  const list = [
    post({ id: 'b', pubDate: date, featured: true }),
    post({ id: 'a', pubDate: date, featured: true }),
  ];
  expect(selectPosts(list, 'zh', true).map((p) => p.id)).toEqual(['a', 'b']);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/post-select.test.ts`
Expected: FAIL —— 精选文章没有排在前面。

- [ ] **Step 3: 实现比较器**

```ts
/** 首页列表排序:精选优先,其次发布日期倒序,最后 id 升序保证确定性。 */
export function byFeaturedThenDate(a: PostLike, b: PostLike): number {
  if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
  return compareByDateDesc(a, b);
}

/** 时间倒序;时间相同时按 id 升序。归档、RSS、上下篇统一用它。 */
export function compareByDateDesc(a: PostLike, b: PostLike): number {
  const diff = b.data.pubDate.getTime() - a.data.pubDate.getTime();
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/post-select.test.ts`
Expected: PASS。

- [ ] **Step 5: 抽出时间序入口**

`src/lib/posts.ts` 新增:

```ts
/** 纯时间倒序(忽略 featured):归档页、RSS 与上下篇使用,保持原有语义。 */
export async function getPostsByDate(lang: 'zh' | 'en'): Promise<Post[]> {
  const entries = await allPosts();
  return selectPosts(entries, lang, import.meta.env.PROD).sort(compareByDateDesc);
}
```

把 `archive.astro`、`rss.xml.ts`、`rss-en.xml.ts` 里的 `getPosts(` 换成 `getPostsByDate(`。

- [ ] **Step 6: 回归确认归档与 RSS 顺序未变**

Run: `npm run check:content`
Expected: PASS(该脚本已断言草稿不进 RSS、双语 RSS 全文输出)。

- [ ] **Step 7: 提交**

```
git add src/lib/post-select.ts src/lib/posts.ts "src/pages/[lang]/archive.astro" src/pages/rss.xml.ts src/pages/rss-en.xml.ts tests/post-select.test.ts
git commit -m "feat(content): 精选置顶排序,归档与 RSS 保持时间序"
```

---

### Task A3: 定时重建工作流

**Files:**
- Create: `.github/workflows/publish-scheduled.yml`
- Modify: `docs/usage-guide.md`

**Interfaces:**
- Consumes: `publishAt` frontmatter 字段
- Produces: 每 30 分钟一次的 `workflow_dispatch` 触发部署

- [ ] **Step 1: 新建工作流**

```yaml
name: 定时发布检查

on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch:

permissions:
  actions: write
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: 找出已到点但可能尚未发布的文章
        id: due
        run: |
          today=$(date -u +%Y-%m-%d)
          found=0
          for file in src/content/posts/*.md; do
            [ -e "$file" ] || continue
            draft=$(grep -m1 '^draft:' "$file" | sed 's/^draft:[[:space:]]*//' || true)
            pub=$(grep -m1 '^publishAt:' "$file" | sed 's/^publishAt:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)
            [ -z "$pub" ] && continue
            [ "$draft" = "true" ] && continue
            if [ "$pub" \< "$today" ] || [ "$pub" = "$today" ]; then found=1; break; fi
          done
          echo "due=$found" >> "$GITHUB_OUTPUT"
      - name: 触发一次重建
        if: steps.due.outputs.due == '1'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh workflow run deploy.yml --ref master
```

- [ ] **Step 2: 本地校验 YAML 可解析**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/publish-scheduled.yml','utf8');if(!s.includes('*/30'))process.exit(1);console.log('ok')"`
Expected: 输出 `ok`。

- [ ] **Step 3: 文档记录**

`docs/usage-guide.md` 增加一小节:字段名、UTC 规则、`draft` 优先级、30 分钟检查粒度、GitHub 定时任务 60 天无活动会被暂停的已知限制。

- [ ] **Step 4: 提交**

```
git add .github/workflows/publish-scheduled.yml docs/usage-guide.md
git commit -m "ci: 每 30 分钟检查定时发布文章并触发重建"
```
