# 图书管理 (demo)

图书管理应用的演示仓库。已有馆藏数据已清空，本地数据库、数据备份和环境配置不会提交到 GitHub。

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## 中文 ISBN 检索与来源故障

ISBN 搜索同时查询孔夫子旧书网公开搜索页使用的
`https://search.kongfz.com/pc-gw/search-web/client/pc/product/keyword/list`，
参数为 `keyword=<ISBN>&page=1`。只接收返回 `isbn` 与输入一致的记录，
排除推荐商品，并将重复商品合并为一条书目；保留来源名称。商品标题可能含分类或版本说明。
此来源不依赖手工添加 ISBN 词条，但其可用性仍取决于对方网站。

`/api/search` 的 `sourceErrors` 返回来源名、错误类型及可用的 HTTP 状态码，
不返回密钥或请求 URL。CALIS 要求验证码时显示官网验证提示，不自动绕过；
豆瓣 ISBN 返回 404 表示没有该编号的记录，不列为来源故障；429 表示限流。

## CiNii Books 配置

搜索 API 已支持日本 CiNii Books。该官方接口要求 Application ID：先在
[CiNii Web API 用户注册说明](https://support.nii.ac.jp/ja/cinii/api/developer)
申请，然后在项目根目录创建不会提交到 Git 的 `.env.local`：

```env
CINII_APP_ID=你的_application_id
```

重新启动应用后，ISBN 会使用精确匹配；关键词、索书号和旧版统一书号会使用
CiNii Books 自由关键词检索。未配置时会静默跳过该来源，不影响其他搜索源。

## Windows 一键安装与启动

1. 新电脑首次使用时，联网并双击项目根目录的 `安装.cmd`。
2. 安装程序会自动下载项目专用的 Node.js、安装全部依赖并完成编译，不需要
   提前安装 Node.js，也不需要管理员权限。
3. 安装完成后，双击 `启动.cmd`；服务就绪后会自动打开浏览器。

便携 Node.js 保存在 `.runtime`，本地数据库与开发状态保存在 `.wrangler`。
迁移完整应用时请保留这两个目录；只备份数据时至少保留 `.wrangler`。关闭
启动窗口即可停止本地服务。

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
