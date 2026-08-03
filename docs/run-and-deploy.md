# ForgeDesk 启动与部署

## 本地开发

### 环境要求

- `Node.js 20+`
- `npm 10+`
- `Java 21`
- `Maven 3.9+`
- `lsof`

可选：

- 如果要运行原生 Tauri 桌面壳，需要安装 `Rust + Cargo`。

## 常用命令

### 安装依赖

```bash
npm install
```

### 后台启动前后端

```bash
npm run start
```

### 停止前后端

```bash
npm run stop
```

### 仅启动浏览器版前端

```bash
npm run dev:web
```

### 仅启动后端

```bash
npm run backend:dev
```

### 启动 Tauri 桌面端

```bash
npm run dev:desktop
```

这条命令会先检查本机是否安装了 `cargo` 和 `rustc`，缺失时会直接给出安装提示。

### 校验

```bash
npm run check
```

## 本地运行文件

后台启动后会写入以下运行时文件：

```text
.forgedesk/runtime/
├── backend.pid
├── web.pid
├── backend.log
└── web.log
```

排查服务是否已经启动、日志写到哪里时，优先看这个目录。

## 启动与停止流程

### `scripts/start.sh`

启动脚本会做这些事：

1. 检查必要命令是否存在。
2. 确认 `8080` 和 `1420` 端口未被占用。
3. 创建 `.forgedesk/runtime/` 目录。
4. 后台启动 Spring Boot 后端。
5. 后台启动 Vite 前端。
6. 写入 PID 文件和日志文件。

### `scripts/stop.sh`

停止脚本会做这些事：

1. 从 `.forgedesk/runtime/` 读取 PID 文件。
2. 优先尝试优雅关闭。
3. 如果进程未退出，则执行强制结束。
4. 清理陈旧 PID 文件。

## 默认端口

- 后端：`http://127.0.0.1:8080`
- 前端：`http://127.0.0.1:1420`

如果任一端口已被占用，`scripts/start.sh` 会直接拒绝启动。

## 构建产物

### 前端 Web 构建

```bash
npm run build:web
```

输出目录：

- `apps/desktop/dist`

### 后端测试

```bash
npm run backend:test
```

### 原生桌面端打包

```bash
npm --workspace apps/desktop run tauri:build
```

这一步要求本机已经安装 Rust 和 Tauri 所需的平台依赖。

## 部署说明

ForgeDesk 同时支持本地桌面使用和单服务器部署。当前服务器发布脚本面向 1Panel OpenResty + `java21` 容器环境；前端、后端、MySQL 和 Redis 可以分开运行。

### 本地推荐形态

- 用 Vite 构建前端资源。
- 用 Tauri 打包桌面壳。
- 后端保持为本地伴随服务，由桌面应用或本地脚本拉起。

### 本地交付方式

- 开发阶段：`npm run start`
- 内部预览：分发打包后的 Tauri 应用加本地后端运行时
- 后续产品化：把本地后端启动管理逐步收进桌面壳生命周期

### OpenResty 公网 IP 部署

没有域名时，使用同一个公网 IP 承载前端、REST 接口和聊天 WebSocket。浏览器通过
OpenResty 访问同源路径，后端端口不直接暴露到公网。

> 没有域名通常无法申请浏览器信任的 HTTPS 证书，因此此方案使用 HTTP 和 `ws://`。如果
> 要在公网长期使用登录、聊天或翻译配置，应该优先配置域名和 HTTPS。

#### 1. 一键构建和发布

项目提供了用于当前 1Panel OpenResty + Java 运行时的一键发布脚本。脚本分为本机打包、SSH 上传、服务器切换三部分；日常只需要执行 `npm run deploy:server`。首次在本机创建一个 Git 忽略的部署配置：

```bash
mkdir -p .forgedesk
cp scripts/deploy/deploy.env.example .forgedesk/deploy.env
```

编辑 `.forgedesk/deploy.env`，填写服务器地址、SSH 用户和密钥路径。当前服务器使用默认的
OpenResty 静态目录、`/www/forgedesk-backend.jar` 与 `java21` 容器，无需额外修改目录配置。
每个脚本的执行位置、职责、首次配置和完整发布过程见
[`scripts/deploy/README.md`](../scripts/deploy/README.md)。

以后每次发布只需执行：

```bash
npm run deploy:server
```

该命令会构建前端与后端、创建 `.forgedesk/releases/` 下的版本化压缩包、上传到服务器，并由
服务器端脚本原子切换静态文件和 JAR，重启 Java 容器后等待健康检查。健康检查失败会自动恢复上一版前端和 JAR。

只构建构建物而不上传时：

```bash
npm run build:server
```

#### 2. 一键发布前的服务器前提

