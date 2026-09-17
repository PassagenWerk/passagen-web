# Passagen

Passagen 是面向学术论文库的本地 Web 应用，可用于导入和处理 PDF、搜索论文、阅读 Summary、
Outline 与原始 PDF，以及进行单篇论文和 Collection 级别的问答与研究分析。

镜像包含：

- Passagen Web API
- 已编译的 Web 前端
- Passagen CLI
- Passagen Core

## Quick Start

推荐使用 Docker Compose。Compose 会同时启动 Passagen 和 GROBID：

```bash
mkdir passagen
cd passagen

curl -fsSLO https://raw.githubusercontent.com/PassagenWerk/passagen-web/main/docker-compose.yaml
curl -fsSL https://raw.githubusercontent.com/PassagenWerk/passagen-web/main/.env.example -o .env
```

编辑 `.env`，至少设置：

```dotenv
PASSAGEN_API_KEY=your-api-key
```

启动服务：

```bash
docker compose pull
docker compose up -d
```

浏览器打开 <http://127.0.0.1:8765>。

## 数据持久化

默认使用 Docker named volume：

```dotenv
PASSAGEN_DATA_DIR=passagen-data
```

首次启动时，容器会自动初始化数据库。后续启动会保留已有数据，并自动升级受支持的旧数据库
schema。

也可以挂载已有 Passagen 论文库：

```dotenv
PASSAGEN_DATA_DIR=/absolute/path/to/library
```

该目录可包含 `passagen.db`、`passagen.yaml`、PDF 文件和生成的 artifact。初始化不会清空已有
论文、配置或 artifact。

## 配置参数

| 变量 | 说明 |
|---|---|
| `PASSAGEN_API_KEY` | 默认 LLM provider 使用的 API key |
| `PASSAGEN_IMAGE` | Passagen 镜像版本 |
| `GROBID_IMAGE` | GROBID 镜像版本 |
| `PASSAGEN_DATA_DIR` | Named volume 或已有论文库的宿主机路径 |
| `PASSAGEN_BIND` | 宿主机监听地址，默认 `127.0.0.1` |
| `PASSAGEN_ALLOWED_ORIGIN` | 浏览器访问服务时使用的完整 origin |
| `PUID` / `PGID` | 访问 bind-mounted data directory 使用的 UID/GID |

局域网访问示例：

```dotenv
PASSAGEN_BIND=0.0.0.0
PASSAGEN_ALLOWED_ORIGIN=http://192.168.1.110:8765
```

`PASSAGEN_ALLOWED_ORIGIN` 必须与浏览器地址栏中的 protocol、host 和 port 完全一致。

## GROBID

Compose 默认启动 `lfoppiano/grobid:0.9.1-crf`。Passagen 通过 Compose 内部网络访问
`http://grobid:8070`，GROBID 端口不会发布到宿主机或公网。

GROBID 镜像较大，建议至少准备 4 GB 可用内存。

## 容器内 CLI

检查数据库：

```bash
docker compose exec passagen-web passagen --data-dir /data db status
```

检查配置和 provider：

```bash
docker compose exec passagen-web passagen --data-dir /data config check
docker compose exec passagen-web passagen --data-dir /data check
```

执行数据库写操作前，建议先停止 Web 服务，避免同时写入 SQLite。

## 镜像标签

推荐固定完整版本：

```bash
docker pull sycstudio/passagen:0.9.0
```

- `0.9.0`：固定完整版本
- `0.9`：当前 0.9 系列版本
- `latest`：最新稳定版本

支持平台：

- `linux/amd64`
- `linux/arm64`

## 健康检查

```bash
curl http://127.0.0.1:8765/api/health
```

查看日志：

```bash
docker compose logs -f passagen-web grobid
```

## 项目地址

- Web: https://github.com/PassagenWerk/passagen-web
- CLI: https://github.com/PassagenWerk/passagen-cli
- Core: https://github.com/PassagenWerk/passagen-core
- Docker Hub: https://hub.docker.com/r/sycstudio/passagen

## License

Passagen Web 使用 GNU Affero General Public License v3.0，SPDX 标识为 `AGPL-3.0-only`。
