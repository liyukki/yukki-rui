/**
 * Decap CMS 的 GitHub OAuth 第 2 步：用 code 换 access_token，然后按
 * Decap 的 postMessage 约定把令牌送回 /admin 弹窗并关闭自己。
 *
 * Decap 的握手协议（窗口 opener 之间通信）：
 *   1. 本页面向 opener 发送 "authorizing:github"（表示回跳完成）
 *   2. 收到 opener 回应后，发送 "authorization:github:success:<json>" 完成登录
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('缺少 code 参数：这是 GitHub 授权后的回调地址，请从 /admin 重新发起登录。', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/callback`,
    }),
  });
  const result = await tokenResponse.json();

  if (!result.access_token) {
    const reason = result.error_description ?? result.error ?? '未知错误';
    return new Response(`GitHub 令牌交换失败：${reason}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // 令牌只通过 postMessage 传给同源 /admin 弹窗，不落任何存储。
  const payload = JSON.stringify({ token: result.access_token, provider: 'github' });
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>登录完成</title></head><body>
<script>
(function () {
  function send(status) {
    window.opener.postMessage('authorization:github:' + status + ':' + ${JSON.stringify(payload)}, '*');
  }
  window.opener.postMessage('authorizing:github', '*');
  window.addEventListener('message', function (event) {
    if (event.data === 'authorizing:github') send('success');
  });
  // 兼容 opener 已经监听就绪的情况：补发一次成功消息，然后关闭。
  send('success');
})();
<\/script>
登录完成，正在返回后台……你可以手动关闭这个窗口。
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
