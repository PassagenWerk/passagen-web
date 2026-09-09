# Docker 部署

Passagen Web 可以构建为单容器服务。镜像只包含 Python 运行时、Core 依赖和已编译的前端静态资源；论文库、配置文件、生成 artifact 和 API key 都不会写入镜像。

## 文件

- `Dockerfile`：multi-stage 镜像定义。
- `docker-compose.yaml`：单服务运行配置。
- `.env.example`：本地环境变量样例。

## 前提

- Docker with BuildKit。
- Docker Compose v2.17 或更新版本（`additional_contexts` 用于引入相邻的 `passagen-core`）。
- 一个已经通过 Passagen CLI 初始化的 data directory。

如果还没有初始化论文库，先在本机执行：

```bash
cd ../passagen-cli
uv run passagen --data-dir /absolute/path/to/library db init
```

也可以先创建空目录，但首次启动前仍必须完成 `db init`。

## 配置

在 `passagen-web` 目录创建本地环境文件：

```bash
cp .env.example .env
```

编辑 `.env`：

```dotenv
PASSAGEN_API_KEY=your-api-key
PASSAGEN_BIND=127.0.0.1
PASSAGEN_ALLOWED_ORIGIN=http://127.0.0.1:8765
PASSAGEN_DATA_DIR=/absolute/path/to/library
PUID=1000
PGID=1000
```

| 变量 | 说明 |
|---|---|
| `PASSAGEN_API_KEY` | 默认配置读取的 LLM API key；只注入容器环境，不写入镜像。 |
| `PASSAGEN_BIND` | Docker 主机监听地址。默认只允许本机访问；局域网访问设为 `0.0.0.0`。 |
| `PASSAGEN_ALLOWED_ORIGIN` | 浏览器地址栏中的完整 origin，包括 protocol、host 和 port。 |
| `PASSAGEN_DATA_DIR` | 宿主机上的 Passagen data directory。 |
| `PUID` / `PGID` | 运行容器进程并写入 data directory 的宿主机 UID/GID。 |

`PASSAGEN_DATA_DIR` 会被挂载为容器内唯一的持久化目录 `/data`。目录中应包含 `passagen.db`、`passagen.yaml`、PDF 和 artifact。默认配置通过 `PASSAGEN_API_KEY` 读取 LLM key；如果
`passagen.yaml` 中的 `providers.llm.api_key_env` 改成了其他名称，需要在 `docker-compose.yaml`
的 `environment` 中追加同名变量。`PUID`/`PGID` 必须能读写该目录；需要时先修正宿主机权限：

```bash
sudo chown -R 1000:1000 /absolute/path/to/library
```

## 构建与启动

```bash
docker compose build
docker compose up -d
```

检查服务：

```bash
docker compose logs -f passagen-web
curl http://127.0.0.1:8765/api/health
```

浏览器打开 `.env` 中 `PASSAGEN_ALLOWED_ORIGIN` 对应的地址。

## 局域网访问

例如服务器地址是 `192.168.1.110`：

```dotenv
PASSAGEN_BIND=0.0.0.0
PASSAGEN_ALLOWED_ORIGIN=http://192.168.1.110:8765
```

然后重建不必要，只需重启：

```bash
docker compose up -d
```

`PASSAGEN_ALLOWED_ORIGIN` 不能填写客户端设备 IP；它必须与浏览器地址栏中的 origin 完全一致。

## 更新

```bash
git pull
# 同步更新相邻的 passagen-core checkout 后：
docker compose build
docker compose up -d
```

同一个 data directory 同时只能运行一个 Passagen Web 容器。不要为同一个 volume 设置多个 replica。

## 不使用 Compose 的直接构建

```bash
cd passagen-web
docker build \
  --build-context passagen-core=../passagen-core \
  -t passagen-web:local \
  .
```

直接运行时仍需要挂载 `/data`、映射 8765 并通过 `--allow-origin` 指定浏览器 origin。
