#!/usr/bin/env node
/**
 * base 一致性检查（双 base 并行构建）。
 *
 * 为什么需要它：check-links.mjs 只验证「引用的文件存在」，而 dist 里同时存在
 * index.html 和 zh/index.html，所以内链漏写 base 前缀也能在磁盘上找到文件 ——
 * 链接检查器抓不到这类 bug。
 *
 * 本脚本的做法：用两个不同的 base 各构建一次，构造只可能来自「base 前缀」
 * 差异的探针文件，比较两个产物的探针内容是否只差一个前缀。
 *
 * 用法：
 *   node scripts/check-base-parity.mjs
 *   node scripts/check-base-parity.mjs --keep   # 保留两次构建的产物便于人工检查
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SUB = '/parity-probe';
const PROBE = 'src/pages/parity-probe.astro';

/**
 * 探针页面。三件事：
 * 1. 用 import.meta.env.BASE_URL 打印「本产物是哪个 base 构建的」—— 身份标记。
 *    没有它，漏写 base 的两份产物会完全一样，检查器无法判断哪次构建是什么。
 * 2. 用 withBase() 生成站内链接 —— 通过时说明 base 管道正常。
 * 3. 故意写一条硬编码路径 —— 作为反例，证明检查器真的会报警。
 *    （见 --self-test）
 */
export function probeSource() {
  return `---
import { withBase, postHref, tagHref } from '../lib/url';

const buildBase = import.meta.env.BASE_URL;
const badHardcoded = '/zh/';
---

<html lang="zh-CN">
  <head>
    <title>base parity probe</title>
    <meta name="probe-build-base" content={buildBase} />
  </head>
  <body>
    <a id="root" href={withBase('')}>root</a>
    <a id="lang" href={withBase('zh/')}>lang</a>
    <a id="post" href={postHref('zh', 'hello-world')}>post</a>
    <a id="tag" href={tagHref('zh', '随笔')}>tag</a>
    <a id="bad" href={badHardcoded}>hardcoded</a>
  </body>
</html>
`;
}

/** 读出产物自己声明的 base。 */
export function readBuildBase(html) {
  const match = html.match(/name="probe-build-base" content="([^"]*)"/);
  return match ? match[1] : null;
}

/**
 * 归一化 base 字符串再比较。
 *
 * 为什么需要：Astro 的 import.meta.env.BASE_URL 在子路径部署下实测产出
 * "/yukki-rui/"（带尾斜杠），而我们把 base 传给 astro.config 时是 "/yukki-rui"。
 * 两者是同一个部署位置，比较前必须归一化，否则会误报「标记不符」。
 */
