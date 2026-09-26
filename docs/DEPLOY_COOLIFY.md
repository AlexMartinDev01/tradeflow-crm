# TradeFlow CRM — Coolify 生产部署

## 推荐架构

GitHub 保存源码，GitHub Actions 自动构建 Docker 镜像，Coolify 负责在你的 Linux VPS 上运行应用、域名、HTTPS、健康检查和自动部署。

这个项目已经改造成单一 HTTP 服务：

- Vue 前端构建后由 Node 服务直接提供。
- API 使用同域 `/api`，不需要跨域拼接两个公网地址。
- 容器监听 `0.0.0.0:8080`。
- SQLite 数据文件位于 `/data/tradeflow.db`。
- 上传文件位于 `/app/uploads`。
- Docker Compose 已给数据库和上传目录配置持久化卷。
- 健康检查地址：`/api/health`。

## VPS 要求

准备一台有公网 IP 和 SSH/root 权限的 Linux VPS。Coolify 官方最低要求是 2 CPU、2 GB RAM、10 GB 磁盘；正式业务建议给系统和容器留更多余量。

## 安装 Coolify

在全新的受支持 Linux VPS 上按照 Coolify 官方 Self-hosted 文档安装。安装完成后立即创建管理员账户。

## 从 GitHub 部署

1. 在 Coolify 创建 Project 和 Production Environment。
2. Create New Resource。
3. 选择 Git Repository / GitHub。
4. 授权仓库 `AlexMartinDev01/tradeflow-crm`。
5. Branch 选择 `main`。
6. Build Pack 选择 **Docker Compose**。
7. Docker Compose Location 填 `/docker-compose.prod.yml`。
8. 给 `tradeflow` 服务设置域名，并指定内部端口 **8080**。
9. 环境变量至少设置：
   - `APP_SECRET`：长度至少 32 位的随机字符串。
   - `CORS_ORIGIN`：正式域名，例如 `https://crm.example.com`。
10. Deploy。
11. 部署完成后先访问 `https://你的域名/api/health`，再访问系统首页。

## 数据持久化

不要删除下面两个 Compose volume：

- `tradeflow-data`：SQLite 数据。
- `tradeflow-uploads`：附件。

容器重新部署时这两个卷会保留，但持久化卷不是备份。正式使用后需要配置异机/对象存储备份。

## GitHub 自动构建

仓库的 `.github/workflows/docker-image.yml` 会在每次 push 到 `main` 后构建镜像并推送到 GitHub Container Registry。

镜像名称：

`ghcr.io/alexmartindev01/tradeflow-crm:latest`

你可以让 Coolify直接从 Git 仓库使用 Docker Compose 构建，也可以后续切换成从 GHCR 拉取预构建镜像。
