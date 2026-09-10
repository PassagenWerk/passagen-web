# 开发与构建

本文档面向 Passagen Web 贡献者和 release maintainer。应用安装与日常使用见
[仓库 README](../../README.md)，Docker 部署运维见 [Docker 部署](../user/docker.md)。

## 源码环境

Web 使用相邻的 Core checkout；Docker runtime 还包含相邻的 CLI checkout。三个仓库的 minor
版本必须兼容，patch 版本可以独立演进。

```bash
git clone https://github.com/PassagenWerk/passagen-core.git
git clone https://github.com/PassagenWerk/passagen-cli.git
git clone https://github.com/PassagenWerk/passagen-web.git
cd passagen-web
uv sync --frozen
npm ci --prefix frontend
```

需要 Python 3.12、uv、Node.js `>=24 <25` 和 npm `>=11 <12`。

## 开发服务

FastAPI 和 Vite 分别运行；Vite 将 `/api` 代理到 8765：

```bash
uv run passagen-web serve --data-dir /path/to/library --no-open
npm --prefix frontend run dev
```

修改前端后构建 packaged static UI：

```bash
npm --prefix frontend run build
```

FastAPI 从 `src/passagen_web/static` 提供构建结果，不会在运行时读取 `frontend/src`。

## 检查与产物

```bash
make check
make check-e2e
uv build
```

`uv build` 通过 `hatch_build.py` 构建前端，并将 static UI 包含在 wheel 和 sdist 中。CI 还会
检查 wheel 中存在 `passagen_web/static/index.html`。

## 本地 Docker 镜像

`Dockerfile` 使用 Web、Core 和 CLI 三个 build context，并输出包含 `passagen-web` 与
`passagen` 命令的 runtime image：

```bash
docker build \
  --build-context passagen-core=../passagen-core \
  --build-context passagen-cli=../passagen-cli \
  -t passagen-web:local \
  .
```

也可以在用户 Compose 栈上叠加本地构建配置：

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml build passagen-web
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up -d
```

## Docker Hub 发布

Web 的 Git tag `vX.Y.Z` 推送到 GitHub 后，`.github/workflows/docker-publish.yml` checkout
workflow 中固定的兼容 Core/CLI refs，构建 `linux/amd64`、`linux/arm64` 镜像，并发布：

```text
sycstudio/passagen:X.Y.Z
sycstudio/passagen:X.Y
sycstudio/passagen:latest
```

Docker Hub 目标 repository 是 `sycstudio/passagen`。在 GitHub repository secrets 中配置：

- `DOCKERHUB_USERNAME`：有权写入该 repository 的 Docker Hub 用户。
- `DOCKERHUB_TOKEN`：该用户的 Docker Hub access token。

更新 Core/CLI minor 版本时，必须在发布 Web tag 前同步修改 workflow 的默认 `CORE_REF` 和
`CLI_REF`。已有 Web tag 可以手动运行 workflow，并分别指定 `release_tag`、`core_ref` 和
`cli_ref`。