- OpenResty 静态根目录：`/opt/1panel/apps/openresty/openresty/root/forgedesk`
- Java 容器名：`java21`，并将宿主机 `/www/forgedesk-backend.jar` 挂载到容器内
- 后端监听宿主机回环地址：`127.0.0.1:8080`
- OpenResty 将 `/api/` 和 `/ws/` 反向代理至 `127.0.0.1:8080`
- MySQL、Redis 已启动，且后端环境变量中的连接信息有效
- SSH 登录用户可以无交互执行发布所需的 `sudo` 命令

发布脚本会将旧前端与旧 JAR 备份到服务器 `/opt/forgedesk/deploy-backups/`。后端容器重启期间公网可能短暂返回 `502`；脚本只会在本机健康检查通过后报告发布成功。

#### 3. 手动构建并上传产物

```bash
npm ci
npm run build:web
mvn -f apps/backend/pom.xml clean package -DskipTests
```

- 将 `apps/desktop/dist/` 上传到 OpenResty 静态目录，例如 `/opt/1panel/apps/openresty/openresty/root/forgedesk/`。
- 将后端 JAR 上传为 `/www/forgedesk-backend.jar`，再重启 `java21` 容器。

#### 4. 启动后端

后端只监听回环地址，由 OpenResty 转发。将 `<公网IP>` 和管理员初始化口令替换为实际值：

```bash
export FORGEDESK_BIND_ADDRESS=127.0.0.1
export FORGEDESK_ALLOWED_ORIGINS=http://<公网IP>
export FORGEDESK_ADMIN_BOOTSTRAP_TOKEN=<高强度随机口令>
export FORGEDESK_DB_URL='jdbc:mysql://127.0.0.1:3306/forgedesk?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai'
export FORGEDESK_DB_USERNAME=forgedesk
export FORGEDESK_DB_PASSWORD=<数据库应用账号口令>
export FORGEDESK_CHAT_STORAGE_KEY=<使用密码管理器生成的高熵随机值>
export FORGEDESK_REDIS_HOST=127.0.0.1
export FORGEDESK_REDIS_PORT=6379
export FORGEDESK_REDIS_PASSWORD=<Redis口令>
java -jar /opt/forgedesk/forgedesk-backend.jar
```

`FORGEDESK_ALLOWED_ORIGINS` 支持逗号分隔多个来源，例如
`http://203.0.113.10,http://192.168.1.20:8080`。它同时控制 REST CORS 和聊天 WebSocket
来源校验。

账号、聊天存储密文、头像、笔记和翻译配置存放在 MySQL；登录会话和一次性 WebSocket 票据存放在 Redis，并由 TTL 自动过期。
Flyway 会在首次启动时创建和版本化 `forgedesk` 数据库结构。请备份 MySQL 数据库与 Redis 持久化文件，环境变量中的密码只保存在服务器受限权限的 `.env` 文件中，不要提交到 Git。

`FORGEDESK_CHAT_STORAGE_KEY` 是聊天内容的存储加密根材料，必须独立于数据库口令并保持稳定。生成并保存后不要随意替换，否则既有聊天密文无法读取；本地开发未配置时才会使用回退值，生产环境禁止依赖该回退。

生产环境应为 ForgeDesk 创建独立的 MySQL 账号，仅授予 `forgedesk.*` 所需权限。后端与 MySQL、Redis 位于同一 Docker 网络时，分别使用服务名 `mysql`、`redis`；不要将 `3306`、`6379` 直接暴露到公网。

#### 5. OpenResty 站点配置

将 `<公网IP>` 替换为服务器 IP，并确认静态目录与后端端口一致：

```nginx
server {
    listen 80;
    server_name <公网IP>;
    root /opt/1panel/apps/openresty/openresty/root/forgedesk;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
}
```

前端生产构建在未设置 `VITE_API_BASE_URL` 时，自动使用浏览器当前来源，因此上述同源代理不需要把
公网 IP 写进前端产物。若前后端拆分到不同地址，则在构建前设置
`VITE_API_BASE_URL=http://<后端IP或域名>`。

后端环境变量应配置在 `java21` 容器的启动配置或容器可读取的受限权限 `.env` 文件中。修改配置后重启容器；不要在宿主机临时导出变量后误以为容器会自动继承。

## 常见问题

### `Port 8080 is already in use`

- 先执行 `npm run stop`
- 或者直接查看冲突进程：

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

### `Port 1420 is already in use`

```bash
lsof -nP -iTCP:1420 -sTCP:LISTEN
```

### 日志看起来是空的

- 检查 `.forgedesk/runtime/backend.log`
- 检查 `.forgedesk/runtime/web.log`
- 如果服务是从别的终端手动启动的，这里的日志不会反映那次启动

### Tauri 无法启动

- 确认已经安装 `rustc` 和 `cargo`
- 确认已经安装 Tauri 所需的平台依赖
- 先退回浏览器模式：`npm run dev:web`
- 当前项目已经为 `npm run dev:desktop` 增加了 Rust 环境前置检查
