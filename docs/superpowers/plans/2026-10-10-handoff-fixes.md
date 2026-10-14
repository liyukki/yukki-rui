# 数据层与 Kimi 交接修复计划

**Goal:** 修复已审核的草稿译文、文章渲染、RSS、站点地址、部署路径检查和文档冲突，让 Kimi 可直接接手展示层。

**Architecture:** 保留 Astro 7 静态输出和 Markdown 集合。站点绝对地址统一使用构建配置注入的 `import.meta.env.SITE` / `Astro.site`；RSS 和 robots 在构建期生成。链接检查扫描真实构建产物，双路径构建使用独立临时输出目录，不覆盖用户的 `dist/`。

**Tech Stack:** 项目已安装的 Astro 7、TypeScript、Vitest、npm；不新增依赖。

## 授权与边界

用户已授权修复上一轮审核意见并重新审核。直接在当前工作区的新 `codex/` 分支执行；保持文章 schema 和现有前端函数入口。展示页面、视觉设计与个人素材仍由 Kimi 完成。本轮不发布网站，不提交或推送仓库。

## Task 1: 回归测试

- [x] 在 `tests/post-select.test.ts` 覆盖生产环境隐藏草稿译文、开发预览草稿译文。
- [x] 在 `tests/check-links.test.ts` 覆盖子路径前缀缺失、相对路径、中文路径、查询参数与同站绝对链接。
- [x] 在 `tests/site-config.test.ts` 覆盖站点地址归一化和配置不一致时拒绝构建。
- [x] 运行 `npm test`，确认新增用例因原始缺陷失败。

## Task 2: 数据与构建接口

- [x] 让 `getTranslations()` 使用与文章路由相同的发布过滤规则。
- [x] 新增共享 `src/lib/site-config.mjs`，由 `astro.config.mjs` 读取 `SITE_URL` 和 `SITE_BASE`。
- [x] `SITE.url` 改为构建注入的地址；新增 `absoluteHref()`，用于已经包含 base 的站内路径。
- [x] 提供实际 `src/pages/rss.xml.ts`、`rss-en.xml.ts` 和 `robots.txt.ts`；订阅使用 `postHref()`。
- [x] 将原有两个死链测试链接替换为明确的展示层待实现占位页。

## Task 3: 真实产物检查

- [x] 链接检查扫描全部 HTML、RSS、sitemap 和 robots，严格验证部署前缀与本地目标文件。
- [x] 双路径脚本在临时目录分别构建根路径和子路径，检查实际页面与资源，不再只比较探针。
- [x] 在临时源码副本运行真实 Astro `render(post)`、草稿过滤和 RSS 集成验证；原始 src 与 dist 均不改动。
- [x] 保留失败路径自检，验证非探针页面中硬编码的站内链接会导致检查失败。

## Task 4: 文档、CI 与审核

- [x] 同步 README、设计文档、实施计划和前端交接文档：统一 Astro 7、正确渲染方式、地址配置、主题脚本预算与验收边界。
- [x] 修复 SEO 示例：canonical 和 OG 图片适配 base；hreflang 仅指向真实等价页面，每种语言最多一条。
- [x] CI 使用与本地一致的检查，并显式设置站点地址和部署路径。
- [x] 运行类型检查、全部单测、双路径构建、集成验证和失败路径自检。
- [x] 依据 requesting-code-review 技能安排一次只读独立审核，处理重要问题。
- [x] 保存实际验证结果到 `docs/verification-report.md`，交付 Kimi 入口文档。

