# 架构设计

## 分层
- Vue Web：客户360°、业务模块、配置、分析。
- REST API：鉴权、CRUD、统计、外部程序链接生成、审计。
- DB：当前验证版 SQLite，生产迁移目标 PostgreSQL。
- 外部集成层：Email / WhatsApp / WeChat / LINE / VK / Telegram / ERP / 独立站 / 海关数据，通过 adapter 接入。

## 安全基线
- scrypt 密码哈希；12小时会话；HMAC 存储 token 摘要。
- 资源写操作审计日志。
- 基础限流、安全响应头、输入字段白名单。
- 客户使用软删除。
- 管理类接口角色保护。

## 生产化必须项
1. 将 SQLite 替换为 PostgreSQL + 正式 migration。
2. Nginx/Traefik HTTPS。
3. 对象存储保存附件，不在 DB 中存大文件。
4. Redis 做 session/rate limit/任务队列。
5. OAuth/企业 SSO 可选。
6. 定时任务处理沉默客户、回款逾期、报价到期、授权到期等自动提醒。
7. 独立审计库或不可变审计存储。
8. CI：lint / test / build / security scan / migration check。
