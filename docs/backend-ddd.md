# ForgeDesk 后端分层

后端按业务边界拆为 `auth`、`translation`、`worknotes`、`chat` 和 `admin`。每个边界都遵守同一套依赖方向：

```text
interfaces/rest  ->  application  ->  domain
infrastructure   ->  domain
```

`interfaces/rest` 只负责 HTTP、认证头提取和 DTO 映射，不能访问数据库或第三方 HTTP。受保护端点以 `@RequireLogin` 标注，由 `AuthenticationAspect` 统一校验令牌和管理员角色，并向 Controller 暴露当前请求身份。`application` 只编排一个业务用例和事务边界，不能依赖 Servlet、Controller 或具体 SQL。`domain` 放置业务概念、合并规则和端口接口，不依赖 Spring Web。`infrastructure` 实现领域端口，封装 JDBC、Redis 或第三方翻译厂商。

## 业务边界

| 边界          | 领域职责                                         | 基础设施实现                                                             |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `auth`        | 用户、会话、密码和令牌端口                       | PBKDF2、加密随机令牌、MySQL 用户仓储、Redis 会话仓储                     |
| `translation` | 厂商、凭据、配置仓储和翻译网关端口               | MySQL 用户隔离配置、百度/有道/Google/阿里 HTTP 网关                      |
| `worknotes`   | 笔记归档合并、归档存储端口                       | MySQL 用户隔离笔记仓储                                                   |
| `chat`        | 会话成员校验、消息、设备公钥与一次性连接凭证端口 | MySQL 会话/消息/设备公钥仓储、Redis Ticket、WebSocket 在线状态与实时通知 |
| `admin`       | 脱敏后的存储索引、系统资源监控端口               | MySQL 存储索引、CPU/内存/磁盘采集，不读取密钥或笔记正文                  |

## 新增功能

新增功能先确定所属业务边界，再按以下顺序添加：领域对象/端口、应用用例、基础设施适配器、REST DTO 与 Controller。不得让 Controller 直接访问 JDBC、Redis 或第三方 HTTP，也不得让应用服务直接拼 SQL 或第三方 HTTP 请求。

服务端持久化业务数据写入 MySQL，短期会话和一次性连接凭证写入 Redis；数据库账号、Redis 密码和部署配置不进入 Git。翻译凭据只由服务端仓储读取，REST 返回值和管理查询不得返回密钥、密码散列或笔记正文。
