import { defineCollection } from 'astro:content';
// Astro 7 里从 'astro:content' 导入 z 已被标记 deprecated，
// 正确来源是 'astro/zod'（转发 zod v4）。
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/**
 * 后台表单把「没填」的可选字段写成空字符串（Sveltia 与 Decap 都是），
 * 对字符串字段无害，但喂给日期、数字、枚举就会让整篇内容校验失败，
 * 进而让构建挂掉——例如「更新日期」是可空字段，站长留空保存就会写出
 * `updatedDate: ''`，`z.coerce.date()` 收到 Invalid Date 直接报
 * InvalidContentEntryDataError。这里统一把空字符串当成「没填」。
 */
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    pubDate: z.coerce.date(),
    lang: z.enum(['zh', 'en']),
    tags: z.array(z.string()).default([]),
    updatedDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
    draft: z.boolean().default(false),
    translationKey: z.preprocess(emptyToUndefined, z.string().optional()),
    publishAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
    featured: z.boolean().default(false),
  }),
});

/**
 * 站点主人的个人资料，按语言一个文件（site/home.zh.json、site/home.en.json）。
 *
 * 它们原来是写死在页面组件里的文案；抽成内容集合有两个原因：
 *   1. Decap CMS 只能编辑内容集合，改不了 .astro 代码里的字符串；
 *   2. 个人资料和界面结构分离，改资料不用再碰页面代码。
 *
 * 页面读取时带上代码内兜底值，所以这些文件缺失或个别字段留空都不会构建失败。
 */
const site = defineCollection({
  // 不能依赖默认 id：glob 默认用 github-slugger 处理文件名，
  // 会把 home.zh.json 的 id 变成 homezh（点号被吃掉，和文章文件名同理）。
  // 直接以数据里的 lang 字段作为 id，getEntry('site', 'zh') 即可命中。
  // 只收顶层文件:page-*.json 那些「独立页面」的内容在下面的 pages 集合里,
  // 若这里用 '**/*.json',两边的 id 会撞在一起(都以语言为 id)。
  loader: glob({
    pattern: '*.json',
    base: './src/content/site',
    generateId: ({ data }) => String(data.lang),
  }),
  schema: z.object({
    lang: z.enum(['zh', 'en']),
    hero: z
      .object({
        intro: z.string().optional(),
        sub: z.string().optional(),
        note: z.string().optional(),
      })
      .default({}),
    // 形象照片（首页 + 关于页共用）。src 是站内路径（后台自动上传到 public/uploads/，
    // 页面用 withBase 引用，两种部署路径都安全）；宽高防布局跳动。
    heroImage: z
      .object({
        src: z.preprocess(emptyToUndefined, z.string().optional()),
        width: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
        height: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
      })
      .optional(),
    contact: z
      .object({
        text: z.string().optional(),
        links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
      })
      .default({ links: [] }),
    work: z
      .object({
        title: z.string().optional(),
        text: z.string().optional(),
        linkLabel: z.string().optional(),
        linkUrl: z.string().optional(),
        status: z.preprocess(emptyToUndefined, z.enum(['WIP', 'LIVE']).optional()),
      })
      .default({}),
    about: z
      .object({
        subtitle: z.string().optional(),
        heading: z.string().optional(),
        body: z.string().optional(),
        pending: z.string().optional(),
      })
      .default({}),
  }),
});

/**
 * 独立页面的内容(现在 / 作品 / 最近在听 / 友链),按「页面 + 语言」一个文件。
 *
 * 为什么不并进 site 集合:那个集合的 id 就是语言(getEntry('site', 'zh') 这样取值),
 * 一个语言只能有一个文件;这里 id 用 <page>.<lang>,同一个语言可以有很多页。
 * 页面读取时同样带代码内兜底,文件缺失或字段留空都不会让构建失败。
 */
const pages = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: './src/content/site/pages',
    generateId: ({ data }) => `${data.page}.${data.lang}`,
  }),
  schema: z.object({
    page: z.enum(['now', 'works', 'listening', 'friends']),
    lang: z.enum(['zh', 'en']),
    updatedAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
    intro: z.string().optional(),
    items: z
      .array(
        z.object({
          title: z.string().optional(),
          meta: z.string().optional(),
          text: z.string().optional(),
          status: z.preprocess(emptyToUndefined, z.enum(['WIP', 'LIVE', 'PAUSED']).optional()),
          linkLabel: z.string().optional(),
          linkUrl: z.preprocess(emptyToUndefined, z.string().optional()),
        }),
      )
      .default([]),
  }),
});

export const collections = { posts, site, pages };
