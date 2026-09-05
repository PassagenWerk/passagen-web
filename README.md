# Passagen Web

Passagen Web 是 `passagen-core` 的本地浏览器适配器，用于浏览和整理由
[Passagen CLI](../passagen-cli) 管理的论文。它提供论文搜索与筛选、结构化摘要与提纲阅读、
用户元数据行内编辑、PDF 阅读、标签以及有序论文集合等功能。

应用采用本地单用户服务设计：

```text
浏览器 -> Passagen Web API -> Passagen 应用服务 -> SQLite 和 artifact
```

Passagen 负责数据库 Schema、迁移、论文处理及 artifact 语义；本仓库负责 HTTP API、浏览器 UI 和本地服务生命周期。

M0 项目基础至 M7 本地分发与发布质量已经完成。范围与里程碑参见 [`docs/roadmap.md`](docs/roadmap.md)，仓库边界参见 [`docs/architecture.md`](docs/architecture.md)。发布、升级、备份与恢复参见 [`docs/release.md`](docs/release.md)。

## 环境要求

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Node.js `>=24 <25` 和 npm `>=11 <12`
- 与本仓库相邻的 `passagen-core` checkout，以及已经初始化的 Passagen 数据目录

开发目录结构应为：

```text
Passagen/
├── passagen-core/
├── passagen-cli/
└── passagen-web/
```

Passagen Web 通过公开的 `passagen.catalog` 应用服务使用相邻的 Core checkout，不会导入
Passagen 的存储层内部实现，也不依赖 `passagen-cli` distribution。

## 安装

```bash
uv sync
npm --prefix frontend ci
uv run pre-commit install
```

从源码构建 wheel：

```bash
uv build
```

使用源码启动服务：

```bash
uv run passagen-web serve --data-dir ../passagen-cli/data
```

服务默认监听 `127.0.0.1:8765` 并自动打开浏览器。使用 `--no-open` 禁止自动打开；同一数据目录只能由一个 Passagen Web 进程使用，端口冲突会在启动前返回可操作的错误。

前端在 `frontend/package.json` 中声明了相同的运行时版本范围。安装依赖时，npm 的严格 engine 检查会拒绝不受支持的 Node.js 或 npm 版本。

pre-commit 配置默认同时安装 `pre-commit` 和 `pre-push` hook。Commit hook 会格式化并检查发生变更的代码；Push hook 会根据变更文件运行 basedpyright、mypy、Python 测试及完整前端检查。克隆仓库或重新创建 `.git` 后，请再次执行安装命令。

## 开发

使用包含 `passagen.db` 的数据目录启动 API：

```bash
uv run passagen-web serve --data-dir ../passagen-cli/data \
  --allow-origin http://127.0.0.1:5173
```

在另一个终端中启动 Vite：

```bash
npm --prefix frontend run dev
```

打开 `http://127.0.0.1:5173`。Vite 会将 `/api` 代理到 FastAPI 进程，API 文档位于 `http://127.0.0.1:8765/api/docs`。

监听地址默认为 `127.0.0.1`。只有显式传入 `--host` 才会监听其他网络接口。浏览器写请求只接受应用自身 Origin；开发环境通过 `--allow-origin` 显式允许 Vite，非浏览器本地客户端可以继续调用 API。

当前 API 提供论文读取、artifact 阅读、Library Tags、用户元数据和有序论文集合：

```text
GET /api/papers
GET /api/papers/{paper_id}
GET /api/papers/{paper_id}/summary
GET /api/papers/{paper_id}/outline
GET /api/papers/{paper_id}/pdf
PATCH /api/papers/{paper_id}/metadata
PUT /api/papers/{paper_id}/tags
PUT /api/papers/{paper_id}/tags/{tag_id}
DELETE /api/papers/{paper_id}/tags/{tag_id}
GET /api/tags
POST /api/tags
PATCH /api/tags/{tag_id}
DELETE /api/tags/{tag_id}
GET /api/collections
POST /api/collections
GET /api/collections/{collection_id}
PATCH /api/collections/{collection_id}
DELETE /api/collections/{collection_id}
POST /api/collections/{collection_id}/papers
PATCH /api/collections/{collection_id}/papers/order
DELETE /api/collections/{collection_id}/papers/{paper_id}
```

PDF 端点以内联方式流式传输受管理的原始论文，支持字节范围请求、`ETag` 和 `Last-Modified`。PDF 仅在聚焦 Read 模式通过右侧开关显示，打开后与左侧 Summary 或 Outline 构成双栏；其 URL 为 `/papers/{paper_id}/pdf?page={page}`。Summary 和 Outline 中的 evidence page 会自动打开 PDF 侧栏并跳转到对应页面，也可从阅读器在新标签页打开原始 PDF。

论文列表支持 `q`、`status`、`tag`、`tag_match`、`venue`、`year`、`collection`、`sort`、`direction`、`limit` 和 `offset` 查询参数。`tag` 可以重复出现以筛选多个 Tag；`tag_match=all`（默认）要求论文同时包含全部所选 Tag，`tag_match=any` 匹配包含任意所选 Tag 的论文。`GET /api/tags` 返回每个 Tag 的 `paper_count` 使用数量。

Library Tags 是用户维护的持久化标签。Find 面板提供可搜索的多选 Tag 筛选，选中状态保存在 URL 中；阅读工具栏的 `Tags N` 入口可以在不离开阅读位置的情况下即时添加或移除当前论文的 Tag，并可直接创建并分配新 Tag。`/tags` 工作区集中创建、重命名、改色和删除全局 Tag，删除前会显示受影响的论文数量。Summary 中生成的 `Paper Keywords` 保持只读，与 Library Tags 不自动合并。元数据编辑器（Edit Metadata）允许修改标题、Venue 和年份，请求携带 `updated_at` 进行乐观并发校验，被其他流程更新的值不会静默覆盖。

顶部的 `Library` 和 `Collections` 是两个互通的工作入口。Library 默认浏览全部论文，也可以浏览具体集合或尚未归类的论文，并从当前筛选结果多选、批量加入集合；选择具体集合时可使用持久化集合顺序浏览。Collections 使用独立两栏工作区创建和编辑集合、添加或移除成员，并通过一次原子请求调整成员顺序。从集合打开论文会保留集合上下文，上一篇和下一篇遵循集合顺序，退出阅读后返回原集合。

浏览界面的搜索、筛选、排序、分页、阅读视图和已选论文都保存在 URL 中。可以使用方向键或 `J`/`K` 在当前论文列表中移动。桌面端采用筛选、论文列表、阅读器三栏布局；窄屏设备会在列表与详情页面之间导航。

## 检查

使用 `make check` 运行全部检查，也可以分别检查两端：

```bash
make check-python
make check-frontend
```

执行 `npm --prefix frontend run build` 后，前端生产资源会写入 `src/passagen_web/static`。发布构建通过 Hatch hook 自动执行该步骤并将资源收入 wheel；FastAPI 同一进程提供 UI、API 和 SPA fallback。

GitLab CI 会通过 `.gitlab-ci.yml` 运行等价的 Python 与前端 lint、测试和构建任务，并通过 GitLab reports 发布测试结果及 Python 覆盖率。

## 许可证

Passagen Web 仅按照 [GNU Affero General Public License v3.0](LICENSE) 发布，SPDX 标识为 `AGPL-3.0-only`。
