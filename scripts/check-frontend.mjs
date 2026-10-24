#!/usr/bin/env node
/** 发布前的前端结构门槛；视觉、交互和无障碍仍需浏览器验收。 */
import { existsSync, readFileSync } from 'node:fs';

const required = ['index.html', 'zh/index.html', 'en/index.html', 'zh/about/index.html', 'en/about/index.html', 'zh/tags/index.html', 'en/tags/index.html', 'zh/archive/index.html', 'en/archive/index.html', 'zh/search/index.html', 'en/search/index.html', 'zh/now/index.html', 'en/now/index.html', 'zh/works/index.html', 'en/works/index.html', 'zh/listening/index.html', 'en/listening/index.html', 'zh/friends/index.html', 'en/friends/index.html', 'ai/zh.json', 'ai/en.json', '404.html', 'og-default.png', 'pagefind/pagefind-entry.json', 'pagefind/pagefind-ui.js'];
const missing = required.filter((file) => !existsSync(`dist/${file}`));
if (missing.length) {
  console.error(`前端尚未完成，缺少必需产物：\n${missing.map((file) => `  ${file}`).join('\n')}`);
  process.exitCode = 1;
} else console.log('✓ 前端必需路由和默认分享图齐全；请继续浏览器视觉和交互验收');

/**
 * 访问统计:consts.ts 里 WEB_ANALYTICS.enabled 为 true 时,首页产物必须带统计脚本且 token 对得上。
 * 为什么放在这里:统计是「边缘注入还是自己插脚本」最容易被漏掉的一环 —— 代码里开了、构建没输出,
 * 线上就永远没有数据,而页面本身看不出任何异常。
 */
if (existsSync('src/consts.ts')) {
  const consts = readFileSync('src/consts.ts', 'utf8');
  const start = consts.indexOf('export const WEB_ANALYTICS');
  const analytics = start >= 0 ? consts.slice(start).split('\n').slice(0, 8) : [];
  const enabled = analytics.some((line) => line.trim() === 'enabled: true,');
  const tokenLine = analytics.find((line) => line.trim().startsWith("token: '"));
  const token = tokenLine ? tokenLine.split("'")[1] : '';
  if (enabled && token) {
    const html = readFileSync('dist/zh/index.html', 'utf8');
    const ok = html.includes('static.cloudflareinsights.com/beacon.min.js') && html.includes(token);
    if (!ok) {
      console.error('Web Analytics 已开启,但首页产物里没有对应的统计脚本(token 或地址对不上)。');
      process.exitCode = 1;
    } else console.log('✓ 访问统计脚本已在首页产物里(Cloudflare Web Analytics)');
  }
}
