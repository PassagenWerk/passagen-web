# Passagen Web

Passagen Web 是一个本地 Web 界面，用于浏览和整理由 [Passagen](../passagen-cli) 管理的论文。它提供论文搜索与筛选、结构化摘要与提纲阅读、用户元数据行内编辑、PDF 阅读、标签以及有序论文集合等功能。

应用采用本地单用户服务设计：

```text
浏览器 -> Passagen Web API -> Passagen 应用服务 -> SQLite 和 artifact
```

Passagen 负责数据库 Schema、迁移、论文处理及 artifact 语义；本仓库负责 HTTP API、浏览器 UI 和本地服务生命周期。

M0 项目基础、M1 Catalog 契约、M2 只读论文 API 和 M3 论文库浏览 UI 已经完成。范围与里程碑参见 [`docs/roadmap.md`](docs/roadmap.md)，仓库边界参见 [`docs/architecture.md`](docs/architecture.md)。

## 环境要求

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Node.js `>=24 <25` 和 npm `>=11 <12`
- 与本仓库相邻的 Passagen checkout，以及已经初始化的 Passagen 数据目录

开发目录结构应为：

```text
Passagen/
├── passagen-cli/
└── passagen-web/
```

Passagen Web 通过公开的 `passagen.catalog` 应用服务使用相邻 checkout，不会导入 Passagen 的存储层内部实现。

## 安装

```bash
uv sync
npm --prefix frontend ci
uv run pre-commit install
```

前端在 `frontend/package.json` 中声明了相同的运行时版本范围。安装依赖时，npm 的严格 engine 检查会拒绝不受支持的 Node.js 或 npm 版本。

pre-commit 配置默认同时安装 `pre-commit` 和 `pre-push` hook。Commit hook 会格式化并检查发生变更的代码；Push hook 会根据变更文件运行 basedpyright、mypy、Python 测试及完整前端检查。克隆仓库或重新创建 `.git` 后，请再次执行安装命令。

## 开发

使用包含 `passagen.db` 的数据目录启动 API：

```bash
uv run passagen-web serve --data-dir ../passagen-cli/data
```

在另一个终端中启动 Vite：

```bash
npm --prefix frontend run dev
```

打开 `http://127.0.0.1:5173`。Vite 会将 `/api` 代理到 FastAPI 进程，API 文档位于 `http://127.0.0.1:8765/api/docs`。

监听地址默认为 `127.0.0.1`。只有显式传入 `--host` 才会监听其他网络接口。

当前只读 API 提供论文列表、详情、结构化摘要和 Markdown 提纲：

```text
GET /api/papers
GET /api/papers/{paper_id}
GET /api/papers/{paper_id}/summary
GET /api/papers/{paper_id}/outline
```

论文列表支持 `q`、`status`、`tag`、`venue`、`year`、`collection`、`sort`、`direction`、`limit` 和 `offset` 查询参数。

浏览界面的搜索、筛选、排序、分页、阅读视图和已选论文都保存在 URL 中。可以使用方向键或 `J`/`K` 在当前论文列表中移动。桌面端采用筛选、论文列表、阅读器三栏布局；窄屏设备会在列表与详情页面之间导航。

## 检查

使用 `make check` 运行全部检查，也可以分别检查两端：

```bash
make check-python
make check-frontend
```

执行 `npm --prefix frontend run build` 后，前端生产资源会写入 `src/passagen_web/static`。由 Python 包提供这些静态资源的功能计划在 M7 实现。

GitLab CI 会通过 `.gitlab-ci.yml` 运行等价的 Python 与前端 lint、测试和构建任务，并通过 GitLab reports 发布测试结果及 Python 覆盖率。
