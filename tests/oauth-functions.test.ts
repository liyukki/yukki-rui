import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet as authEndpoint } from '../functions/api/auth.js';
import { onRequestGet as callbackEndpoint } from '../functions/api/callback.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ENV = { GITHUB_CLIENT_ID: 'Iv1.test-client-id', GITHUB_CLIENT_SECRET: 'test-secret' };

/** 两个端点的签名不同（一个同步、一个 async），这里统一成 Promise 便于断言。 */
type Handler = (context: {
  request: Request;
  env: Record<string, string>;
}) => Response | Promise<Response>;

function call(handler: Handler, url: string, env: Record<string, string> = ENV) {
  return Promise.resolve(handler({ request: new Request(url), env }));
}

/** 伪造 GitHub 的令牌交换响应。 */
function stubTokenExchange(payload: unknown, ok = true) {
  const fetchMock = vi.fn(async () => {
    if (!ok) throw new Error('network down');
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('/api/auth：跳转到 GitHub 授权页', () => {
  it('缺少 GITHUB_CLIENT_ID 时明确报错，不静默跳转', async () => {
    const response = await call(authEndpoint, 'https://yukki-rui.pages.dev/api/auth?provider=github', {});
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('GITHUB_CLIENT_ID');
  });

  it('带上 client_id、repo 权限与逐字符一致的回调地址', async () => {
    const response = await call(
      authEndpoint,
      'https://yukki-rui.pages.dev/api/auth?provider=github&site_id=yukki-rui.pages.dev&scope=repo',
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const location = new URL(response.headers.get('Location')!);
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe(ENV.GITHUB_CLIENT_ID);
    expect(location.searchParams.get('redirect_uri')).toBe('https://yukki-rui.pages.dev/api/callback');
    expect(location.searchParams.get('scope')).toBe('repo');
  });

  it('把 Decap 传来的 state 原样透传，没有就不编造', async () => {
    const withState = await call(authEndpoint, 'https://yukki-rui.pages.dev/api/auth?provider=github&state=abc123');
    expect(new URL(withState.headers.get('Location')!).searchParams.get('state')).toBe('abc123');

    const withoutState = await call(authEndpoint, 'https://yukki-rui.pages.dev/api/auth?provider=github');
    expect(new URL(withoutState.headers.get('Location')!).searchParams.has('state')).toBe(false);
  });
});

describe('/api/callback：换取令牌并交回后台', () => {
  it('没有 code 时给出可操作的提示', async () => {
    const response = await call(callbackEndpoint, 'https://yukki-rui.pages.dev/api/callback');
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('code');
  });

  it('环境变量缺失时拒绝换令牌', async () => {
    const fetchMock = stubTokenExchange({ access_token: 'should-not-be-used' });
    const response = await call(callbackEndpoint, 'https://yukki-rui.pages.dev/api/callback?code=abc', {});
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('GITHUB_CLIENT_SECRET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('成功时按 Decap 协议回传 token，且响应不可缓存', async () => {
    const fetchMock = stubTokenExchange({ access_token: 'gho_test_token', token_type: 'bearer' });
    const response = await call(callbackEndpoint, 'https://yukki-rui.pages.dev/api/callback?code=abc123');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    // 换令牌时用的是标准端点，且 redirect_uri 与本页 origin 完全一致。
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(String(init.body))).toEqual({
      client_id: ENV.GITHUB_CLIENT_ID,
      client_secret: ENV.GITHUB_CLIENT_SECRET,
      code: 'abc123',
      redirect_uri: 'https://yukki-rui.pages.dev/api/callback',
    });

    const html = await response.text();
    expect(html).toContain("'authorization:github:' + STATUS + ':' + DATA");
    // DATA 必须是 JSON 字符串字面量：写成对象字面量时，字符串拼接会得到
    // "[object Object]"，Decap 的 JSON.parse 会直接抛 SyntaxError。
    expect(html).toContain('var DATA = "{\\"token\\":\\"gho_test_token\\",\\"provider\\":\\"github\\"}"');
    expect(html).not.toContain('var DATA = {"token"');
    // targetOrigin 固定为本站，不再用 '*'。
    expect(html).toContain('var ORIGIN = "https://yukki-rui.pages.dev"');
    expect(html).not.toContain("postMessage('authorization:github:' + STATUS + ':' + DATA, '*')");
  });

  it('GitHub 报错时把原因带出来，而不是回一个空白页', async () => {
    stubTokenExchange({ error: 'bad_verification_code', error_description: 'The code passed is incorrect' });
    const response = await call(callbackEndpoint, 'https://yukki-rui.pages.dev/api/callback?code=wrong');
    expect(response.status).toBe(502);
    expect(await response.text()).toContain('The code passed is incorrect');
  });

  it('网络异常时不抛 500，而是给出可读的 502', async () => {
    stubTokenExchange(null, false);
    const response = await call(callbackEndpoint, 'https://yukki-rui.pages.dev/api/callback?code=abc123');
    expect(response.status).toBe(502);
    expect(await response.text()).toContain('network down');
  });

  it('用户取消授权时把 error 交回后台，且不去换令牌', async () => {
    const fetchMock = stubTokenExchange({ access_token: 'unused' });
    const response = await call(
      callbackEndpoint,
      'https://yukki-rui.pages.dev/api/callback?error=access_denied&error_description=The+user+denied+the+request',
    );
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const html = await response.text();
    expect(html).toContain('The user denied the request');
    expect(html).toContain('authorization:github:');
  });

  it('把 GitHub 的错误文本安全嵌进页面，不构成脚本注入', async () => {
    const evil = '</script><script>alert(1)</script>';
    const response = await call(
      callbackEndpoint,
      `https://yukki-rui.pages.dev/api/callback?error=access_denied&error_description=${encodeURIComponent(evil)}`,
    );
    const html = await response.text();
    expect(html).not.toContain('</script><script>alert(1)</script>');
    // 嵌进脚本的字符串里，'<' 被转义成 \u003c，无法提前闭合 <script>。
    expect(html).toContain('\\u003c/script');
    // 整页只应有一个真正的 </script> 结束标签。
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    // 可见文案里也是转义后的实体，不会真的执行。
    expect(html).toContain('&lt;/script&gt;');
  });
});
