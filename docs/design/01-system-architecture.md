# 系统架构设计文档

## 1. 架构概览

### 1.1 系统定位
Claude Web是一个基于Web的远程代码执行平台，允许用户通过浏览器界面操控Claude CLI，支持移动端访问和无人化托管。

### 1.2 核心价值
- **远程访问**: 随时随地通过手机/电脑操控Claude
- **项目隔离**: 多项目独立管理，安全隔离
- **实时交互**: 支持命令确认和实时状态反馈
- **无人托管**: 后台自动执行，结果通知推送

## 2. 系统架构

### 2.1 整体架构图
```
┌─────────────────────────────────────────────────────────────────┐
│                        用户层 (User Layer)                        │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   Mobile Web    │   Desktop Web   │   Mobile App    │  Webhook    │
│   (响应式)       │   (管理后台)     │   (原生应用)     │  (第三方)    │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      接入层 (Gateway Layer)                       │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   Nginx         │   Load Balancer │   Rate Limiter  │   SSL/TLS   │
│   (静态资源)     │   (负载均衡)     │   (限流保护)     │   (安全)     │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      应用层 (Application Layer)                   │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   Web UI        │   API Gateway   │   WebSocket     │   Admin     │
│   (Next.js)     │   (FastAPI)     │   (实时通信)     │   (管理界面) │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      服务层 (Service Layer)                       │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   Auth Service  │ Project Service │  Task Service   │Notification │
│   (用户认证)     │   (项目管理)     │   (任务管理)     │  (通知服务)  │
├─────────────────┼─────────────────┼─────────────────┼─────────────┤
│  Claude Engine  │  Git Service    │  Queue Service  │  Log Service│
│  (CLI执行器)    │  (仓库管理)      │  (任务队列)      │  (日志管理)  │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      数据层 (Data Layer)                         │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   MySQL         │   Redis         │   File Storage  │   Logs      │
│   (关系数据)     │   (缓存/会话)    │   (文件存储)     │   (日志)     │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                    基础设施层 (Infrastructure)                     │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   Docker        │   Kubernetes    │   Monitoring    │   Security  │
│   (容器化)       │   (编排)        │   (监控)        │   (安全)     │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
```

### 2.2 微服务拆分

#### 2.2.1 核心服务
- **API Gateway**: 统一入口，路由分发，认证鉴权
- **User Service**: 用户管理，认证授权
- **Project Service**: 项目管理，Git集成
- **Task Service**: 任务管理，状态追踪
- **Execution Service**: Claude CLI执行引擎
- **Notification Service**: 通知推送服务

#### 2.2.2 支撑服务
- **File Service**: 文件存储管理
- **Log Service**: 日志收集分析
- **Config Service**: 配置中心
- **Monitor Service**: 监控告警

### 2.3 数据流设计

#### 2.3.1 命令执行流程
```
[用户] → [Web UI] → [API Gateway] → [Task Service] → [Queue] → [Execution Service] → [Claude CLI]
   ↑                                      ↓                                            ↓
[WebSocket] ← [Notification Service] ← [Event Bus] ← [Status Update] ← [Result]
```

#### 2.3.2 实时通信流程
```
[Claude CLI] → [Execution Service] → [Event Bus] → [WebSocket Service] → [Client]
                      ↓
[Task Service] → [Database] → [State Sync]
```

## 3. 技术选型

### 3.1 前端技术栈
- **框架**: Next.js 15 (App Router)
- **UI组件**: Radix UI + Tailwind CSS
- **状态管理**: Zustand
- **实时通信**: Socket.IO Client
- **构建工具**: Turbopack
- **部署**: Vercel / Nginx

### 3.2 后端技术栈
- **API框架**: FastAPI (高性能异步)
- **数据库**: MySQL 8.0 + Redis
- **ORM**: SQLAlchemy (异步)
- **任务队列**: Celery + Redis
- **WebSocket**: FastAPI WebSocket
- **缓存**: Redis
- **搜索**: Elasticsearch (可选)

### 3.3 基础设施
- **容器化**: Docker + Docker Compose
- **编排**: Kubernetes (生产环境)
- **负载均衡**: Nginx / Traefik
- **监控**: Prometheus + Grafana
- **日志**: ELK Stack
- **CI/CD**: GitHub Actions

