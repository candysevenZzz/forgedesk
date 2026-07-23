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
2. 确认 `8088` 和 `1420` 端口未被占用。
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

- 后端：`http://127.0.0.1:8088`
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

ForgeDesk 当前以本地桌面使用为主，不是面向传统服务端部署的系统。

### 当前推荐形态

- 用 Vite 构建前端资源。
- 用 Tauri 打包桌面壳。
- 后端保持为本地伴随服务，由桌面应用或本地脚本拉起。

### 近期推荐的交付方式

- 开发阶段：`npm run start`
- 内部预览：分发打包后的 Tauri 应用加本地后端运行时
- 后续产品化：把本地后端启动管理逐步收进桌面壳生命周期

## 常见问题

### `Port 8088 is already in use`

- 先执行 `npm run stop`
- 或者直接查看冲突进程：

```bash
lsof -nP -iTCP:8088 -sTCP:LISTEN
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
