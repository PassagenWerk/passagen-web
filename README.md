# Passagen Web

Passagen Web 是 Passagen 论文库的本地浏览器界面。它与 CLI 使用同一个 data directory 和
配置文件，可以导入和处理 PDF、搜索论文、阅读 cleaned Abstract、Summary、Outline 与原始
PDF，并管理标签、集合和论文元数据。

README 中的仓库链接指向 GitHub；在 GitLab 或 Gitea 镜像中，对应仓库位于同一 PassagenWerk 组的同名路径下。

## 功能

- 浏览、搜索、筛选和排序本地论文库。
- 经二次确认安全删除论文及其受管 PDF、生成 artifact 和库内关系。
- 上传 PDF，启动、查看和恢复 processing run。
- 对 Metadata、Abstract clean、Summary 和 Outline 执行定向 reprocess。
- 并排阅读 Summary、Outline 和 PDF evidence page。
- 在阅读页获取、持久化、刷新并复制 BibTeX；优先使用 DOI metadata，远端失败时自动使用本地元数据。
- 编辑受保护的用户元数据，管理标签和有序集合。
- 对单篇论文或整个 collection 进行持久化对话问答，回答带可验证 citation 并导航到对应
  论文/PDF 页。
- Collection Research Desk：跨论文 synthesis、可持久化的 Research Documents、collection Ask、
  可折叠 paper rail，以及适合长内容的全宽 reading/focus mode。