### 3.4 安全技术
- **认证**: JWT + Refresh Token
- **授权**: RBAC (基于角色)
- **隔离**: Docker Container + Network Policy
- **加密**: AES-256 (敏感数据)
- **审计**: 操作日志 + 访问记录

## 4. 核心组件设计

### 4.1 API Gateway
**职责**: 统一入口，路由分发，认证鉴权，限流熔断
**技术**: FastAPI + Redis

**功能特性**:
- JWT Token验证
- API限流 (按用户/IP)
- 请求路由和负载均衡
- 统一错误处理
- API文档生成

### 4.2 Execution Engine
**职责**: Claude CLI命令执行，进程管理，资源控制
**技术**: Python asyncio + Docker

**功能特性**:
- 命令沙箱执行
- 实时输出流式传输
- 进程生命周期管理
- 资源使用限制
- 错误恢复机制

### 4.3 Task Queue
**职责**: 异步任务处理，状态管理，优先级调度
**技术**: Celery + Redis

**功能特性**:
- 任务队列调度
- 失败重试机制
- 优先级处理
- 并发控制
- 监控面板

### 4.4 WebSocket Service
**职责**: 实时双向通信，状态同步，事件推送
**技术**: FastAPI WebSocket + Redis Pub/Sub

**功能特性**:
- 连接管理和心跳
- 房间/频道管理
- 消息广播
- 连接状态同步
- 断线重连

## 5. 数据库设计

### 5.1 核心表结构
```sql
-- 用户表
users: id, username, email, password_hash, role, created_at, updated_at

-- 项目表  
projects: id, name, git_url, user_id, ssh_key_encrypted, config, created_at

-- 任务表
tasks: id, project_id, command, status, priority, result, error, created_at

-- 通知表
notifications: id, user_id, task_id, type, content, read_at, created_at

-- 会话表
sessions: id, user_id, token_hash, expires_at, device_info

-- 审计日志
audit_logs: id, user_id, action, resource, details, ip_address, created_at
```

### 5.2 索引策略
- 用户表: username(unique), email(unique)
- 项目表: user_id, created_at
- 任务表: project_id, status, created_at(复合索引)
- 通知表: user_id, read_at
- 审计日志: user_id, created_at

## 6. 性能设计

### 6.1 缓存策略
- **L1缓存**: 应用内存缓存 (用户信息、配置)
- **L2缓存**: Redis缓存 (会话、临时数据)
- **CDN缓存**: 静态资源缓存

### 6.2 数据库优化
- 读写分离 (主从复制)
- 连接池管理
- 慢查询监控
- 定期数据归档

### 6.3 并发处理
- 异步I/O处理
- 连接复用
- 任务队列削峰
- 熔断降级机制

## 7. 可扩展性设计

### 7.1 水平扩展
- 无状态服务设计
- 负载均衡支持
- 数据库分片 (按用户)
- 缓存集群

### 7.2 垂直扩展  
- 资源配置可调
- 容器资源限制
- 自动扩缩容
- 性能监控告警

## 8. 容错设计

### 8.1 高可用
- 服务多实例部署
- 数据库主从备份
- 异地容灾备份
- 健康检查和自愈

### 8.2 故障处理
- 优雅降级
- 断路器模式
- 重试机制
- 故障隔离

## 9. 安全架构

### 9.1 网络安全
- VPC网络隔离
- 防火墙规则
- DDoS防护
- SSL/TLS加密

### 9.2 应用安全
- 输入验证和过滤
- SQL注入防护
- XSS攻击防护
- CSRF Token验证

### 9.3 数据安全
- 敏感数据加密
- 密钥管理 (KMS)
- 访问审计
- 数据脱敏

## 10. 监控和运维

### 10.1 监控体系
- 基础设施监控 (CPU/内存/磁盘)
- 应用性能监控 (响应时间/错误率)
- 业务监控 (用户活跃度/任务成功率)
- 日志监控 (错误日志/审计日志)

### 10.2 告警机制
- 多级告警策略
- 多渠道通知 (邮件/短信/钉钉)
- 告警收敛和降噪
- 自动故障恢复

## 11. 部署架构

### 11.1 环境规划
- **开发环境**: 本地Docker Compose
- **测试环境**: Kubernetes测试集群
- **预发环境**: 生产同构环境
- **生产环境**: 多AZ部署

### 11.2 发布策略
- 蓝绿部署
- 滚动更新
- 金丝雀发布
- 快速回滚

这个系统架构设计为后续的详细设计提供了全面的技术框架和实施指导。