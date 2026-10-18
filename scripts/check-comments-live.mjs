#!/usr/bin/env node
// 线上评论区检查：默认只读；带 --write 且设了 COMMENTS_ADMIN_TOKEN 时做一次「发→查→删」闭环。
//
//   npm run check:comments-live            # 只读检查
//   $env:COMMENTS_ADMIN_TOKEN='...'; npm run check:comments-live -- --write
//
// 依赖：能访问 https://yukki-rui.pages.dev 与 https://liyukki.github.io/yukki-rui/。

const PROD_ORIGIN = 'https://yukki-rui.pages.dev';
const MIRROR_ORIGIN = 'https://liyukki.github.io';
const MIRROR_BASE = '/yukki-rui';
const ARTICLE = '/zh/posts/hello-world/';
const THREAD = `${ARTICLE}`;
const WRITE = process.argv.includes('--write');
const ADMIN_TOKEN = process.env.COMMENTS_ADMIN_TOKEN || '';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) {
    pass += 1;
    console.log(`✓ ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

const fetchText = async (url, init) => {
  const res = await fetch(url, init);
  return { res, text: await res.text() };
};

// 1. 文章页渲染出评论区（两个平台）
for (const [label, url, expectApi] of [
  ['Cloudflare', `${PROD_ORIGIN}${ARTICLE}`, ''],
  ['GitHub Pages', `${MIRROR_ORIGIN}${MIRROR_BASE}${ARTICLE}`, `${PROD_ORIGIN}/api/comments`],
]) {
  const { res, text } = await fetchText(url);
  check(`[${label}] 文章页 200`, res.status === 200, `status=${res.status}`);
  const api = /data-api="([^"]*)"/.exec(text)?.[1] ?? (/\bdata-api(?=[\s>])/.test(text) ? '' : null);
  const thread = /data-thread="([^"]*)"/.exec(text)?.[1];
  check(`[${label}] 评论区已渲染且 thread 正确`, thread === THREAD, `thread=${thread}`);
  check(`[${label}] 接口地址正确`, api === expectApi || (expectApi === '' && (api === '' || api === null)), `data-api="${api}"`);
}

// 2. 公开接口可读（D1 已绑定）
{
  const { res, text } = await fetchText(`${PROD_ORIGIN}/api/comments?thread=${encodeURIComponent(THREAD)}&limit=5`);
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {}
  check('公开接口 200（D1 已绑定）', res.status === 200, `status=${res.status}`);
  check('返回结构正确', Array.isArray(body.items) && typeof body.total === 'number');
  check('不泄漏 ip_hash / user_agent', (body.items || []).every((i) => !('ipHash' in i) && !('ip_hash' in i) && !('userAgent' in i)));
}

// 3. CORS：镜像站放行，拼错的来源与陌生来源拒绝
{
  const allowed = await fetch(`${PROD_ORIGIN}/api/comments`, {
    method: 'OPTIONS',
    headers: { origin: MIRROR_ORIGIN, 'access-control-request-method': 'POST' },
  });
  check('镜像站跨域被放行', allowed.status === 204 && allowed.headers.get('access-control-allow-origin') === MIRROR_ORIGIN);
  const typo = await fetch(`${PROD_ORIGIN}/api/comments?thread=${encodeURIComponent(THREAD)}`, {
    headers: { origin: 'https://liukki.github.io' },
  });
  check('拼错用户名的来源被拒', typo.status === 403, `status=${typo.status}`);
  const evil = await fetch(`${PROD_ORIGIN}/api/comments?thread=${encodeURIComponent(THREAD)}`, {
    headers: { origin: 'https://evil.example' },
  });
  check('陌生来源被拒', evil.status === 403, `status=${evil.status}`);
}

// 4. 管理页与后台入口
{
  const admin = await fetchText(`${PROD_ORIGIN}/admin/comments/`);
  check('管理页 200', admin.res.status === 200);
  check('管理页含令牌输入', admin.text.includes('管理令牌') || admin.text.includes('COMMENTS_ADMIN_TOKEN'));
  const main = await fetchText(`${PROD_ORIGIN}/admin/`);
  check('后台页有评论管理入口', main.text.includes('admin-comments-link'));
}

// 5. 可选写入闭环
if (WRITE) {
  if (!ADMIN_TOKEN) {
    check('写入闭环需要 COMMENTS_ADMIN_TOKEN', false, '未设置环境变量');
  } else {
    const bodyText = `线上检查脚本发的测试评论（${new Date().toISOString()}），会被立即删除。`;
    const created = await fetch(`${PROD_ORIGIN}/api/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: PROD_ORIGIN },
      body: JSON.stringify({ thread: THREAD, author: '线上检查', body: bodyText, trap: '', elapsed: 3000 }),
    });
    const createdBody = await created.json().catch(() => ({}));
    check('发表评论 201', created.status === 201, `status=${created.status} ${JSON.stringify(createdBody).slice(0, 120)}`);
    const id = createdBody.item?.id;
    const listed = await (await fetch(`${PROD_ORIGIN}/api/comments-admin?limit=50`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } })).json();
    check('管理接口能看到该评论', (listed.items || []).some((i) => i.id === id));
    const deleted = await fetch(`${PROD_ORIGIN}/api/comments-admin?id=${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const deletedBody = await deleted.json().catch(() => ({}));
    check('删除测试评论', deleted.status === 200 && deletedBody.deleted === 1, JSON.stringify(deletedBody));
  }
}

console.log(`\n${pass}/${pass + fail} 项通过${fail ? `，${fail} 项失败` : ''}`);
process.exit(fail ? 1 : 0);
