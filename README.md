# TradeFlow CRM

面向外贸企业的客户管理 / 销售 / 报价 / 订单 / 回款 / 出运 / 售后平台。

## 技术栈
- Frontend: Vue 3 + TypeScript + Vite + Pinia + Vue Router + Element Plus + ECharts
- Backend: Node.js 22 + TypeScript production source; zero-dependency runnable API fallback for current validation
- Production DB target: PostgreSQL
- Local validation DB: Node.js built-in SQLite (`node:sqlite`)

## 当前可运行验证
```bash
cd apps/api
node server.mjs
```
API: http://127.0.0.1:8787/api
Health: http://127.0.0.1:8787/api/health

默认管理员：
- username: admin
- password: Admin@123456

> 首次进入生产环境必须修改默认密码，并配置 HTTPS、反向代理、密钥、备份策略。

## Vue 前端
```bash
cd apps/web
npm install
npm run dev
```
默认 API 地址：`http://127.0.0.1:8787/api`

## 模块
1. 客户主数据
2. 联系人与组织关系
3. 多渠道联系方式/一键触达
4. 品牌与渠道关系
5. 客户画像与价值评估
6. 客户跟进与销售活动
7. 询盘与商机
8. 报价与样品
9. 产品、价格与客户偏好
10. 合同与订单
11. 回款与信用
12. 出运、报关与单证
13. 售后与投诉
14. 客户营销
15. 搜索、筛选与数据治理
16. 团队协同、权限与客户归属
17. 自动化提醒
18. 统计分析
19. 文档附件
20. 系统配置与集成
21. 移动端适配
22. 数据安全与合规


## GitHub Pages 演示
仓库已提供 GitHub Pages 自动部署工作流。Pages 演示模式把数据保存在浏览器 localStorage，用于直接体验 UI 和业务流程；正式生产环境仍使用 Node.js API + 数据库。

首次启用：Repository Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。之后每次 main 更新会自动部署。


## 生产部署

生产环境推荐使用 Docker + Coolify 自托管。项目根目录已提供 `Dockerfile`、`docker-compose.prod.yml` 和 GitHub Actions 容器构建流程。详细步骤见 `docs/DEPLOY_COOLIFY.md`。
