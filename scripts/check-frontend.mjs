#!/usr/bin/env node
/** 发布前的前端结构门槛；视觉、交互和无障碍仍需浏览器验收。 */
import { existsSync } from 'node:fs';

const required = ['index.html', 'zh/index.html', 'en/index.html', 'zh/about/index.html', 'en/about/index.html', 'zh/tags/index.html', 'en/tags/index.html', 'zh/archive/index.html', 'en/archive/index.html', 'zh/search/index.html', 'en/search/index.html', '404.html', 'og-default.png', 'pagefind/pagefind-entry.json', 'pagefind/pagefind-ui.js'];
const missing = required.filter((file) => !existsSync(`dist/${file}`));
if (missing.length) {
  console.error(`前端尚未完成，缺少必需产物：\n${missing.map((file) => `  ${file}`).join('\n')}`);
  process.exitCode = 1;
} else console.log('✓ 前端必需路由和默认分享图齐全；请继续浏览器视觉和交互验收');
