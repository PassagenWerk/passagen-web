# Docker 部署

Passagen Web 发布到 `docker.io/sycstudio/passagen`。仓库中的 Compose 配置直接拉取 Web
镜像，并在同一私有网络中启动 GROBID。论文库、配置、生成 artifact 和 API key 都不会写入
公开镜像。

## 服务和文件

- `passagen-web`：Web API 和已经编译的前端，只向宿主机发布 8765 端口。
- `passagen`：与 Web/Core 同版本的 CLI，安装在 Web 镜像的可执行 `PATH` 中。
- `passagen-mcp-server`：可选的独立 companion image，默认只读，不包含在 Web 镜像中。
- `grobid`：PDF header 和全文 TEI 解析服务，只在 Compose 网络内暴露 8070 端口。
- `docker-compose.yaml`：普通用户使用的 pull-based 部署配置。
- `.env.example`：镜像版本、访问地址、论文库路径和 secret 的环境变量样例。

GROBID 镜像体积较大，首次拉取和首次启动会花费一些时间。建议为整个部署至少准备 4 GB
可用内存。

需要让 LibreChat 或其他 Agent 读取论文库时，单独部署 MCP companion 并挂载同一个 data
directory；不要在 Web 容器内启动第二个服务进程。示例和维护边界见
[MCP companion 与 Agent 集成](mcp.md)。

## 首次准备

需要 Docker Engine、Docker Compose 和 `curl`。创建部署目录，只下载 Compose 和环境配置：

```bash
mkdir passagen
cd passagen
curl -fsSLO https://raw.githubusercontent.com/PassagenWerk/passagen-web/main/docker-compose.yaml
curl -fsSL https://raw.githubusercontent.com/PassagenWerk/passagen-web/main/.env.example -o .env
```

编辑 `.env`：

```dotenv
PASSAGEN_IMAGE=docker.io/sycstudio/passagen:0.9.0
GROBID_IMAGE=docker.io/lfoppiano/grobid:0.9.1-crf
PASSAGEN_API_KEY=your-api-key
PASSAGEN_BIND=127.0.0.1
PASSAGEN_ALLOWED_ORIGIN=http://127.0.0.1:8765
PASSAGEN_DATA_DIR=passagen-data
PUID=1000
PGID=1000
```

| 变量 | 说明 |
|---|---|
| `PASSAGEN_IMAGE` | Web 镜像。生产环境建议固定完整版本，而不是使用 `latest`。 |
| `GROBID_IMAGE` | GROBID 镜像；默认固定为经过验证的 `0.9.1-crf`。 |
| `PASSAGEN_API_KEY` | 默认配置读取的 LLM API key；只注入容器环境。 |
| `PASSAGEN_BIND` | Docker 主机监听地址。默认仅允许本机访问。 |
| `PASSAGEN_ALLOWED_ORIGIN` | 浏览器地址栏中的完整 origin，包括 protocol、host 和 port。 |
| `PASSAGEN_DATA_DIR` | 新安装可使用 `passagen-data` named volume；也可填写已有论文库的宿主机路径。 |
| `PUID` / `PGID` | Web 进程写入 data directory 时使用的宿主机 UID/GID。 |

`PASSAGEN_DATA_DIR` 挂载为容器中的 `/data`。默认 named volume 无需提前创建；Web 容器每次
启动时先运行幂等的 `passagen --data-dir /data db init`，首次启动会创建数据库，后续启动会
保留数据并升级受支持的旧 schema。初始化不会清空已有论文、artifact 或配置。

如果使用已有论文库，将变量改为绝对路径：

```dotenv
PASSAGEN_DATA_DIR=/absolute/path/to/library
```

该目录可包含 `passagen.db`、`passagen.yaml`、PDF 和 artifact。Compose 会通过嵌套环境变量将
`providers.grobid.base_url` 覆盖为 `http://grobid:8070`，因此不需要为 Docker 单独修改已有的
`passagen.yaml`。没有 `passagen.yaml` 时使用 Core 默认配置。

默认配置通过 `PASSAGEN_API_KEY` 读取 LLM key。如果 `passagen.yaml` 中的
`providers.llm.default.api_key_env` 使用其他名称，需要在 `docker-compose.yaml` 的
`environment` 中追加同名变量。`PUID`/`PGID` 必须能读写数据目录；需要时修正权限：

```bash
sudo chown -R 1000:1000 /absolute/path/to/library
```

## 启动和检查

```bash
docker compose pull
docker compose up -d
docker compose ps
```

检查 Web 服务：

```bash
docker compose logs -f passagen-web grobid
curl http://127.0.0.1:8765/api/health
```

GROBID 不发布宿主机端口，Web 通过 Compose 网络访问它。启动初期 GROBID 尚未就绪时，PDF
处理可能暂时报告 provider unavailable；等待 GROBID 完成启动后重试即可。

## 使用容器内 CLI

Web 容器运行时，可以直接检查同一个 `/data`：

```bash
docker compose exec passagen-web passagen --data-dir /data db status
docker compose exec passagen-web passagen --data-dir /data config check
docker compose exec passagen-web passagen --data-dir /data check
```

需要在 Web 停止时执行维护命令，可启动覆盖 entrypoint 的一次性容器：

```bash
docker compose stop passagen-web
docker compose run --rm --no-deps --entrypoint passagen passagen-web \
  --data-dir /data db status
docker compose start passagen-web
```

数据库写操作前应先停止 Web，避免同时写入 SQLite。一次性容器仍挂载相同 volume，并继承
Compose 中配置的 provider 环境变量。

## 局域网访问

例如服务器地址是 `192.168.1.110`：

```dotenv
PASSAGEN_BIND=0.0.0.0
PASSAGEN_ALLOWED_ORIGIN=http://192.168.1.110:8765
```

应用配置修改后运行：

```bash
docker compose up -d
```

`PASSAGEN_ALLOWED_ORIGIN` 必须与浏览器地址栏中的 origin 完全一致，不能填写客户端设备 IP。
不要把 GROBID 的 8070 端口暴露到公网。

## 更新和回滚

先在 `.env` 中将 `PASSAGEN_IMAGE` 改为目标版本，再执行：

```bash
docker compose pull
docker compose up -d
```

回滚时恢复先前镜像标签并再次执行相同命令。升级前应备份 data directory。同一个 data
directory 同时只能运行一个 Passagen Web 容器，不要为同一个 volume 设置多个 replica。
