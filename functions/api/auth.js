/**
 * Decap CMS 的 GitHub OAuth 第 1 步：把用户重定向到 GitHub 授权页。
 *
 * 只有 Cloudflare Pages 会执行这个文件（GitHub Pages 是纯静态托管，没有函数）。
 * 需要在 Cloudflare 项目的 Environment variables 里配两个变量（见 docs/usage-guide.md）：
 *   GITHUB_CLIENT_ID     —— GitHub OAuth App 的 Client ID
 *   GITHUB_CLIENT_SECRET —— 对应的 Secret
 *
 * 与 Decap 3.8.3 客户端的实际约定（读 dist/decap-cms.js 得到，不是猜的）：
 *   - 后台「Login with GitHub」会用 window.open 打开
 *      `${base_url}${auth_endpoint}?provider=github&site_id=<域名>&scope=repo`
 *   - 回跳拿到的令牌，会以 postMessage 形式送回后台；后台只接受
 *     `event.origin === base_url` 的消息（所以 config.yml 的 base_url 必须与
 *     实际访问后台的域名完全一致）。
 *   - redirect_uri 必须与 GitHub OAuth App 里登记的 callback URL 逐字符相同。
 */
export function onRequestGet(context) {
  const { request, env } = context;
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return new Response(
      '缺少 GITHUB_CLIENT_ID：请到 Cloudflare Pages 项目的 Settings → Environment variables 里配置后再试。',
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  }

  const url = new URL(request.url);
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${url.origin}/api/callback`);
  // 仓库是公开的，但后台要提交 commit，所以需要 repo 权限（Decap 自己也是请求 repo）。
  authorize.searchParams.set('scope', 'repo');
  // state 只用于把 Decap 的鉴权上下文透传回去；真正的防 CSRF 由 GitHub 授权页的确认步骤承担。
  const state = url.searchParams.get('state');
  if (state) authorize.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: { Location: authorize.href, 'Cache-Control': 'no-store' },
  });
}
