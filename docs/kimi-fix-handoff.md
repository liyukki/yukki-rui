# Kimi 修复交接（第三轮）

日期 2026-10-12。审核分支 `codex/fix-handoff`，基线 `7363b29`。审核人做了只读复核 + 独立复跑，**未改动任何源码、未提交、未推送**。

验收总评：**成果真实可用，可以接手**。自动化门槛全部独立复跑通过；我另外做了 16 项浏览器验收和 6 项真实鼠标交互，也全部通过。下面 4 项是待修的小问题，按优先级排列。

修复完成后请重跑：`npm run verify:frontend` + `node scripts/check-base-parity.mjs --self-test`。

---

## P1 — 语言偏好写入缺失（唯一功能缺口，必须修）

### 现象

`src/pages/index.astro:17` 读取 `localStorage.getItem('lang')` 来"尊重已保存语言"：

```js
try { saved = localStorage.getItem('lang'); } catch {}
const target = saved === 'zh' || saved === 'en' ? saved : (navigator.language…);
```

但**全站没有任何代码写入 `lang` 键**。`LangSwitch.astro` 是纯 `<a>` 链接，点击即跳转不落盘。用 `grep -rn "setItem" src/` 可确认只有 `theme` 被写入。

**后果**：`saved === 'zh' || saved === 'en'` 分支永远为 false，实际只按 `navigator.language` 判断。文档 `docs/frontend-handoff.md:125` 明确要求"尊重已保存语言"，因此这是未达成的验收项。

### 修法（已实测有效）

改 `src/components/LangSwitch.astro`，给链接加 `data-lang-target` 并写入偏好：

```astro
<a class="icon-btn" href={target} hreflang={lang === 'zh' ? 'en' : 'zh-CN'}
   aria-label={UI[lang].languageSwitch} data-lang-target={lang === 'zh' ? 'en' : 'zh'}>
  {UI[lang].languageSwitch}
</a>
<script is:inline>
  (() => {
    const link = document.querySelector('a[data-lang-target]');
    link?.addEventListener('click', () => {
      try { localStorage.setItem('lang', link.dataset.langTarget); } catch {}
    });
  })();
</script>
```

我在本地应用过这个补丁并实测：

- 点击语言按钮后 `localStorage.lang` 正确写入（实测 `"en"`）
- 中文系统 + 已保存 `en` 偏好，访问根入口落地 `/en/`（偏好生效）
- 有译文互跳仍正确（`/zh/posts/hello-world/` → `/en/posts/hello-worlden/`）
- 存储受限（localStorage 抛异常）时点击不报错、页面不崩

注意：补丁必须放在 `LangSwitch.astro`（每页都渲染），不能只放 `index.astro`。这样任意页面切换语言都会记住偏好，根入口再据此跳转。

### 备选方案

若认为偏好持久化非必需，则应**删除** `index.astro` 中读取 `lang` 的分支，并同步修改 `docs/frontend-handoff.md:125` 的表述，不要留着永不生效的死代码。

---

## P2 — 验证报告的数字与实测不符（2 处）

`docs/verification-report.md`：

| 行 | 现值 | 实测 |
|---|---|---|
| 55 | `双路径各 17 页、678 条站内引用通过` | **682 条** |
| 55 | `类型检查 0 errors/0 warnings` | 还应记 **2 hints** |

第 22、24、25、35、36 行写 26 文件 / 7 页 / 63 条是**修复阶段**的历史记录，本轮展示层验收后应更新为 46 文件 / 17 页 / 682 条，或明确标注为"修复阶段快照"。

### 2 个 hints 的真实成因

```
scripts/gen-pixel-sprites.mjs:95:7  'SCALE' is declared but its value is never read.
scripts/gen-pixel-sprites.mjs:3:7   'require' is declared but its value is never read.
```

- `const SCALE = { default: 3 }`（第 95 行）全脚本无引用
- 第 3 行 `const require = createRequire(import.meta.url)` 中，`createRequire` 的返回值未被使用（第 4 行 `require('sharp')` 走的是其他解析），TS 判定未读

`tsconfig.json` 的 `include: ["**/*"]` 覆盖了 `scripts/`，所以这两个不影响运行的告警会持续出现在 `astro check` 输出里。

### 修法（已实测，hints 归零）

`scripts/gen-pixel-sprites.mjs`：

```js
// 第 2-4 行替换为：
import sharp from 'sharp';

// 第 95 行删除：
const SCALE = { default: 3 }; // 16*3 = 48px
```

验证结果：`npx astro check` → `0 errors / 0 warnings / 0 hints`；`node scripts/gen-pixel-sprites.mjs` 仍正常输出 13 个精灵文件（`star-gold` / `note-*` / `coin-sprite` / `sun` / `moon` 等），产物幂等（重跑后 `star-gold.png` 的 md5 不变）。

---

## P3 — 仓库卫生（2 项，建议清理）

### 3.1 `pixel-platformer.zip` 会进版本库

254 KB 的 Kenney 原始素材包，当前**未被 `.gitignore` 忽略**（`git check-ignore` 无输出），且 `public/pixel/` 已提取出实际使用的 78 个文件。zip 里 258 个文件包含 `Preview.png`、`SampleA.png` 等未使用的图。

建议二选一：删除该 zip，或加入 `.gitignore`。它属于一次性输入物，不是项目资产。

