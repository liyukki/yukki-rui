#!/usr/bin/env node
/** 在真实 Astro 构建中检查文章渲染、草稿译文及 RSS；不使用 Astro API 的 mock。 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildForBase } from './check-base-parity.mjs';

const originalProject = fileURLToPath(new URL('../', import.meta.url));
/**
 * 临时工程必须放在项目目录内部：放在系统临时目录时要靠软链接指到 node_modules，
 * 而 Astro 内部组件（如 ClientRouter.astro）经 realpath 解析后路径与主模块不一致，
 * 在 Linux/CI 上会报 "No cached compile metadata found"。放到项目内后 Node 按
 * 目录层级自然找到同一份 node_modules，不再依赖软链接。
 */
const directory = mkdtempSync(join(originalProject, '.tmp-content-check-'));
const project = join(directory, 'project');
const contentDirectory = join(project, 'src', 'content', 'posts');
const key = `verification-${randomUUID().slice(0, 8)}`;
const published = `${key}-published`;
const publishedEn = `${key}-published-en`;
const draft = `${key}-draft`;
const draftZh = `${key}-draft-zh`;
const scheduled = `${key}-scheduled`;
const featuredOld = `${key}-featured`;
const sameDayA = `${key}-same-a`;
const sameDayB = `${key}-same-b`;

/** 给 RSS 全文断言提供可重复的探针：图片、srcset、作者手写根路径。 */
function bodyFor(lang, isDraft) {
  if (isDraft) return `**Verified Markdown body ${key}**\n`;
  return [
    `**Verified Markdown body ${key}**`,
    '',
    '![probe](./images/你在看什么呀.jpg)',
    '',
    `<img srcset="data:image/svg+xml,%3Csvg%3E 1x, ./images/你在看什么呀.jpg 2x" alt="srcset probe">`,
    '',
    `<q cite="/${lang}/about/">root-relative probe</q>`,
    '',
  ].join('\n');
}

