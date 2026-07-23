# 加密聊天接口说明

## 通用约定

- 基础地址：`http://127.0.0.1:8088`
- 除登录、注册和健康检查外，REST 接口需要 `Authorization: Bearer <token>`。
- `@RequireLogin` 由登录切面统一处理；Controller 不自行解析令牌。
- 所有 REST 成功与失败响应均由统一结构包装：

```json
{
  "code": "OK",
  "message": "",
  "data": {},
  "traceId": "6e6a0c1f..."
}
```

失败响应的 `data` 为 `null`。排障时请保留 `traceId`。聊天领域业务校验错误的 `code` 为 `CHAT_ERROR`；登录失效、无权访问等错误由认证层返回对应错误码。

## 数据结构

### 会话

```json
{
  "id": "uuid",
  "title": "项目讨论",
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
  "ciphertext": "base64 AES-GCM 密文",
  "nonce": "base64 随机数",
  "keyVersion": 1,
  "keyEnvelopes": { "device-uuid": "base64 RSA-OAEP 信封" },
  "createdAt": "2026-07-23T17:06:02.594326+08:00"
}
```

消息正文不应提交给服务端。对于一对一会话，`keyEnvelopes` 覆盖每台成员设备；对于已初始化群会话密钥的群聊，普通消息的 `keyEnvelopes` 为空，只携带对应 `keyVersion`。

### 群会话密钥

```json
{
  "conversationId": "group-conversation-uuid",
  "keyVersion": 1,
  "keyEnvelopes": { "device-uuid": "base64 RSA-OAEP 信封" },
  "updatedAt": "2026-07-23T17:06:02.594326+08:00"
}
```

群会话密钥是随机 AES-GCM 密钥，只以 RSA-OAEP 信封形式保存在服务端。服务端不保存该密钥明文。首次建群密钥或成员设备变化时才分发信封，后续群消息不会重复携带这些信封。

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

单次最多返回 100 条密文。首次读取返回最新一页；`after` 用于实时增量同步，`before` 用于向更早历史翻页。两个游标不能同时传入。

## REST 接口

| 方法     | 路径                                                                                 | 说明                                       |
| -------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| `POST`   | `/api/chat/socket-ticket`                                                            | 签发一分钟、单次使用的 WebSocket 连接凭证  |
| `GET`    | `/api/chat/users`                                                                    | 获取其他已注册用户及在线状态               |
| `PUT`    | `/api/chat/devices/{deviceId}`                                                       | 登记或更新当前用户设备公钥                 |
| `GET`    | `/api/chat/users/{userId}/devices`                                                   | 查询指定用户的设备公钥                     |
| `GET`    | `/api/chat/conversations`                                                            | 获取当前用户参与的会话，按更新时间倒序     |
| `POST`   | `/api/chat/conversations/unread-counts`                                              | 按本地查看游标批量统计未读消息数量         |
| `POST`   | `/api/chat/conversations`                                                            | 创建一对一或群聊会话                       |
| `DELETE` | `/api/chat/conversations/{conversationId}`                                           | 创建者永久删除共享会话及密文               |
| `GET`    | `/api/chat/conversations/{conversationId}/group-key`                                 | 读取当前设备可解开的群会话密钥信封         |
| `PUT`    | `/api/chat/conversations/{conversationId}/group-key`                                 | 首次初始化群会话密钥                       |
| `PUT`    | `/api/chat/conversations/{conversationId}/group-key/envelopes/{deviceId}`            | 为新增设备补充群会话密钥信封               |
| `GET`    | `/api/chat/conversations/{conversationId}/messages`                                  | 分页获取会话密文；可选 `after` 或 `before` |
| `POST`   | `/api/chat/conversations/{conversationId}/messages`                                  | 发送加密消息                               |
| `PUT`    | `/api/chat/conversations/{conversationId}/messages/{messageId}/envelopes/{deviceId}` | 为新设备补充历史消息密钥信封               |

### 创建会话

```http
POST /api/chat/conversations
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "项目讨论",
  "participantIds": ["member-user-uuid"]
}
```

服务端自动将当前用户加入成员列表；成员数为 2 至 100 人。所有成员必须是已注册用户。

### 统计未读数量

```http
POST /api/chat/conversations/unread-counts
Authorization: Bearer <token>
Content-Type: application/json

{
  "cursors": {
    "conversation-uuid": "2026-07-23T17:05:02.594326+08:00"
  }
}
```

