# ForgeDesk

一个面向研发工作流的桌面插件平台原型，当前形态是 `Tauri + React` 桌面壳配合 `Spring Boot` 本地后端。

## 技术选型

- 桌面端：Tauri 2 + React 19 + Vite 8 + TypeScript
- 后端：Spring Boot 3.4 + Java 21 + Maven
- 样式：原生 CSS 变量，先保持轻量，方便后续迁移到组件库

Tauri 的桌面打包支持 Windows 和 macOS；Tauri 2 同时提供 Android/iOS 能力，后续可以面向 Xiaomi Pad 做 Android 平板适配。

## 目录结构

```text
forgedesk
├── apps
│   ├── backend      # Spring Boot 后端
│   └── desktop      # Tauri + React 平台壳
├── docs             # 架构、运行、部署文档
├── scripts          # 本地开发脚本
└── package.json     # 前端工作区和常用命令
```

## 环境要求

- Node.js 20+
- Java 21+
- Maven 3.9+
- Rust + Cargo（运行 Tauri 桌面窗口时需要）

当前前端也可以不启动 Tauri，直接用 Vite 在浏览器预览欢迎界面。

## 快速开始

```bash
cd forgedesk
npm install
npm run start
```

默认会一键启动后端，等待 `/api/health` 正常后再启动前端。只启动前端：

```bash
npm run start:web
```

前端前台开发时，也可以按需同步拉起后端：

```bash
npm run dev:web -- --with-backend
```

如需保存个人偏好，将 [forgedesk-dev.example.env](./scripts/forgedesk-dev.example.env) 复制为 `~/.forgedesk/dev.env`，设置 `FORGEDESK_START_BACKEND=0` 或 `1`。此配置、运行 PID 和日志均保存在 `~/.forgedesk`，不会写入 Git。

停止服务：

```bash
npm run stop
```

启动 Tauri 桌面端：

```bash
cd forgedesk
npm run dev:desktop
```

## 可用命令

- `npm run start`：后台一键启动前端和后端
- `npm run start:full`：强制一键启动前端和后端，并等待两端就绪
- `npm run start:web`：只在后台启动前端
- `npm run start:backend`：只启动并等待后端健康检查
- `npm run stop`：停止后台运行的前端和后端
- `npm run dev`：调用启动脚本
- `npm run dev:web`：前台启动浏览器预览；可附加 `-- --with-backend`
- `npm run dev:web:full`：前台启动前端，同时拉起后端
- `npm run dev:desktop`：启动 Tauri 桌面应用（会先检查 Rust 环境）
- `npm run build:web`：构建前端资源
- `npm run backend:dev`：启动 Java 后端
- `npm run check`：前端类型检查 + 后端测试

## 后端接口

- `GET /api/health`：健康检查
- `GET /api/welcome`：欢迎页数据
- `POST /api/work-notes/sync`：工作笔记归档合并

## 运行模式与笔记同步

- 默认使用“本地”运行模式，不会探测或连接后端。运行模式保存在应用数据目录，不写入仓库。
- 切换到“服务”模式时会先请求健康检查；连接失败会保留本地模式。
- 工作笔记始终先保存到本机应用数据目录。服务模式下才会自动合并笔记，也可以手动触发同步。
- 合并按单条笔记的 `updatedAt` 处理；删除会保留墓碑记录，防止旧设备在下一次同步时恢复已删除笔记。
- 同步请求失败不会覆盖或删除本地内容。服务端归档默认写入用户目录的 `.forgedesk/work-notes-remote.json`，不进入 Git。

## 文档导航

- [架构说明](./docs/architecture.md)
- [启动与部署](./docs/run-and-deploy.md)
- [仓库规则](./AGENTS.md)
