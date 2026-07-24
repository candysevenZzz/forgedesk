# 服务器发布脚本说明

这个目录只放“将 ForgeDesk 发布到服务器”需要的文件。日常不需要逐个执行脚本，只使用项目根目录的两条命令：

```bash
# 只在本机生成发布包，不连接服务器。
npm run build:server

# 本机构建、上传服务器、切换版本并等待健康检查。
npm run deploy:server
```

## 文件职责

| 文件                 | 在哪里执行  | 作用                                                 | 是否需要手动执行                 |
| -------------------- | ----------- | ---------------------------------------------------- | -------------------------------- |
| `deploy.env.example` | 开发机      | 部署配置模板，复制后填写服务器和私钥信息             | 只在首次配置时复制和编辑         |
| `build-artifact.sh`  | 开发机      | 构建前端与后端，生成单个 `.tar.gz` 发布包            | 通常通过 `npm run build:server`  |
| `deploy-server.sh`   | 开发机      | 调用打包脚本、上传压缩包，并通过 SSH 触发服务器切换  | 通常通过 `npm run deploy:server` |
| `apply-release.sh`   | 服务器 root | 备份旧版、替换前端/JAR、重启后端、健康检查失败则回滚 | 不要手动执行                     |

## 首次配置

```bash
mkdir -p .forgedesk
cp scripts/deploy/deploy.env.example .forgedesk/deploy.env
```

打开 `.forgedesk/deploy.env`，只需要填写这三项：

```bash
FORGEDESK_DEPLOY_HOST=<服务器公网IP>
FORGEDESK_DEPLOY_USER=ubuntu
FORGEDESK_DEPLOY_SSH_KEY=/绝对路径/你的服务器私钥.pem
```

其余路径已经是当前 1Panel OpenResty 与 `java21` 容器的默认配置，不要无理由修改。`.forgedesk/` 已被 Git 忽略，不能将私钥、数据库密码或服务器口令写入源码文件。

## 一次发布会做什么

1. 开发机构建 React 前端到 `apps/desktop/dist/`。
2. 开发机构建 Spring Boot JAR。
3. 两者被打包到 `.forgedesk/releases/forgedesk-<时间>.tar.gz`。
4. 压缩包通过 SSH 上传到服务器普通用户目录。
5. 服务器先备份现有前端与 JAR，再切换新文件。
6. 服务器重启 `java21` 容器，并轮询 `http://127.0.0.1:8080/actuator/health`。
7. 健康检查成功则完成；失败则恢复备份并重启旧后端。

重启期间公网可能短暂出现 `502`，健康检查通过后会恢复。若脚本返回失败，先看终端末尾信息；服务器备份默认在 `/opt/forgedesk/deploy-backups/`。
