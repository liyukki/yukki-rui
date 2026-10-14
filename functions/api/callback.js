/**
 * Decap CMS 的 GitHub OAuth 第 2 步：用 code 换 access_token，然后按
 * Decap 的 postMessage 约定把令牌送回 /admin 弹窗，由后台自己关掉这个窗口。
 *
 * Decap 3.8.3 的实际握手协议（读 dist/decap-cms.js 得到，不是猜的）：
 *   1. 本页面向 opener 发送 "authorizing:github"（表示回跳完成）
 *      后台只接受 `event.origin === base_url` 的消息（config.yml 里的 base_url）
 *   2. 收到 opener 用同一条消息的回应后，发送
 *      "authorization:github:success:<json>"，json 形如 {token, provider}
 *      （GitHub 后端读的就是 user.token，随后存进 localStorage 的 decap-cms-user）
 *   3. 授权被拒绝时发 "authorization:github:error:<json>"，后台会显示错误而不是一直转圈
 *
 * 安全取舍：postMessage 的 targetOrigin 固定为本站 origin（不再用 '*'）。
 * 令牌只发给同源的 /admin 弹窗，避免被第三方页面用 window.open 骗走；
 * 代价是后台必须从本域名打开（GitHub Pages 那份静态部署没有登录函数），
 * 页面下方会给出对应提示。
 */

/** 把值安全嵌进 <script> 里的字面量：转义 <，防止字符串里的 </script> 提前闭合标签。 */
function jsValue(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function textResponse(body, status) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** 渲染握手页面：把结果 postMessage 回同源后台。 */
function handshakePage({ origin, status, payload, message }) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>后台登录</title>
</head>
<body>
<p>${escapeHtml(message)}</p>
<p id="hint"></p>
<script>
(function () {
  var ORIGIN = ${jsValue(origin)};
  var STATUS = ${jsValue(status)};
  // 必须是 JSON **字符串**：Decap 收到后自己做 JSON.parse，
  // 这里若内联成对象字面量，字符串拼接会得到 "[object Object]"。
  var DATA = ${jsValue(JSON.stringify(payload))};
  var hint = document.getElementById('hint');
  if (!window.opener) {
    hint.textContent = '没有找到后台窗口：请从 ' + ORIGIN + '/admin/ 重新打开后台再登录。';
    return;
  }
  function send() {
    window.opener.postMessage('authorization:github:' + STATUS + ':' + DATA, ORIGIN);
  }
  // 先表明回跳完成，再按后台的回应发结果；同时补发一次，兼容监听时机更早的后台。
  window.opener.postMessage('authorizing:github', ORIGIN);
  window.addEventListener('message', function (event) {
    if (event.data === 'authorizing:github') send();
  });
  send();
  window.setTimeout(function () {
    hint.textContent = '如果后台一直没有反应：请确认是从 ' + ORIGIN + '/admin/ 打开的（GitHub Pages 那份部署没有登录函数）。';
  }, 3000);
})();
<\/script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const denied = url.searchParams.get('error');

  // 用户在 GitHub 授权页点了取消：把错误交回后台，别让登录按钮一直转圈。
  if (denied) {
    const reason = url.searchParams.get('error_description') ?? denied;
    return handshakePage({
      origin,
      status: 'error',
      payload: { message: reason },
      message: `授权未完成：${reason}`,
    });
  }

  if (!code) {
    return textResponse(
      '缺少 code 参数：这是 GitHub 授权后的回调地址，请从 /admin 重新发起登录。',
      400,
    );
  }

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return textResponse(
      '缺少 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET：请到 Cloudflare Pages 项目的 Settings → Environment variables 里配置后重新部署。',
      500,
    );
  }

  let result;
  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${origin}/api/callback`,
      }),
    });
    result = await tokenResponse.json();
  } catch (error) {
    return textResponse(`连接 GitHub 换取令牌失败：${String(error).slice(0, 200)}`, 502);
  }

  if (!result || !result.access_token) {
    const reason = (result && (result.error_description ?? result.error)) || '未知错误';
    return textResponse(`GitHub 令牌交换失败：${reason}`, 502);
  }

  // 令牌只通过 postMessage 传给同源 /admin 弹窗，不落任何存储。
  return handshakePage({
    origin,
    status: 'success',
    payload: { token: result.access_token, provider: 'github' },
    message: '登录完成，正在返回后台……',
  });
}
