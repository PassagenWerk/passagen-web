# MCP Companion 与 Agent 集成

[Passagen MCP Server](https://github.com/PassagenWerk/passagen-mcp-server) 将 Web/CLI 维护的
论文库以默认只读的 MCP tools 和 resources 提供给 LibreChat、桌面 MCP Host 和自定义 Agent；
可信部署可显式启用受限的组织写入。

```text
Passagen Web / CLI  -- read and write ------> data directory
Passagen MCP Server -- read; optional write -> data directory
Agent / LibreChat   -- MCP -----------------> Passagen MCP Server
```

Web 适合人工导入、处理、阅读和组织论文；MCP Server 适合 Agent discovery、context retrieval、
带页码的 evidence search 和读取已有 collection synthesis/report。MCP 可以嵌入同时使用网页
搜索、代码执行、任务规划和写作工具的复杂工作流。启用写模式后可维护 collection、tag、
paper-tag 和 Markdown document，但不会导入/删除论文、启动 processing 或调用 LLM 生成 artifact。

## 为什么使用独立服务

Passagen Web 镜像不内置 MCP Server，也不在 Web API 进程中监听 MCP endpoint。独立部署可以：

- 默认让 Web 保持唯一 writer；需要 Agent 整理资料时，再单独授予 MCP 受限写能力。
- 分别控制 Web browser origin 与 MCP Bearer token/Host allowlist。
- 仅把 MCP 连接到 Agent 所在的私有网络，不额外暴露 Web 管理接口。
- 独立升级或停用 Agent integration，不影响 Web 阅读和处理任务。
- 避免所有 Web 用户承担 MCP SDK、额外端口和第二个长期运行进程。

MCP Server 与 Web 必须使用兼容的 Passagen Core minor 版本。执行 schema migration、恢复备份
或离线完整性维护前，应同时停止 Web 和 MCP。只读 MCP 可与 Web 并发；写模式应只授予可信
client，并与 Web 一样遵循 SQLite 单库写入约束。

## Docker Data Directory

Web Compose 默认将 `${PASSAGEN_DATA_DIR:-passagen-data}` 挂载到 `/data`。启动 MCP companion
时挂载同一个 volume 或宿主机目录：

```yaml
services:
  passagen-mcp:
    image: ${PASSAGEN_MCP_IMAGE:-docker.io/sycstudio/passagen-mcp-server:0.3.0}
    restart: unless-stopped
    user: "${PUID:-1000}:${PGID:-1000}"
    environment:
      PASSAGEN_MCP_TOKEN: ${PASSAGEN_MCP_TOKEN:?Set PASSAGEN_MCP_TOKEN}
    command:
      - passagen-mcp
      - serve
      - --data-dir
      - /data
      - --host
      - 0.0.0.0
      - --port
      - "8766"
      - --allow-host
      - passagen-mcp
    volumes:
      - ${PASSAGEN_DATA_DIR:-passagen-data}:/data:ro
    expose:
      - "8766"

volumes:
  passagen-data:
```

将该服务与 LibreChat 放入同一个私有 Docker network 后，LibreChat 使用：

```text
http://passagen-mcp:8766/mcp
```

如果 SQLite 在特定 Docker/storage driver 上需要创建 shared-memory 或 journal 文件，`:ro`
mount 可能无法打开数据库。确认 MCP 版本和配置不会执行迁移或写任务后，可改为普通共享挂载；
MCP 对外提供的 tools/resources 仍然是只读的。

需要组织写入时，在 command 末尾加入 `--allow-write`，并将 volume 改为读写挂载。HTTP 写模式
始终要求 Bearer token；不要为不可信 Agent 开启。写模式也不提供论文导入、删除或 generation。

完整 Bearer token、LibreChat `allowedAddresses`、TLS 和 Host/Origin 配置见 MCP Server 仓库的
[LibreChat 部署指南](https://github.com/PassagenWerk/passagen-mcp-server/blob/main/docs/librechat.md)。

## 源码 Data Directory

源码启动 Web 时，可以让 MCP Server 指向同一个绝对路径：

```bash
passagen-mcp serve \
  --data-dir /absolute/path/to/library \
  --host 127.0.0.1 \
  --port 8766
```

Web 写入的新论文和 artifact 会由后续 MCP 请求读取，不需要复制数据库。修改
`passagen.yaml`、环境变量或升级组件后，分别重启 Web 和 MCP Server。