- 通过独立的 [Passagen MCP Server](https://github.com/PassagenWerk/passagen-mcp-server) 将同一
  论文库以只读 tools/resources 提供给 LibreChat、Claude Desktop、Cursor、VS Code/Copilot、
  自定义 research agent 和其他兼容 MCP 的 Agent Host。
- 在桌面和移动浏览器中使用 Light/Dark Mode。

## Quick Start

### Docker（推荐）

需要 Docker Engine、Docker Compose 和至少 4 GB 可用内存。Compose 会拉取 Passagen Web，
同时启动 GROBID；Web 镜像已经包含 Passagen CLI。

```bash
mkdir passagen
cd passagen
curl -fsSLO https://raw.githubusercontent.com/PassagenWerk/passagen-web/main/docker-compose.yaml
curl -fsSL https://raw.githubusercontent.com/PassagenWerk/passagen-web/main/.env.example -o .env
# 在 .env 中填写 PASSAGEN_API_KEY以及进行其它配置（见下面 configuration 章节）
docker compose pull
docker compose up -d
```

浏览器打开 <http://127.0.0.1:8765>。默认 `passagen-data` volume 会自动创建，首次启动自动
初始化数据库，后续启动直接使用并按需迁移原有数据库。挂载已有论文库、使用容器内 CLI、
局域网访问、更新和回滚见 [Docker 部署](docs/user/docker.md)。

### 从源码启动

需要 Python 3.12、[uv](https://docs.astral.sh/uv/)、Node.js `>=24 <25` 和 npm `>=11 <12`。
源码 checkout 使用相邻的 Core；CLI 用于初始化和维护同一个论文库。以下 URL 可替换为 GitLab
或 Gitea 上同组的镜像地址。

```bash
git clone https://github.com/PassagenWerk/passagen-core.git
git clone https://github.com/PassagenWerk/passagen-cli.git
git clone https://github.com/PassagenWerk/passagen-web.git

cd passagen-cli
uv sync --frozen
uv run passagen --data-dir ./data db init

cd ../passagen-web
uv sync --frozen
npm ci --prefix frontend
npm --prefix frontend run build
export PASSAGEN_API_KEY=your-deepseek-api-key
uv run passagen-web serve --data-dir ../passagen-cli/data
```

默认监听 `127.0.0.1:8765` 并打开浏览器。GROBID 需要单独运行；也可以在共享配置中将 parser
设为 `pymupdf`。贡献代码、运行检查和构建产物见[开发构建指南](docs/development/building.md)。

## Agent 与 MCP

[Passagen MCP Server](https://github.com/PassagenWerk/passagen-mcp-server) 是 Web 的只读
companion service。Web 负责导入、处理、整理和生成研究内容；MCP Server 读取同一个 data
directory，让兼容 MCP 的 Agent Host 能发现论文和 collection、检索带页码的全文 evidence，
并读取已有 synthesis/report。它可以与网页搜索、代码执行、写作和任务规划等其他 Agent
tools 组合，但不会通过 MCP 修改论文库或触发 LLM generation。

MCP Server 不打包进 Web 运行镜像，也不由 Web API 进程托管。推荐独立容器或进程部署，以便
分别控制只读 volume、Bearer 认证、网络暴露和版本升级。Docker/源码连接方式、并发读取和
维护注意事项见 [MCP companion 部署](docs/user/mcp.md)。

## Configuration

### 共通配置

Docker 和源码运行都读取 data directory 中的 `passagen.yaml`，并使用同一套 Core 配置格式。
没有该文件时使用默认值。默认 LLM 是 DeepSeek `deepseek-flash-v4`，API key 从配置中
`providers.llm.default.api_key_env` 指定的环境变量读取，默认变量名是 `PASSAGEN_API_KEY`；
不要将 key 写入 YAML。

完整 DeepSeek、OpenAI-compatible provider、GROBID、Crossref、arXiv、pipeline 和 task route
配置见 Passagen Core 仓库的
[configuration.md](https://github.com/PassagenWerk/passagen-core/blob/main/docs/user/configuration.md)。

无论采用哪种运行方式：

- 同一个 data directory 同时只能由一个 Passagen Web 实例持有。
- 修改 `passagen.yaml` 或 API key 后需要重启 Web。
- 额外允许的 browser origin 必须是地址栏中的完整 protocol、host 和 port，不能填写客户端 IP。

### Docker 配置

Compose 从 `.env` 读取部署参数：

| 变量 | 说明 |
|---|---|
| `PASSAGEN_API_KEY` | 默认 LLM provider 使用的 secret，必填。 |
| `PASSAGEN_IMAGE` | Web 镜像版本；生产部署建议固定版本标签。 |
| `GROBID_IMAGE` | GROBID 镜像版本。 |
| `PASSAGEN_DATA_DIR` | 默认 `passagen-data` named volume，也可设为已有论文库的绝对路径。 |
| `PASSAGEN_BIND` | 宿主机监听地址；默认 `127.0.0.1`。 |
| `PASSAGEN_ALLOWED_ORIGIN` | 浏览器访问服务时使用的完整 origin。 |
| `PUID` / `PGID` | Web 读写 bind-mounted data directory 时使用的 UID/GID。 |

Compose 自动将 GROBID URL 覆盖为 `http://grobid:8070`，无需修改 `passagen.yaml`。局域网示例：

```dotenv
PASSAGEN_BIND=0.0.0.0
PASSAGEN_ALLOWED_ORIGIN=http://192.168.1.110:8765
PASSAGEN_DATA_DIR=/absolute/path/to/library
```

### 源码运行配置

源码运行时在启动 Web 的 shell 中导出 API key，并通过命令行选择 data directory 和网络参数：

```bash
export PASSAGEN_API_KEY=your-deepseek-api-key
uv run passagen-web serve \
  --data-dir /path/to/library \
  --host 192.168.1.110 \
  --port 8765 \
  --no-open \
  --allow-origin http://192.168.1.110:8765
```

| 参数 | 说明 |
|---|---|
| `--data-dir PATH` | 必填，包含数据库和 managed artifacts 的目录。 |
| `--config PATH` | 显式配置文件；默认使用 `<data-dir>/passagen.yaml`。 |
| `--host ADDRESS` | 监听地址；默认 `127.0.0.1`。 |
| `--port PORT` | 监听端口；默认 `8765`。 |
| `--no-open` | 启动后不自动打开本机浏览器。 |
| `--allow-origin URL` | 允许额外 browser origin 执行写请求；可重复指定。 |

## 故障排查

### 页面显示 Library unavailable

确认服务仍在运行、浏览器访问的 host/port 正确，并检查服务终端中的启动错误。

### 写请求返回 403

浏览器 origin 未被允许。将地址栏中的 origin 原样传给 `--allow-origin`，然后重启服务。

### 请求返回 422

前端和后端版本可能不一致。重新构建前端并重启 FastAPI 服务，使两端加载同一 checkout。

### Processing unavailable 或 LLM 请求失败

确认 `PASSAGEN_API_KEY` 在启动服务的同一个 shell 中存在，并检查共享配置中的 DeepSeek URL、
模型名称和网络连接。

### GROBID 不可用

启动 GROBID，或在共享配置中设置 `pipeline.parsing.parser: pymupdf`。

### 数据库被锁定

停止使用同一 data directory 的其他 Web 进程。不要通过删除 lock file 绕过仍在运行的进程。

更多备份、升级和恢复步骤见[Web 运行指南](docs/user/operations.md)。

## 文档

- [Docker 部署](docs/user/docker.md)
- [MCP companion 与 Agent 集成](docs/user/mcp.md)
- [Web 运行、备份与恢复](docs/user/operations.md)
- [开发与构建](docs/development/building.md)
- [Web 架构](docs/development/architecture.md)
- [Passagen Core](https://github.com/PassagenWerk/passagen-core) 的 docs/user/configuration.md
- [Roadmap](docs/roadmap/README.md)

## 许可证

[GNU Affero General Public License v3.0](LICENSE)，SPDX 标识为 `AGPL-3.0-only`。