查看游标仅由客户端保存在本地。服务端只返回当前用户收到、且晚于游标的消息数量，例如 `{ "conversation-uuid": 3 }`，不保存阅读状态，也不返回消息正文。

### 删除会话

```http
DELETE /api/chat/conversations/{conversationId}
Authorization: Bearer <token>
```

只能由会话创建者调用。成功后返回被删除的会话元数据，服务端会删除对应消息密文文件，并对所有成员推送 `conversation-deleted`。这不是软删除，不能恢复。

### 发送加密消息

```http
POST /api/chat/conversations/{conversationId}/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "ciphertext": "...",
  "nonce": "...",
  "keyVersion": 1,
  "keyEnvelopes": {
    "sender-device-id": "...",
    "recipient-device-id": "..."
  }
}
```

服务端只检查请求者是成员、密文字段有效且信封覆盖所有已登记成员设备。单条密文上限为 1 MB。

群聊在成功初始化群会话密钥后，普通消息使用以下负载：

```json
{
  "ciphertext": "...",
  "nonce": "...",
  "keyVersion": 1,
  "keyEnvelopes": {}
}
```

服务端会校验 `keyVersion` 与该群会话密钥一致，并验证其信封已覆盖所有当前成员设备。缺少新增设备信封时会拒绝发送，客户端应先调用群会话密钥信封接口补齐。

### 读取消息分页

```http
GET /api/chat/conversations/{conversationId}/messages?after=2026-07-23T17%3A06%3A02%2B08%3A00
Authorization: Bearer <token>
```

- 不传游标：返回最新 100 条，`hasMoreBefore` 表示是否还有更早消息。
- 传 `after`：返回该时间之后最多 100 条，`hasMoreAfter` 为 `true` 时继续使用响应的 `nextAfter` 拉取。
- 传 `before`：返回该时间之前最近的 100 条，`hasMoreBefore` 为 `true` 时继续使用响应的 `previousBefore` 向前翻页。
- 正常实时聊天只使用 `after`，不会因为每条新消息重复下载历史。

### 补充设备密钥信封

```http
PUT /api/chat/conversations/{conversationId}/messages/{messageId}/envelopes/{deviceId}
Authorization: Bearer <token>
Content-Type: application/json

{ "keyEnvelope": "..." }
```

当前用户必须是会话成员，目标设备必须属于该会话成员。已有信封时接口幂等返回原消息。

### 初始化或补充群会话密钥信封

```http
PUT /api/chat/conversations/{conversationId}/group-key
Authorization: Bearer <token>
Content-Type: application/json

{
  "keyVersion": 1,
  "keyEnvelopes": { "device-id-a": "...", "device-id-b": "..." }
}
```

初始化请求必须一次覆盖所有当前成员设备；如果群密钥已存在，接口幂等返回既有值。新增设备时，由仍可解开群密钥的成员设备调用：

```http
PUT /api/chat/conversations/{conversationId}/group-key/envelopes/{deviceId}
Authorization: Bearer <token>
Content-Type: application/json

{ "keyEnvelope": "..." }
```

该接口仅接受属于当前会话成员的设备，已有信封时保持幂等。

## WebSocket

连接步骤：

1. 调用 `POST /api/chat/socket-ticket` 获取 Ticket。
2. 在 1 分钟内连接 `ws://127.0.0.1:8088/ws/chat?ticket=<ticket>`。
3. Ticket 仅可使用一次；不可把长期登录 Token 放在 URL 上。

服务端事件：

| 类型                   | 字段                                      | 客户端行为                                          |
| ---------------------- | ----------------------------------------- | --------------------------------------------------- |
| `ready`                | `onlineUserIds`                           | 初始化在线联系人状态                                |
| `presence-changed`     | `userId`、`online`                        | 更新单个用户在线状态                                |
| `conversation-changed` | `conversationId`、`createdAt`             | 已知会话仅更新本地排序；当前会话按 `after` 增量拉取 |
| `conversation-deleted` | `conversationId`、`deletedAt`             | 从列表和当前视图移除会话                            |
| `message-created`      | `conversationId`、`senderId`、`createdAt` | 更新会话排序，并为非发送者增量增加未读数量          |
| `device-changed`       | `userId`                                  | 仅通知受影响会话成员；失效该用户的设备公钥缓存      |
| `signal`               | `fromUserId`、`payload`                   | 为未来点对点协商预留，当前消息同步未使用            |
