# TradeFlow 独立自动化调度器

TradeFlow API 本身仍保留进程内自动扫描，方便开发和演示；生产环境建议额外启用本工作流，让自动化调度不依赖 Web 进程中的 `setInterval`。

## 工作流

文件：

`.github/workflows/automation-scheduler.yml`

默认每 15 分钟调用一次：

`POST /api/automation/run`

也支持 GitHub Actions 页面手工 `Run workflow`。

## 必须配置的 Repository Secrets

### 1. TRADEFLOW_SCHEDULER_URL

正式 TradeFlow 站点根地址，例如：

`https://crm.example.com`

不要带末尾 `/api`。

### 2. TRADEFLOW_SCHEDULER_TOKEN

在 TradeFlow：

系统配置 → 系统集成 → API Token

创建一个 **manager** 角色 Token，并把创建时只显示一次的明文 Token 保存到 GitHub Secret。

不要把 Token 写入仓库文件。

## 安全说明

- Scheduler 使用现有 Bearer API Token 认证。
- `/api/automation/run` 只允许 admin / manager 权限。
- GitHub Secret 不会写入仓库。
- 调度工作流只调用 TradeFlow 自己的 API，不直接访问数据库。
- 如果正式站点不可达，工作流会失败并在 GitHub Actions 中留下失败记录。

## Codespaces 限制

如果 `TRADEFLOW_SCHEDULER_URL` 指向 Codespaces，而 Codespace 已休眠/停止，外部 Scheduler 也无法唤醒一个不可访问的应用。

独立 Scheduler 适用于已经部署在 Coolify、VPS 或其他 24/7 可访问环境中的 TradeFlow。

## 建议

生产环境可以保留：
- Web 进程内每 10 分钟扫描：作为容器运行期间的兜底；
- GitHub Actions 每 15 分钟扫描：作为外部调度；
- 自动任务有 `automation_key` 去重，因此重复扫描不会重复创建同一条任务。