function decodeXmlText(xml) {
  return xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function assertFullFeed(xml, label, lang, site, id) {
  const items = (xml.match(/<item>/g) ?? []).length;
  const contents = (xml.match(/<content:encoded>/g) ?? []).length;
  assert.ok(items > 0, `${label} RSS 没有文章`);
  assert.equal(contents, items, `${label} RSS 有文章没有 content:encoded 全文`);
  assert.ok(xml.includes('&lt;strong&gt;Verified Markdown body'), `${label} RSS 正文没有渲染后的 HTML`);
  assert.ok(!xml.includes('**Verified Markdown body'), `${label} RSS 输出的是 Markdown 原文而不是渲染后的 HTML`);
  assert.ok(xml.includes(`${site}_astro/`), `${label} RSS 正文里的图片没有补成绝对地址（缺少站点前缀）`);
  assert.ok(xml.includes(`${site}${lang}/about/`), `${label} RSS 根路径链接没有补上部署 base`);
  const srcsets = [...decodeXmlText(xml).matchAll(/\ssrcset="([^"]*)"/g)].map((match) => match[1]);
  assert.ok(srcsets.some((value) => value.startsWith('data:image/svg+xml,%3Csvg%3E 1x, ')), `${label} RSS 改坏了 srcset 里的 data: 地址`);
  assert.ok(srcsets.some((value) => value.includes(`${site}${lang}/posts/${id}/images/`)), `${label} RSS srcset 里的相对图片没有补成绝对地址`);
  assert.ok(!/(?:href|src|cite)=&quot;\/(?!\/)/.test(xml), `${label} RSS 正文里仍有站内相对地址`);
  const origin = new URL(site).origin;
  if (new URL(site).pathname !== '/') {
    assert.ok(!xml.includes(`${origin}/${lang}/about/`), `${label} RSS 根路径链接丢掉了部署 base`);
  }
}

try {
  mkdirSync(project);
  for (const file of ['src', 'public', 'astro.config.mjs', 'package.json', 'tsconfig.json']) {
    const original = join(originalProject, file);
    if (existsSync(original)) cpSync(original, join(project, file), { recursive: true });
  }
  for (const [id, lang, isDraft, translationKey, publishAt, featured, pubDate] of [
    [published, 'zh', false, `${key}-published`, '', false, '2099-12-31'],
    [publishedEn, 'en', false, `${key}-published-en`, '', false, '2099-12-31'],
    [draft, 'en', true, `${key}-draft`, '', false, '2099-12-30'],
    [draftZh, 'zh', true, `${key}-draft`, '', false, '2099-12-30'],
    [scheduled, 'zh', false, `${key}-scheduled`, '2099-12-29', false, '2099-12-29'],
    [featuredOld, 'zh', false, `${key}-featured`, '', true, '2099-11-01'],
    [sameDayA, 'zh', false, `${key}-same-a`, '', false, '2099-12-30'],
    [sameDayB, 'zh', false, `${key}-same-b`, '', true, '2099-12-30'],
  ]) {
    const path = join(contentDirectory, `${id}.md`);
    const publishAtLine = publishAt ? `\npublishAt: ${publishAt}` : '';
    // 测试文章只存在于临时源码副本；即使进程被强制终止也不会污染原项目。
    writeFileSync(path, `---\ntitle: ${id}\ndescription: Content verification\npubDate: ${pubDate}\nlang: ${lang}\ntags: [verification]\ndraft: ${isDraft}\ntranslationKey: ${translationKey}${publishAtLine}\nfeatured: ${featured}\n---\n\n${bodyFor(lang, isDraft)}`, { flag: 'wx' });
  }
  for (const [name, base] of [['root', '/'], ['subpath', '/yukki-rui/']]) {
    const output = join(directory, name);
    const { site, result } = buildForBase(base, output, project);
    assert.deepEqual(result.broken, [], '集成构建存在坏链接');
    const article = readFileSync(join(output, 'zh', 'posts', published, 'index.html'), 'utf8');
    assert.ok(article.includes(`<strong>Verified Markdown body ${key}</strong>`), 'Markdown 正文没有正确 render');
    assert.ok(!article.includes(draft), '草稿译文被作为文章页面的目标');
    assert.ok(!article.includes('hreflang="en" href'), '无已发布译文时不应声明英文 hreflang');
    assert.ok(!existsSync(join(output, 'en', 'posts', draft, 'index.html')), '英文草稿产出了生产页面');
    assert.ok(!existsSync(join(output, 'zh', 'posts', draftZh, 'index.html')), '中文草稿产出了生产页面');
    assert.ok(!existsSync(join(output, 'zh', 'posts', scheduled, 'index.html')), '未到点的定时文章产出了生产页面');
    const rss = readFileSync(join(output, 'rss.xml'), 'utf8');
    const englishRss = readFileSync(join(output, 'rss-en.xml'), 'utf8');
    assert.ok(!rss.includes(scheduled), '未到点的定时文章进入了 RSS');
    assert.ok(rss.includes(new URL(`${base}zh/posts/${published}/`, site).href), 'RSS 文章地址缺少部署路径');
    assert.ok(englishRss.includes(new URL(`${base}en/posts/${publishedEn}/`, site).href), '英文 RSS 文章地址缺少部署路径');
    assert.ok(!rss.includes(draftZh) && !englishRss.includes(draft), '草稿进入了 RSS');
    assertFullFeed(rss, '中文', 'zh', site, published);
    assertFullFeed(englishRss, '英文', 'en', site, publishedEn);
    assert.ok(rss.includes(new URL(`${base}zh/posts/${published}/`, site).href), '中文 RSS 缺少中文探针文章');
    assert.ok(englishRss.includes(new URL(`${base}en/posts/${publishedEn}/`, site).href), '英文 RSS 缺少英文探针文章');
    assert.ok(!rss.includes(new URL(`${base}en/posts/${publishedEn}/`, site).href), '英文探针文章混进了中文 RSS');
    assert.ok(!englishRss.includes(new URL(`${base}zh/posts/${published}/`, site).href), '中文探针文章混进了英文 RSS');
    // 精选只影响首页排序；归档与 RSS 必须继续按纯时间倒序。
    const hrefFor = (id) => `${base}zh/posts/${id}/`;
    const homeHtml = readFileSync(join(output, 'zh', 'index.html'), 'utf8');
    const archiveHtml = readFileSync(join(output, 'zh', 'archive', 'index.html'), 'utf8');
    const rssPublished = rss.indexOf(new URL(hrefFor(published), site).href);
    const rssFeatured = rss.indexOf(new URL(hrefFor(featuredOld), site).href);
    assert.ok(homeHtml.includes(hrefFor(featuredOld)) && homeHtml.includes(hrefFor(published)), '首页缺少精选或普通探针文章');
    assert.ok(homeHtml.indexOf(hrefFor(featuredOld)) < homeHtml.indexOf(hrefFor(published)), '首页没有把精选文章排在较新的普通文章之前');
    assert.ok(archiveHtml.includes(hrefFor(featuredOld)) && archiveHtml.includes(hrefFor(published)), '归档缺少精选或普通探针文章');
    assert.ok(archiveHtml.indexOf(hrefFor(published)) < archiveHtml.indexOf(hrefFor(featuredOld)), '精选文章改变了归档的时间顺序');
    assert.ok(rssPublished >= 0 && rssFeatured >= 0, 'RSS 缺少精选或普通探针文章');
    assert.ok(rssPublished < rssFeatured, '精选文章改变了 RSS 的时间顺序');
    const rssSameA = rss.indexOf(new URL(hrefFor(sameDayA), site).href);
    const rssSameB = rss.indexOf(new URL(hrefFor(sameDayB), site).href);
    assert.ok(rssSameA >= 0 && rssSameB >= 0, 'RSS 缺少同日探针文章');
    assert.ok(rssSameA < rssSameB, 'RSS 同日文章没有按 id 升序稳定排序');
    const tagHtml = readFileSync(join(output, 'zh', 'tags', 'verification', 'index.html'), 'utf8');
    assert.ok(tagHtml.includes(hrefFor(featuredOld)) && tagHtml.includes(hrefFor(published)), '标签页缺少精选或普通探针文章');
    assert.ok(tagHtml.indexOf(hrefFor(published)) < tagHtml.indexOf(hrefFor(featuredOld)), '精选文章改变了标签页的时间顺序');
    const prevCard = article.match(/<a[^>]*class="post-nav__card post-nav__card--prev"[^>]*href="([^"]+)"/);
    if (prevCard) {
      assert.ok(!prevCard[1].includes(featuredOld), '旧精选文章污染了新普通文章的上一篇');
    }
    // 个人资料集合（/admin 后台编辑的数据源）：以数据文件为准断言渲染。
    // 文案会随站点主人的编辑变化，所以不能写死具体句子 —— 改为读取 JSON，
    // 断言其中的值确实出现在对应语言的页面上。
    const pageText = (html) =>
      html
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
    const siteData = Object.fromEntries(
      ['zh', 'en'].map((lang) => [
        lang,
        JSON.parse(readFileSync(join(project, 'src', 'content', 'site', `home.${lang}.json`), 'utf8')),
      ]),
    );
    for (const [lang, homeFile] of [['zh', 'zh/index.html'], ['en', 'en/index.html']]) {
      const data = siteData[lang];
      const rawHome = readFileSync(join(output, homeFile), 'utf8');
      const home = pageText(rawHome);
      if (data.hero?.sub) assert.ok(home.includes(data.hero.sub), `${lang} 首页没有渲染 site.hero.sub`);
      if (data.work?.title) assert.ok(home.includes(data.work.title), `${lang} 首页没有渲染 site.work.title`);
      if (data.contact?.text) assert.ok(home.includes(data.contact.text.trim().split('\n')[0]), `${lang} 首页没有渲染 site.contact.text`);
      assert.equal(
        rawHome.includes('social-links'),
        (data.contact?.links ?? []).length > 0,
        `${lang} 首页社交链接容器与 links 配置不一致`,
      );
      // 形象照跨语言同步：本语言没有就用另一语言的（能抓住「传了一边另一边不显示」的回归），
      // 且两个 base 下都必须带上正确的部署前缀。
      const resolvedSrc = data.heroImage?.src || siteData[lang === 'zh' ? 'en' : 'zh'].heroImage?.src;
      if (resolvedSrc) {
        const expected = `${base}${resolvedSrc.replace(/^\/+/, '')}`;
        assert.ok(rawHome.includes(expected), `${lang} 首页没有渲染形象照（期望含 ${expected}）`);
        assert.ok(
          readFileSync(join(output, lang, 'about', 'index.html'), 'utf8').includes(expected),
          `${lang} 关于页没有渲染形象照（期望含 ${expected}）`,
        );
      }
      const about = pageText(readFileSync(join(output, lang, 'about', 'index.html'), 'utf8'));
      if (data.about?.pending) assert.ok(about.includes(data.about.pending), `${lang} 关于页没有渲染 site.about.pending`);
    }
    // /admin 后台是静态资源，两种部署路径下都必须原样产出、配置可解析。
    const configYaml = readFileSync(join(output, 'admin', 'config.yml'), 'utf8');
    assert.ok(configYaml.includes('local_backend: true'), 'admin/config.yml 缺少本地编辑开关');
    assert.ok(configYaml.includes('src/content/posts'), 'admin/config.yml 缺少文章集合配置');
    const adminHtml = readFileSync(join(output, 'admin', 'index.html'), 'utf8');
    assert.ok(adminHtml.includes('./upload-helper.js'), 'admin/index.html 缺少上传助手脚本引用');
    assert.ok(existsSync(join(output, 'admin', 'upload-helper.js')), 'admin/upload-helper.js 没有产出到构建目录');
    console.log(`✓ base = ${base}：Markdown 渲染、草稿页面、草稿译文、双语 RSS 全文与地址补全、个人资料集合和后台产物集成检查通过`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
