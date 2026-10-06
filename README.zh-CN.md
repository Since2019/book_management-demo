# 书栈 · 图书管理 (demo)

[English README](README.md)

基于 React、vinext 和 Cloudflare D1 的个人图书管理应用。支持书目检索、图书录入、箱子与标签管理、封面上传，以及馆藏备份导入和导出。

公开演示版从空馆藏开始。私人馆藏、上传封面、箱子标签、数据备份和本地凭据均不提交到 Git。

## 界面语言

新浏览器会话默认使用英语。点击 **EN**、**简**、**繁** 可切换英语、简体中文和繁体中文。已保存的语言偏好会保留。

## Windows 安装与启动

1. 联网后双击 `安装.cmd`，自动下载项目专用 Node.js、安装依赖并编译。
2. 双击 `启动.cmd`，服务就绪后自动打开 http://127.0.0.1:3000/。
3. 关闭启动窗口即可停止服务。

便携运行环境保存在 `.runtime`，本地数据库保存在 `.wrangler`。备份馆藏时请保留整个 `.wrangler` 文件夹。这两个文件夹不会提交到 Git。

## 开发运行

需要 Node.js >=22.13.0。

```sh
npm install
npm run dev
npm run build
```

开发服务器会显示实际访问地址；端口被占用时请使用终端显示的地址。

## 可选的 CiNii Books 配置

先通过 [CiNii 官方开发者注册说明](https://support.nii.ac.jp/ja/cinii/api/developer) 申请 Application ID，然后在项目根目录创建被 Git 忽略的 `.env.local`：

```env
CINII_APP_ID=你的_application_id
```

修改后重启应用。未配置时跳过 CiNii，不影响其他来源。仓库不附带 API key。

## 检索来源

支持 ISBN、关键词、索书号和旧版统一书号检索。中文 ISBN 检索也会查询孔夫子旧书网，只接收 ISBN 精确匹配的记录并合并重复书目。外部来源的可用性取决于对方服务。

`/api/search` 返回来源名、错误类型和可用的 HTTP 状态码，不返回凭据或请求 URL。CALIS 验证提示链接到官网；豆瓣 ISBN 返回 404 表示没有对应记录，429 表示限流。

`data/singapore-tcm-catalog.json` 是检索用参考书目，不是私人录入的馆藏。

## 项目结构

- `app/`：界面与 API 路由
- `db/`、`drizzle/`：数据库结构和迁移
- `vite.config.ts`：本地 Cloudflare 绑定及可选环境配置
- `.openai/hosting.json`：可选托管元数据和 D1 绑定名称
- `scripts/`：安装、启动与书目导入脚本
- `clipboard-tool/`：可选 Windows 剪贴板工具

## 数据与凭据

请勿提交 `.env*`、`.wrangler`、`.runtime` 或 `outputs` 中的备份。私人箱子标签 SVG 也已忽略。凭据仅在本机配置；演示仓库仅保留配置变量名和占位值。
