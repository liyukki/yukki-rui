# 文章点赞功能设计

## 目标

在每篇文章正文底部加入免登录点赞按钮，让读者可以表达喜欢并看到真实总数，同时与评论区的单条评论表情反应保持独立。

## 范围

- 点赞位置：文章阅读设置、正文、相关推荐、上一篇/下一篇之后，评论区之前。
- 中英文译文共享同一个点赞总数。
- 同一 IP 对同一篇文章只能计一次；再次点击可以取消。
- 不做用户账号、排行榜、通知或第三方统计服务。

## 文章唯一键

前端从文章内容生成稳定的 `postKey`：

- 有 `translationKey`：`translation:<translationKey>`。
- 没有 `translationKey`：`post:<post.id>`。

模板通过 `data-post` 把该键传给客户端脚本。接口只接受符合安全字符集且长度受限的键，不把键当作权限凭证。

## 数据模型

Cloudflare D1 使用独立表：

```sql
CREATE TABLE IF NOT EXISTS post_likes (
  post_key TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_key, ip_hash)
);
```

- `ip_hash = sha256(IP + ":" + COMMENTS_SALT)`，只保存哈希，不保存原始 IP。
- 主键天然保证同一 IP 对同一文章最多一行。
- 建表采用幂等 SQL，接口首次访问时自动确保表存在。

## 接口

新增 `functions/api/post-likes.js`：

```text
GET  /api/post-likes?post=<postKey>
POST /api/post-likes
     { "post": "<postKey>", "action": "like" | "unlike" }
OPTIONS /api/post-likes
```

成功响应统一为：

```json
{ "count": 12, "liked": true }
```

行为：

- `GET` 返回总数以及当前 IP 是否已点赞。
- `POST like` 使用 `INSERT OR IGNORE`，重复请求不增加计数。
- `POST unlike` 删除当前 IP 的对应记录，重复请求不报错。
- 缺少 D1 或 `COMMENTS_SALT` 返回 `503`。
- 非法 JSON、文章键或 action 返回 `400`。
- 不允许的来源返回 `403`；白名单与评论接口共用。
- 所有响应使用 `Cache-Control: no-store`。

## 前端交互

新增 `src/components/PostLikes.astro`，由 `PostLayout.astro` 渲染在 `PostNav` 和 `Comments` 之间。

- 初始显示加载中的点赞按钮和计数占位。
- GET 成功后显示总数和当前状态。
- 点击采用乐观更新：立即改变计数与已赞状态，再发送 POST。
- 请求期间禁用按钮，防止快速连点；成功后以服务器返回值为准，失败则回滚并显示错误。
- 已赞状态使用 `aria-pressed="true"`，按钮文案明确区分“点赞”和“已赞，点击取消”。
- 图标使用内联 SVG，视觉上沿用现有像素卡片、边框、阴影和主题变量。
- 中文和英文文案加入 `src/consts.ts`，不在脚本里硬编码用户可见文本。
- 数据全部通过 `textContent` 写入，不拼 HTML。

## 部署与 CORS

- 复用评论接口的 `isAllowedOrigin`、`corsHeaders`、`commentHashSalt` 和 `clientIp` 逻辑；必要时把可复用辅助函数导出，避免复制实现。
- Cloudflare Pages 同源调用 `/api/post-likes`。
- GitHub Pages 镜像通过主站绝对地址跨域调用。
- 前端地址推导从评论 API 基址替换 `/api/comments` 为 `/api/post-likes`，保持两条部署链路一致。
- 不提交任何密钥；`COMMENTS_SALT` 继续由 Cloudflare Secret 提供。

## 测试

接口单元测试使用现有 `FakeD1`：

- 首次点赞计数为 1，重复点赞仍为 1。
- 取消后计数为 0，重复取消保持 0。
- 不同 IP 分别计数。
- 相同 `translationKey` 的不同语言页面使用同一个键时共享计数。
- 不同文章键互不影响。
- 非法请求、非法 action、缺少 D1、缺少盐、非法来源均有正确状态码。
- `OPTIONS` 返回 204 和正确 CORS 头。

纯函数与前端契约测试：

- `translationKey` 存在时生成共享键，不存在时使用文章 ID。
- 点赞接口地址在相对和跨域场景下均正确。
- 文章页模板包含新组件、`data-post` 与评论区顺序正确。
- `aria-pressed`、错误回滚和请求锁定逻辑存在。

完整验证：

```powershell
npm run check
npm test
npm run check:base
npm run check:content
npm run build
npm run check:links
npm run check:frontend
```

## 验收标准

- 中文页点赞后，对应英文页刷新可看到相同总数；同一 IP 在英文页显示已赞。
- Cloudflare Pages 与 GitHub Pages 镜像均可读取和切换点赞。
- 快速连点不会产生重复计数或负数。
- 网络失败时计数回滚，按钮恢复可操作并显示可理解的错误。
- 不改变现有页面宽度、评论区、主题和移动端布局。
- 构建及全部测试通过。