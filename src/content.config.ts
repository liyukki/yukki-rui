import { defineCollection } from 'astro:content';
// Astro 7 里从 'astro:content' 导入 z 已被标记 deprecated，
// 正确来源是 'astro/zod'（转发 zod v4）。
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    pubDate: z.coerce.date(),
    lang: z.enum(['zh', 'en']),
    tags: z.array(z.string()).default([]),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    translationKey: z.string().optional(),
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
  loader: glob({
    pattern: '**/*.json',
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
        src: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
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
        status: z.enum(['WIP', 'LIVE']).optional(),
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

export const collections = { posts, site };