### 3.2 `.video_agent/` 是无头产物

`.video_agent/plugin_root` 内容是一行 video-agent-kit 插件缓存路径，与项目无关，同样未忽略。建议加入 `.gitignore`。

### 3.3 `sharp` 未声明（低优先）

`scripts/gen-pixel-sprites.mjs` 依赖 `sharp`，但 `package.json` 未声明。当前靠 `astro` 的 `optionalDependencies` 间接提供（`npm ls sharp` → `astro@7.3.8 └── sharp@0.35.5`），所以**换机器重跑该脚本可能失败**。

该脚本是一次性生成工具、未接入 npm scripts 或 CI，不影响构建。修法：在脚本注释里写明需 `npm i -D sharp`，或加入 devDependencies。

> 注意：另有 `@img/sharp-wasm32@0.35.5 extraneous` 出现在 `npm ls` 输出中，是可选依赖平台的正常残留，无需处理。

---

## P4 — 文档阶段描述已过时（建议同步）

以下表述描述的是**修复阶段**（前端未完成）的状态，本轮展示层已完成，需要更新：

| 文件:行 | 现表述 | 应改为 |
|---|---|---|
| `README.md:5` | "视觉、个人介绍…交给 Kimi。现有首页和文章页是无样式骨架" | 前端已完成（组件/布局/页面/样式/OG 图齐全） |
| `README.md:90` | "当前阶段缺少关于页、标签页、404 与分享图时会阻止发布" | 这些产物已具备，门槛目前会通过 |
| `docs/frontend-handoff.md:11` | "**待做：** 设计令牌、响应式视觉…" | 已完成；仅剩真实素材待用户提供 |
| `docs/frontend-handoff.md:141` | "当前阶段后者会明确报告缺少关于、标签、404 和 OG 文件" | 已不再报告缺失 |
| `docs/verification-report.md:70` | "**Kimi 尚需完成**" 段落 | 保留素材部分，删除已完成的展示层条目 |

---

## 已独立验证通过的部分（无需改动）

我逐项复跑并直接检查了构建产物，以下结论**不依赖 Kimi 自己的脚本**，全部属实：

**自动化**：`npm run verify` → 类型检查 0 errors、48 单测通过、双路径各 17 页 682 条引用、内容集成通过。`npm run verify:frontend` → 构建 17 页、check:links 无死链、check:frontend 通过。`--self-test` → 失败路径自检确实拒绝坏前缀。

**SEO/产物**：404 有 `noindex` + 双语回首页链接；`/rss.xml` 中文 3 篇、`/rss-en.xml` 英文 1 篇；`hello-world` 仅 zh-CN+en 两条 hreflang；`writing-in-markdown` 无英文声明；中文标签归档无对等英文声明；首页/关于页互指。全站每页 `<link rel=alternate>` 的 hreflang ≤ 2 无重复；内容页 canonical 恰好 1 条。OG 图实测 1200×630。

**性能预算**：CSS 总量 20.1 KB（预算 <50 KB）；构建产物 **0 个 JS 文件**；主题相关内联脚本 780 B（预算 <2 KB）；根入口脚本 381 B（预算 <500 B）。

**浏览器验收 16 项全通过**：375px 五个页面无横向溢出；桌面无溢出；主题切换 + `aria-pressed` + localStorage + 刷新保持；系统深色偏好回退 dark；存储受限时回退系统偏好且仍可切换；无 JS 时根入口双语链接可用；有 JS 时按浏览器语言跳转；8/8 键盘焦点可见；reduced-motion 隐藏装饰雨；真实译文互跳；无译文降级回 `/en/`；单一 h1；`lang` 属性正确。

**防闪烁**（时序实测）：主题在 **22 ms** 设置（head 内联），首帧 rAF 时已是 dark，body 内容 **145 ms** 才渲染 —— 确无闪烁。

**子路径部署**（另建 `/yukki-rui/` 产物实测）：11 个页面含 RSS/robots 零 4xx，CSS 真实生效，根入口跳转带前缀。

**真实鼠标交互 6 项全通过**（这部分报告里承认因 locator 超时降级为脚本 `click()`，我用真实指针事件补测）：主题切换+切回、导航跳转、文章卡片、语言切换、标签归档全部成功。**报告中该降级备注可以删除或更新为已用真实点击验证。**

**不编造个人素材**：首页真实标注"真实作品与项目地址待补充""邮箱与社交账号待补充"，无硬编码假邮箱/假社交账号。素材许可合规（Kenney CC0 授权原文随附）。

---

## 环境说明

审核期间的临时文件（`.tmp-verify-*.mjs`、子路径构建目录、临时安装的 playwright）已全部清理，测试服务器已停止，`git status` 与审核前完全一致。

**已知环境问题（非代码缺陷）**：在 Windows Git Bash 下直接执行 `SITE_BASE=/yukki-rui/ npx astro build` 会失败，因为 MSYS 把 `/yukki-rui/` 转成了 `C:/Program Files/Git/yukki-rui/`。加 `MSYS_NO_PATHCONV=1` 前缀即可。仓库内的 `check-base-parity.mjs` 通过 `execFileSync` 传 env，不受影响；CI 在 Linux 上也不受影响。如果 Kimi 在 Git Bash 里手工验证子路径构建，需要知道这一点。
