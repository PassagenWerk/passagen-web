# Passagen Web

Passagen Web 是 Passagen 论文库的本地浏览器界面。它与 CLI 使用同一个 data directory 和
配置文件，可以导入和处理 PDF、搜索论文、阅读 cleaned Abstract、Summary、Outline 与原始
PDF，并管理标签、集合和论文元数据。

README 中的仓库链接指向 GitHub；在 GitLab 或 Gitea 镜像中，对应仓库位于同一 PassagenWerk 组的同名路径下。

## 功能

- 浏览、搜索、筛选和排序本地论文库。
- 上传 PDF，启动、查看和恢复 processing run。
- 对 Metadata、Abstract clean、Summary 和 Outline 执行定向 reprocess。
- 并排阅读 Summary、Outline 和 PDF evidence page。
- 编辑受保护的用户元数据，管理标签和有序集合。
- 对单篇论文或整个 collection 进行持久化对话问答，回答带可验证 citation 并导航到对应
  论文/PDF 页。
- Collection workspace：Synthesis（跨论文综述，含 stale/partial 状态与轮询生成）、Reports
  （review/comparison/gaps/custom，含历史与详情）和 Ask 三个标签页。
- 在桌面和移动浏览器中使用 Light/Dark Mode。

## 环境要求

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- 已通过 Passagen CLI 初始化的 data directory
- 从源码修改前端时需要 Node.js `>=24 <25` 和 npm `>=11 <12`

## 安装

源码环境使用相邻的 Core checkout：

以下 URL 可替换为你使用的 GitHub、GitLab 或 Gitea 镜像地址：

```bash
git clone https://github.com/PassagenWerk/passagen-core.git
git clone https://github.com/PassagenWerk/passagen-web.git
cd passagen-web
uv sync --frozen
```

如需创建和初始化论文库，请安装
[Passagen CLI](https://github.com/PassagenWerk/passagen-cli)，然后运行：

```bash
cd ../passagen-cli
uv sync --frozen
uv run passagen --data-dir /path/to/library db init
```

## 启动

仅本机访问：

```bash
uv run passagen-web serve --data-dir /path/to/library
```

默认监听 `127.0.0.1:8765` 并打开浏览器。

局域网或反向代理场景：

```bash
uv run passagen-web serve \
  --data-dir ../passagen-cli/data \
  --host 192.168.1.110 \
  --port 8765 \
  --no-open \
  --allow-origin http://you-domain-or-ip:8765
```

| 参数 | 说明 |
|---|---|
| `--data-dir PATH` | 必填，包含 `passagen.db` 和 managed artifacts 的目录。 |
| `--config PATH` | 显式配置文件；默认使用 `<data-dir>/passagen.yaml`。 |
| `--host ADDRESS` | 监听地址；默认 `127.0.0.1`。 |
| `--port PORT` | 监听端口；默认 `8765`。 |
| `--no-open` | 启动后不自动打开本机浏览器。 |
| `--allow-origin URL` | 允许额外 browser origin 执行写请求；可重复指定。 |

`--allow-origin` 必须填写浏览器地址栏页面的完整 origin，即 protocol、host 和 port，不能填写
客户端设备 IP。浏览器直接打开服务自身地址时无需额外设置；通过反向代理、域名或 Vite 访问
时才需要添加对应 origin。

同一个 data directory 同时只能由一个 Passagen Web 进程持有。修改配置、API key 或后端代码
后必须重启服务；重新构建前端后刷新浏览器。

## 配置

Web 与 CLI 读取同一个 `<data-dir>/passagen.yaml`，并从配置指定的环境变量读取 LLM API key：

```bash
export PASSAGEN_API_KEY=your-deepseek-api-key
uv run passagen-web serve --data-dir /path/to/library
```

默认使用 DeepSeek `deepseek-flash-v4`。完整 DeepSeek、GROBID、Crossref、arXiv 和 pipeline 配置
见 Passagen Core 仓库的 docs/user/configuration.md（[Passagen Core](https://github.com/PassagenWerk/passagen-core)）。

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

- [Web 运行、备份与恢复](docs/user/operations.md)
- [Web 架构](docs/development/architecture.md)
- [Passagen Core](https://github.com/PassagenWerk/passagen-core) 的 docs/user/configuration.md
- [Roadmap](docs/roadmap/README.md)

## 许可证

[GNU Affero General Public License v3.0](LICENSE)，SPDX 标识为 `AGPL-3.0-only`。