export function normalizeBaseValue(value) {
  if (value == null) return null;
  const trimmed = value.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * 把两种 base 的产物归一化成同一种形态，便于比较。
 *
 * 归一化规则：'/yukki-rui/zh/' → '/zh/'，即「剥掉子路径前缀」。
 *
 * 曾经的错法：把所有 '/' 替换成占位符。那会破坏 HTML 结构
 * （'</a>' 变成 '<__BASE__a>'），且根侧与子路径侧口径不一致。
 * 正确做法是只剥前缀，让两侧都落到「站点根相对路径」这个共同刻度上。
 */
export function normalizeBase(html, base) {
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  if (!root) return html; // '/' 已经是目标刻度
  // 先剥「前缀 + 斜杠」，再处理裸前缀（如 withBase('') 产出的 '/yukki-rui/'）
  return html.split(`${root}/`).join('/').split(root).join('');
}

function build(base) {
  execFileSync('npx', ['astro', 'build'], {
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: { ...process.env, SITE_BASE: base },
  });
  const probePath = join('dist', SUB.slice(1), 'index.html');
  if (!existsSync(probePath)) {
    throw new Error(`探针页面没有产出：${probePath}（构建是否失败？）`);
  }
  return readFileSync(probePath, 'utf8');
}

export function extractProbeRefs(html) {
  return [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
}

function main() {
  const keep = process.argv.includes('--keep');
  const selfTest = process.argv.includes('--self-test');
  const repoRoot = resolve('.');
  const probeAbs = join(repoRoot, PROBE);
  let pendingExitCode = 0;

  // 探针是本脚本自己生成的临时文件。若上次运行被中途打断（例如管道被提前关闭），
  // 它会残留。只在本文件确实是我们生成的情况下才允许覆盖 ——
  // 绝不覆盖用户的文件。
  if (existsSync(probeAbs)) {
    const current = readFileSync(probeAbs, 'utf8');
    const isOurs = current.includes('probe-build-base') || current.includes('base parity probe');
    if (!isOurs) {
      console.error(`${PROBE} 已存在且不是本脚本生成的，拒绝覆盖。请先自行处理该文件。`);
      // 这里用 return 而不是 process.exit()：保持「退出只发生在一处」，
      // 避免出现绕过清理的第二条退出路径。
      process.exitCode = 1;
      return;
    }
    console.log(`清理上次运行残留的探针文件：${PROBE}`);
    rmSync(probeAbs, { force: true });
  }

  try {
    mkdirSync(join(repoRoot, 'src', 'pages'), { recursive: true });
    let source = probeSource();
    if (selfTest) {
      // --self-test：把那条有意写坏的硬编码链接用在「好」的链接位置上，
      // 检查器应当报警。若不报警，说明检查器是坏的。
      source = source.replace("href={withBase('zh/')}", "href={'/zh/'}");
      console.log('自检模式：已把 lang 链接换成硬编码 —— 检查器必须报警\n');
    }
    writeFileSync(probeAbs, source, 'utf8');

    console.log('构建 A：base = /');
    const htmlA = build('/');
    console.log('构建 B：base = /yukki-rui');
    const htmlB = build('/yukki-rui');

    // 身份标记：产物自己声明是哪个 base 构建的
    const declaredA = normalizeBaseValue(readBuildBase(htmlA));
    const declaredB = normalizeBaseValue(readBuildBase(htmlB));
    console.log(`\n产物声明的 base：A = ${JSON.stringify(declaredA)}，B = ${JSON.stringify(declaredB)}`);

    const normA = normalizeBase(htmlA, '/');
    const normB = normalizeBase(htmlB, '/yukki-rui');

    // 探针链接按 id 归类后比较
    const refMap = (html) => {
      const map = {};
      for (const m of html.matchAll(/id="(\w+)" href="([^"]*)"/g)) map[m[1]] = m[2];
      return map;
    };
    const refsA = refMap(htmlA);
    const refsB = refMap(htmlB);
    console.log(`base=/          探针链接 → ${JSON.stringify(refsA)}`);
    console.log(`base=/yukki-rui 探针链接 → ${JSON.stringify(refsB)}`);

    let failed = false;
    const fail = (msg) => {
      failed = true;
      console.error(`✗ ${msg}`);
    };

    // 检查 1：身份标记必须真的不同，否则后面的比较没有意义
    if (declaredA !== '/' || declaredB !== '/yukki-rui') {
      fail(`身份标记不符合预期（A 应为 '/'，B 应为 '/yukki-rui'）—— 构建可能被缓存或没生效`);
    } else {
      console.log('✓ 两次构建的身份标记各自正确 —— 比较有效');
    }

    // 检查 2：归一化后两份产物必须只差 base 前缀
    if (normA !== normB) {
      fail('归一化后两次产物不相等 —— 存在没有经过 withBase() 的路径');
    } else {
      console.log('✓ 归一化后两次产物逐字节相等');
    }

    // 检查 3：子路径构建下，经过助手的链接必须带 base 前缀
    const mustHavePrefix = ['root', 'lang', 'post', 'tag'];
    const missingPrefix = mustHavePrefix.filter(
      (id) => refsB[id] && refsB[id].startsWith('/') && !refsB[id].startsWith('/yukki-rui'),
    );
    if (missingPrefix.length > 0) {
      fail(
        `子路径构建下有 ${missingPrefix.length} 条链接缺少 base 前缀：` +
          missingPrefix.map((id) => `${id}=${refsB[id]}`).join(', '),
      );
    } else {
      console.log('✓ 子路径构建下所有助手链接都带 base 前缀');
    }

    // 检查 4：根构建下不应出现子路径前缀
    const wrongPrefix = mustHavePrefix.filter((id) => (refsA[id] ?? '').startsWith('/yukki-rui'));
    if (wrongPrefix.length > 0) {
      fail(`根构建下出现子路径前缀：${wrongPrefix.join(', ')}`);
    } else {
      console.log('✓ 根构建下没有多余的子路径前缀');
    }

    // 检查 5：id="bad" 那条硬编码链接在子路径构建下必须原样保留（不带前缀）——
    // 它证明检查器能分辨「经过助手」与「没经过助手」的路径。
    if (refsB.bad !== '/zh/') {
      fail(`硬编码反例的产物值不是 '/zh/'，得到 ${JSON.stringify(refsB.bad)} —— 检查器逻辑有误`);
    } else {
      console.log('✓ 硬编码反例保持原样，检查器能分辨两类路径');
    }

    // 自检模式下，检查 3 必须失败 —— 否则检查器形同虚设
    let exitCode = failed ? 1 : 0;
    if (selfTest) {
      if (!failed) {
        console.error('\n✗ 自检失败：已注入硬编码链接，检查器却报通过。检查器不可信。');
        exitCode = 1;
      } else {
        console.log('\n✓ 自检通过：检查器成功抓到了注入的硬编码链接');
        exitCode = 0;
      }
    }

    // 关键：这里**不能**调用 process.exit()。Node 的 process.exit() 不等待
    // finally 执行，会把下面的清理逻辑整个跳过，每次运行都残留探针与 dist。
    // 正确做法是把退出码交给 finally 之后统一退出。
    pendingExitCode = exitCode;
  } catch (error) {
    console.error(`\n✗ 脚本异常：${error instanceof Error ? error.message : String(error)}`);
    pendingExitCode = 1;
  } finally {
    try {
      rmSync(probeAbs, { force: true });
      if (!keep) rmSync(join(repoRoot, 'dist'), { recursive: true, force: true });
      console.log('已清理探针与构建产物');
    } catch (error) {
      console.error(
        `清理失败（不影响检查结论，但请手工删掉 ${PROBE} 和 dist/）：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (pendingExitCode === 0) pendingExitCode = 1;
    }
  }

  process.exit(pendingExitCode);
}

if (process.argv[1] && process.argv[1].endsWith('check-base-parity.mjs')) main();
