# 聊天接口说明

## 通用约定

- 基础地址由前端环境变量配置，例如 `http://127.0.0.1:8080`。
- 除登录、注册和健康检查外，接口需要 `Authorization: Bearer <token>`。
- `@RequireLogin` 由登录切面统一处理；Controller 不自行解析令牌。
- 所有 REST 响应由统一 `Result` 包装，`traceId` 可用于关联服务端日志。

```json
{
  "code": "OK",
  "message": "",
  "data": {},
  "traceId": "6e6a0c1f..."
}
```

## 加密传输

聊天使用服务端中心化分发。浏览器在内存中生成临时 X25519 密钥对，并用服务端 X25519 公钥协商 AES-256-GCM 传输密钥；消息正文在请求和响应中均为密文。服务端解密后立即使用独立 AES-256-GCM 存储密钥加密落库，数据库不保存聊天正文。

`GET /api/chat/transport-key` 返回服务端传输公钥：

```json
{ "publicKey": "base64-x25519-public-key" }
```

发送和读取消息时都必须携带浏览器临时公钥。它不是登录凭证，也不是私钥。

> 公网 HTTP 可以避免被动监听者直接读到消息正文，但无法认证服务端公钥，仍会受到主动中间人攻击。生产环境应使用 HTTPS；不能使用 HTTPS 时，应通过可信渠道校验或固定服务端公钥指纹。

## 数据结构

### 会话

```json
{
  "id": "uuid",
  "title": "项目讨论",
  "announcement": "本周五前完成验收",
  "participantIds": ["user-uuid-a", "user-uuid-b"],
  "createdBy": "user-uuid-a",
  "createdAt": "2026-07-23T17:05:02.594326+08:00",
  "updatedAt": "2026-07-23T17:05:02.594326+08:00"
}
```

### 加密消息

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "senderId": "user-uuid-a",
  "ciphertext": "base64-aes-gcm-ciphertext",
  "nonce": "base64-12-byte-nonce",
  "keyVersion": 2,
  "createdAt": "2026-07-23T17:06:02.594326+08:00"
}
```

`keyVersion=2` 表示中心化加密分发格式。旧版 P2P `keyVersion=1` 历史密文保留在数据库中，但新接口不会返回它。

### 消息分页

```json
{
  "messages": [],
  "nextAfter": "2026-07-23T17:06:02.594326+08:00",
  "previousBefore": "2026-07-23T17:05:02.594326+08:00",
  "hasMoreAfter": false,
  "hasMoreBefore": true
}
```

首次读取返回最近 100 条；`after` 用于增量同步，`before` 用于向更早历史翻页，两个游标不能同时指定。

## REST 接口

| 方法     | 路径                                                | 说明                                  |
| -------- | --------------------------------------------------- | ------------------------------------- |
| `POST`   | `/api/chat/socket-ticket`                           | 签发一分钟、单次使用的 WebSocket 凭证 |
| `GET`    | `/api/chat/transport-key`                           | 获取服务端 X25519 传输公钥            |
| `GET`    | `/api/chat/users`                                   | 获取其他已注册用户及在线状态          |
| `GET`    | `/api/chat/conversations`                           | 获取当前用户参与的会话                |
| `POST`   | `/api/chat/conversations/unread-counts`             | 按本地查看游标统计未读数量            |
| `POST`   | `/api/chat/conversations`                           | 创建一对一或群聊会话                  |
| `PUT`    | `/api/chat/conversations/{conversationId}/profile`  | 群主更新群名称和公告                  |
| `DELETE` | `/api/chat/conversations/{conversationId}`          | 创建者永久删除共享会话                |
| `GET`    | `/api/chat/conversations/{conversationId}/messages` | 分页读取传输密文                      |
| `POST`   | `/api/chat/conversations/{conversationId}/messages` | 发送传输密文                          |

### 发送消息

```http
POST /api/chat/conversations/{conversationId}/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "ciphertext": "base64-aes-gcm-ciphertext",
  "nonce": "base64-12-byte-nonce",
  "clientPublicKey": "base64-x25519-public-key"
}
```

服务端校验当前用户是会话成员，解开传输密文后以存储密钥加密写入。单条原文最大 1 MB。群聊和一对一的发送成本相同，不按成员或设备数量重复加密。

### 读取消息

```http
GET /api/chat/conversations/{conversationId}/messages?clientPublicKey=...&after=2026-07-23T17%3A06%3A02%2B08%3A00
Authorization: Bearer <token>
```

服务端为当前浏览器临时公钥重新加密当前页内容后返回。实时聊天只按 `after` 拉取新增消息，不会在每条消息后重复下载历史。

## WebSocket

连接步骤：先调用 `POST /api/chat/socket-ticket`，再在一分钟内连接 `/ws/chat?ticket=<ticket>`。登录 Token 不会放进 WebSocket URL，WebSocket 只发送元信息，不发送消息正文。

| 事件                   | 字段                                      | 客户端行为                                      |
| ---------------------- | ----------------------------------------- | ----------------------------------------------- |
| `ready`                | `onlineUserIds`                           | 初始化联系人在线状态                            |
| `presence-changed`     | `userId`、`online`                        | 更新单个联系人状态                              |
| `conversation-changed` | `conversationId`、`createdAt`             | 更新会话列表和排序                              |
| `message-created`      | `conversationId`、`senderId`、`createdAt` | 当前会话按 `after` 增量读取，其他会话刷新未读数 |
| `conversation-deleted` | `conversationId`、`deletedAt`             | 移除会话及当前消息视图                          |

## 管理端聊天监控

以下接口均要求管理员身份。接口只返回聚合指标和密文元数据，**不会解密、返回或搜索聊天正文**；用于观察会话活跃度、消息吞吐和密文存储量。

| 方法  | 路径                            | 返回内容                                 |
| ----- | ------------------------------- | ---------------------------------------- |
| `GET` | `/api/admin/chat/overview`      | 会话、群组、单聊、总消息与当日消息数量   |
| `GET` | `/api/admin/chat/conversations` | 会话成员数、消息数、密文字节数、活跃时间 |
| `GET` | `/api/admin/chat/messages`      | 最近消息 ID、会话 ID、发送者 ID、字节数  |

例如，会话监控记录如下：

```json
{
  "id": "conversation-uuid",
  "title": "项目讨论",
  "memberCount": 4,
  "messageCount": 238,
  "ciphertextBytes": 82491,
  "lastMessageAt": "2026-08-03T10:12:00+08:00"
}
```

管理员可以借此定位异常增长的会话或用户存储占用；如需审计消息内容，应另行设计具有明确授权、留痕和合规流程的能力，不能通过此接口绕过端到端的访问控制。
