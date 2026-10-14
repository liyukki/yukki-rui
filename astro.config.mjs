// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { LOCAL_SITE_URL, normalizeSiteBase, resolveSiteUrl } from './src/lib/site-config.mjs';

// GitHub Pages 部署在 /yukki-rui/ 子路径下，Cloudflare Pages 部署在根路径。
// 用环境变量区分，避免维护两个分支。默认 '/'（Cloudflare）。
const base = normalizeSiteBase(process.env.SITE_BASE ?? '/');

export default defineConfig({
  site: resolveSiteUrl(process.env.SITE_URL ?? LOCAL_SITE_URL, base),
  base,
  output: 'static',
  // 必须是 'always'：否则部分页面会产出 dist/zh.html 这种单文件形态，
  // 与 withBase() 生成的 '/zh/' 链接写法不一致，站内链接自检也会误报。
  trailingSlash: 'always',
  integrations: [sitemap()],
});
