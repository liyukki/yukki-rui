/**
 * Decap CMS 的 GitHub OAuth 第 1 步：把用户重定向到 GitHub 授权页。
 *
 * 只有 Cloudflare Pages 会执行这个文件（GitHub Pages 是纯静态托管，没有函数）。
 * 需要在 Cloudflare 项目的 Environment variables 里配两个变量（见 docs/usage-guide.md）：
 *   GITHUB_CLIENT_ID     —— GitHub OAuth App 的 Client ID
 *   GITHUB_CLIENT_SECRET —— 对应的 Secret
 */
export function onRequestGet(context) {
  const { request, env } = context;
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return new Response(
      '缺少 GITHUB_CLIENT_ID：请到 Cloudflare Pages 项目的 Settings → Environment variables 里配置后再试。',
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const url = new URL(request.url);
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${url.origin}/api/callback`);
  authorize.searchParams.set('scope', 'repo');
  // state 只用于把 Decap 的鉴权上下文透传回去；真正的防 CSRF 由 GitHub 授权页的确认步骤承担。
  const state = url.searchParams.get('state');
  if (state) authorize.searchParams.set('state', state);

  return Response.redirect(authorize.href, 302);
}
