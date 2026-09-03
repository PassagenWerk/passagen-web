# Passagen Web 开发路线图

本文档定义 Passagen 论文库本地 Web 界面的实现计划，包括仓库边界、技术选型、里程碑、验收条件和延期事项。

## 产品目标

首个可用版本应完成以下工作流：

```text
打开本地论文库
  -> 搜索、筛选和排序论文
  -> 查看元数据、摘要和提纲
  -> 在相关页打开受管理的 PDF
  -> 添加或编辑标签
  -> 将论文加入有序集合
```

首个版本是本地单用户应用，不提供用户账号、远程托管、协作编辑、PDF 标注、向量搜索或集合综合。

## 仓库边界

Passagen 与 Passagen Web 保持为职责不同的独立仓库。

| 仓库 | 职责 |
| --- | --- |
| `Passagen` | 领域模型、SQLite Schema 与迁移、Repository、Catalog 应用服务、artifact 校验、处理流程和 CLI |
| `Passagen-web` | FastAPI 适配层、HTTP Schema、PDF 流式传输、React UI、本地服务生命周期和浏览器端测试 |

依赖方向是单向的：

```text
passagen_web -> passagen 公开 API -> 存储和 artifact
```

Passagen 不得导入 `passagen_web`。Passagen Web 不得复制 SQLAlchemy Row、针对 `passagen.db` 执行临时 SQL，也不得通过扫描数据目录推断 artifact 路径。

标签和集合是持久化的论文库概念，未来也会用于 CLI 和综合流程，因此其数据表、迁移、不变量和应用服务属于 Passagen。主题、面板宽度等纯 UI 偏好保存在浏览器存储中。

## 技术基线

- Python 3.12+
- 使用 `uv` 管理 Python 依赖和环境
- 使用 FastAPI 和 Uvicorn 构建本地 HTTP 应用
- 使用 Pydantic 定义请求和响应 Schema
- 前端使用 React、TypeScript 和 Vite
- 使用轻量客户端 Router 和查询缓存
- 初期使用浏览器原生 PDF 阅读能力；需要可靠页面跳转时引入 PDF.js
- 后端测试使用 pytest
- 前端测试使用 Vitest 和 Testing Library
- 少量端到端工作流使用 Playwright
- Python 检查使用 Ruff、basedpyright 和 mypy
- 前端检查使用 ESLint 和 TypeScript

生产应用通过一个 Uvicorn 进程同时提供编译后的 React 资源和 API。默认监听 `127.0.0.1`，首个版本不支持向局域网公开服务。

## 目标仓库结构

```text
Passagen-web/
├── pyproject.toml
├── uv.lock
├── README.md
├── docs/
│   ├── architecture.md
│   └── roadmap.md
├── src/
│   └── passagen_web/
│       ├── __init__.py
│       ├── app.py
│       ├── cli.py
│       ├── config.py
│       ├── dependencies.py
│       ├── api/
│       │   ├── papers.py
│       │   ├── tags.py
│       │   ├── collections.py
│       │   └── artifacts.py
│       ├── schemas/
│       │   ├── papers.py
│       │   ├── tags.py
│       │   └── collections.py
│       └── static/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── api/
│       ├── components/
│       ├── features/
│       │   ├── papers/
│       │   ├── tags/
│       │   ├── collections/
│       │   └── reader/
│       ├── routes/
│       └── main.tsx
└── tests/
    ├── api/
    ├── integration/
    └── e2e/
```

Python distribution 名称为 `passagen-web`，import package 为 `passagen_web`，CLI 入口为 `passagen-web`。

## 数据契约

现有 Passagen 数据库是论文身份、元数据、状态、导入时间及 artifact 引用的唯一事实来源。Web API 通过 Passagen 服务解析 artifact，绝不向浏览器返回本地文件系统路径。

Passagen 需要提供以下持久化模型：

```text
tags
- id
- name
- normalized_name
- color
- created_at

paper_tags
- paper_id
- tag_id
- created_at

collections
- id
- name
- description
- created_at
- updated_at

collection_papers
- collection_id
- paper_id
- position
- note
- added_at
```

必须满足以下不变量：

- 标签规范化名称唯一。
- 同一标签只能分配给同一论文一次。
- 同一论文在一个集合中只能出现一次。
- 集合位置确定且可以原子重排。
- 删除论文时一并删除其标签分配和集合成员关系。
- 删除集合不会删除论文。
- 再次运行 Passagen 处理流程时，用户编辑的书目字段继续保留 `user` 来源。
- Web UI 不得修改生成的摘要和提纲 artifact。

## HTTP 契约

初始 API 以 `/api` 为根路径，包括：

```text
GET    /api/health
GET    /api/papers
GET    /api/papers/{paper_id}
GET    /api/papers/{paper_id}/summary
GET    /api/papers/{paper_id}/outline
GET    /api/papers/{paper_id}/pdf
PATCH  /api/papers/{paper_id}/metadata
PUT    /api/papers/{paper_id}/tags

GET    /api/tags
POST   /api/tags
PATCH  /api/tags/{tag_id}
DELETE /api/tags/{tag_id}

GET    /api/collections
POST   /api/collections
GET    /api/collections/{collection_id}
PATCH  /api/collections/{collection_id}
DELETE /api/collections/{collection_id}
POST   /api/collections/{collection_id}/papers
PATCH  /api/collections/{collection_id}/papers/order
DELETE /api/collections/{collection_id}/papers/{paper_id}
```

论文列表支持查询文本、状态、标签、期刊或会议、年份、集合、排序字段、排序方向和分页。列表响应包含元数据及 artifact 可用性标志，但不包含完整摘要或提纲内容。

HTTP Schema 由 Passagen Web 所有，与 Passagen 存储记录相互独立，避免文件系统路径和存储实现细节进入公开响应契约。

## M0：项目基础

### 工作内容

- 配置 Python 项目、`src/passagen_web` package 和 CLI 入口。
- 添加 FastAPI、Uvicorn、Pydantic、测试、lint 和类型检查依赖。
- 添加基于 Vite、React 和 TypeScript 的前端。
- 配置 Vite，将 `/api` 代理到开发环境的 FastAPI 服务。
- 添加 Python 与前端的统一检查命令和 CI。
- 记录本地开发命令及双仓库 checkout 要求。

### 交付物

- `uv run passagen-web --help`
- `uv run passagen-web serve --data-dir PATH`
- FastAPI `/api/health` 端点
- React 应用外壳
- 自动化 lint、类型检查、单元测试和构建任务

### 验收条件

- 全新 checkout 可以使用文档中的命令安装 Python 和前端依赖。
- 开发服务器可以加载 React 应用，并成功代理健康检查请求。
- 数据目录缺失或无效时，命令返回简洁错误。
- 除非显式配置，否则服务只监听 `127.0.0.1`。
- Python 和前端检查不依赖外部服务。

## M1：Passagen Catalog 契约

该里程碑主要在 Passagen 仓库中实现，是 Web 写入功能的前置条件。

**状态：已完成。** Passagen Schema v2 和公开的 `passagen.catalog` 服务已经提供后续 Web 里程碑所需的类型化论文查询、标签、有序集合、用户元数据保护、artifact 解析及稳定领域错误。

### 工作内容

- 添加公开的 `passagen.catalog` 应用服务边界。
- 添加类型化论文筛选、排序选项、分页结果和详情投影。
- 添加标签与集合的前向迁移和存储模型。
- 添加标签生命周期、论文标签分配、集合生命周期、成员关系及排序服务。
- 添加用户元数据更新服务，将字段来源记录为 `user`，并在后续处理流程更新时保留覆盖值。
- 添加安全 artifact 解析，确保相对路径始终位于 `data_dir` 下。
- 定义支持的 Passagen package 和数据库 Schema 兼容范围。

### 交付物

- 公开的 `CatalogService` 或等价 Facade
- 标签和集合迁移
- Catalog 单元测试与 SQLite 集成测试
- 可供 Passagen Web 使用的 Passagen package 版本

### 验收条件

- Passagen Web 无需导入 ORM Row 或打开 Session 即可实现所有 Catalog 操作。
- 重复标签和成员关系通过类型化、面向用户的领域错误返回。
- 集合重排原子提交，并拒绝未知或重复的成员 ID。
- 强制元数据处理不会覆盖来源为 `user` 的字段。
- artifact 解析拒绝绝对路径、路径穿越和缺失文件。
- 现有 Passagen 数据库升级时不会丢失论文或 artifact。

## M2：只读论文 API

**状态：已完成。** Web 应用现在通过单例 `CatalogService` 提供论文列表、详情、经过 Schema 校验的 Summary 和原始 Markdown Outline，并将 Catalog 领域失败映射为稳定 HTTP 错误。

### 工作内容

- 根据配置的 `database_path` 和 `data_dir` 构造唯一 Catalog 依赖。
- 实现健康检查、论文列表、论文详情、摘要和提纲端点。
- 返回结构化摘要 JSON 前，使用 Passagen Summary Schema 校验。
- 在浏览器中渲染 Outline Markdown，不在服务端转换为受信任 HTML。
- 将不存在、artifact 无效、Schema 不兼容和数据库繁忙等失败映射为稳定错误。
- 添加分页及确定性排序。

### 交付物

- 只读 `/api/papers` 端点
- OpenAPI Schema
- 基于临时 Passagen 论文库的 API 组件测试

### 验收条件

- 可以按标题查询、期刊或会议、年份、状态、标签和集合筛选论文。
- 可以按标题、期刊或会议、年份、导入时间和更新时间排序。
- 列表请求不会读取每一份摘要或提纲 artifact。
- artifact 缺失时返回可用性状态或稳定的 404，而不是 traceback。
- API 响应绝不包含绝对或相对本地 artifact 路径。
- 不支持的数据库版本会在启动时失败，并提供可操作的错误信息。

## M3：论文库浏览 UI

**状态：已完成。** React 应用现在提供 URL 驱动的搜索、筛选、排序、分页和论文选择，支持 Structured Summary 与安全 Markdown Outline 阅读，并具备桌面三栏、窄屏独立导航及键盘移动能力。

### 工作内容

- 构建响应式论文列表和论文详情路由。
- 添加文本搜索、筛选、排序控件及分页或增量加载。
- 在 URL 中持久化搜索、筛选、排序及已选论文状态。
- 展示元数据、处理状态、标签及 artifact 可用性。
- 添加 Summary 和 Outline 阅读器及其加载、空内容和 artifact 无效状态。
- 桌面端使用三栏布局，窄屏使用独立的列表与详情导航。
- 添加键盘导航，在当前可见论文列表中移动。

### 交付物

- 可搜索的论文库界面
- 论文详情界面
- Structured Summary 阅读器
- Markdown Outline 阅读器
- 响应式桌面端和移动端布局

### 验收条件

- 用户可以按标题查找论文，并按期刊或会议、年份、状态或标签缩小结果范围。
- 刷新页面及浏览器前进、后退操作会保留当前论文库视图。
- 选择论文后首先显示 Summary，并可切换至 Outline。
- Summary 或 Outline 缺失时，根据论文处理状态说明原因。
- 主要浏览工作流可以使用键盘完成。
- 页面在支持的桌面端和移动端宽度下均能正确加载。

## M4：PDF 阅读

**状态：已完成。** Web API 通过 Catalog 安全解析 `original_pdf`，以 inline、可缓存且支持 Range 的响应流式传输 PDF；React UI 提供原生嵌入式阅读路由，并把 Summary 和 Outline 中的证据页链接到对应 PDF 页面。

### 工作内容

- 添加通过 `original_pdf` artifact 解析的 PDF 端点。
- 实现 `Content-Type`、inline disposition、内容长度、缓存校验及字节范围请求。
- 初期使用浏览器原生嵌入式或新标签页阅读器。
- 评估 PDF.js，以实现一致的嵌入式阅读和直接页面跳转。
- 将摘要和提纲中的证据页引用链接到 PDF 阅读器。
- 明确处理缺失、已替换或完整性无效的 PDF artifact。

### 交付物

- 支持 Range 请求的 `/api/papers/{paper_id}/pdf`
- PDF 阅读器路由
- 证据页链接

### 验收条件

- 大型 PDF 无需全部载入 API 内存即可开始渲染。
- PDF 刷新或跳转可以通过 HTTP Range 请求正常工作。
- 构造的论文 ID 或 URL 无法读取配置数据目录外的文件。
- 选择证据页后，可以在相应页面附近打开同一篇论文。
- PDF 缺失或损坏时显示可读的应用错误。

## M5：标签与用户元数据

**状态：已完成。** Web API 现在提供 Library Tags 生命周期、论文分配和携带 `updated_at` 的用户元数据更新；界面区分只读 Paper Keywords 与用户维护的 Library Tags，并显示保存、失败和冲突状态。

### 工作内容

- 实现标签列表、创建、重命名、改色、删除及分配端点。
- 在论文详情中添加行内标签编辑器；论文列表的多选批量分配并入 M6 集合工作流实现。
- 支持编辑标题、期刊或会议、年份等获准的书目字段。
- 使用 `updated_at` 或显式 revision 作为乐观并发 token。
- 展示等待、已保存、冲突和失败状态，且乐观更新失败时不丢失数据。
- 删除已用于论文的标签前进行破坏性操作确认。

### 交付物

- 标签管理 UI
- 论文标签行内编辑
- 受控的用户元数据编辑器
- 并发冲突处理

### 验收条件

- 仅规范化形式不同的标签不会产生重复记录。
- 重启 Passagen Web 和 Passagen CLI 后，标签编辑仍然保留。
- 元数据编辑被标记为 `user` 来源，并能经受 Passagen 元数据刷新。
- 并发修改会收到冲突响应，而不是静默覆盖较新的数据。
- 写入失败时恢复前端状态，或明确标记未保存状态。

## M6：论文集合

**状态：已完成。** 应用现在提供独立的 Collections 工作区、Library 集合与未归类筛选、批量成员分配、确定性原子重排，以及保留集合顺序和返回上下文的共享阅读器。成员备注继续按需延期到 M8 集合综合。

### 信息架构

- 在应用顶层提供 `Library` 与 `Collections` 两个入口。Library 保持 `Find -> Papers -> Read` 的检索与阅读职责；Collections 使用独立管理页面承载集合生命周期、成员顺序和备注，避免把整理控件继续堆入三栏浏览界面。
- Library 默认浏览 `All papers`，并将集合成员关系作为可与搜索、标签、年份和状态组合使用的筛选维度；同时支持浏览尚未加入任何集合的论文。
- Library 中选择具体集合时可以按集合顺序浏览，但其他临时排序不得改变集合持久化顺序；界面提供进入对应集合管理页的明确入口。
- Library 负责从筛选结果中多选论文并批量加入集合。操作完成后可以直接进入目标集合；Collections 中的“添加论文”操作则返回 Library 并进入面向目标集合的选择状态，避免重复实现论文搜索器。
- Collections 默认使用集合导航与集合工作区两栏，而不是复制 Library 三栏。工作区负责编辑名称和描述、成员排序、移除及可选备注；阅读器按需打开。
- Reader 是 Library 和 Collections 共享的能力。从集合打开论文时保留集合上下文，上一篇和下一篇遵循集合顺序，退出阅读后返回原集合。

建议的浏览器路由为：

```text
/                                      Library（默认浏览全部论文）
/papers/{paper_id}                     Library 阅读上下文
/papers/{paper_id}/pdf                 Library PDF 阅读上下文
/collections                           集合导航
/collections/{collection_id}           集合管理工作区
/collections/{collection_id}/papers/{paper_id}
                                       集合阅读上下文
```

### 工作内容

- 实现集合创建、重命名、描述编辑及删除端点。
- 添加将单篇或多选论文加入集合的操作。
- 添加支持确定性手动排序和移除论文的集合详情。
- 拖拽、键盘或按钮重排后，通过单个原子请求持久化集合顺序。
- 如果综合工作流需要，为每个成员关系添加可选备注。
- 在论文库主界面提供 `All papers`、具体集合及未归类论文筛选。
- 添加 Library 与 Collections 一级导航，以及在筛选、批量加入、集合管理和阅读上下文之间的往返入口。

### 交付物

- 集合导航与管理 UI
- 多选论文整理工作流
- 有序集合详情界面

### 验收条件

- 用户可以创建集合，并从筛选后的搜索结果中加入所选论文。
- Library 默认显示全部论文，并可按具体集合或未归类状态浏览；刷新及前进、后退保留当前视图。
- 重复加入同一论文时操作幂等，或返回明确的领域错误。
- 重排结果在重启后保留，且不会产生重复或缺失位置。
- 从集合移除论文不会删除论文或其 artifact。
- 论文列表可以按集合成员关系筛选。
- 从集合进入阅读器后，上一篇和下一篇遵循集合顺序，退出后仍返回原集合。

## M7：本地分发与发布质量

### 工作内容

- 将 React 应用构建为 Python package 中的静态资源。
- 由同一进程提供 SPA 和 API，并正确处理 fallback 路由。
- 自动打开浏览器，并提供禁用选项。
- 检测端口冲突，避免为同一数据目录启动重复服务。
- 为本地写入端点添加 Origin 或启动 token 保护。
- 添加结构化日志，默认不暴露论文内容或本地 secret。
- 为浏览、阅读、标签和集合工作流添加端到端测试。
- 编写安装、升级、备份、兼容性和恢复文档。

### 交付物

- 可安装的 `passagen-web` Python package
- 单命令本地启动
- 版本兼容性检查
- 发布检查清单和用户文档

### 验收条件

- `uv tool install` 或文档中的等价方式可以安装可运行应用。
- 一个命令即可启动 API、提供 UI，并可选择打开浏览器。
- 生产启动不需要 Node.js 或前端开发服务器。
- 其他网站无法向本地应用发起未经认证的写入请求。
- 核心端到端工作流可以在临时真实 SQLite 数据库和 fixture artifact 上通过。
- 按升级说明操作会保留 Passagen 论文、标签和集合。

## M8：集合综合

该里程碑有意推迟到集合整理功能稳定之后。综合流程属于 Passagen；Passagen Web 负责配置、进度和结果视图。

### 拟定工作

- 在 Passagen 中定义综合运行记录和综合 artifact Schema。
- 创建运行记录时，对集合成员、顺序、论文摘要 artifact hash、Prompt 版本和模型创建快照。
- 在 HTTP 请求生命周期外执行综合并持久化进度。
- 在 Passagen Web 中展示生成内容、来源、失败信息和历史运行记录。
- 允许重新运行且不修改之前的综合 artifact。

### 拟定验收条件

- 集合成员发生变化后，历史综合结果仍然可复现。
- 重新生成论文摘要不会静默改变已有运行记录的输入。
- 每个叙述章节都能标识其来源论文。
- 浏览器断开连接不会取消或丢失正在运行的综合任务。

## 搜索演进

初始实现使用带索引的 SQL 筛选和不区分大小写的标题匹配，适用于包含数百至数千篇论文的本地论文库。

只有实际测量证明有需要时才添加 SQLite FTS5。索引可以包含标题、作者、期刊或会议、选定的结构化摘要字段和提纲文本。FTS 索引属于派生数据，必须能够从规范元数据及 artifact 重建。在定义独立检索用例和 embedding 生命周期之前，向量搜索仍不在范围内。

## 安全要求

- 默认只监听 loopback 地址。
- 不提供任意文件系统端点。
- 每个 artifact 都通过 Passagen 已知的论文和 artifact 类型解析。
- 打开文件前验证解析后的路径仍位于 `data_dir` 中。
- 使用参数化应用服务，不在路由层直接执行 SQL。
- 即使运行在 localhost，也要保护写入请求免受跨域攻击。
- 转义用户元数据并清理渲染后的 Markdown，默认不启用原始 HTML。
- 绝不在浏览器响应中放置 API key、Provider 凭据或完整 Passagen 配置。
- 向浏览器返回简洁错误，将敏感诊断信息保留在本地日志中。

## 测试策略

| 层级 | 覆盖范围 |
| --- | --- |
| Passagen 单元测试 | Catalog 不变量、规范化、排序和用户元数据优先级 |
| Passagen 集成测试 | 迁移、SQLite 事务和 artifact 路径安全 |
| Web API | HTTP 校验、响应 Schema、错误、Range 请求和写入冲突 |
| 前端单元测试 | 筛选状态、标签编辑器、集合操作和阅读器 |
| 端到端测试 | 浏览、搜索、阅读 Summary/Outline/PDF、编辑标签和整理集合 |

测试使用临时数据库和生成的 fixture artifact，不得读取或修改开发者的真实 `data/` 目录，也不得调用外部元数据或 LLM 服务。

## 首个版本定义

M0 至 M7 全部通过验收，并且用户可以可靠完成以下操作时，首个版本即视为完成：

- 使用现有 Passagen 数据目录启动 Passagen Web。
- 浏览论文且不暴露存储实现细节。
- 搜索、筛选、排序和导航论文库。
- 阅读经过校验的 Summary 和 Outline artifact。
- 打开受管理的 PDF 并跟随证据页链接。
- 创建和编辑持久化标签。
- 创建有序论文集合并管理其成员。
- 重启或升级应用且不丢失用户整理数据。

M8 集合综合属于后续版本，不是首个论文浏览与整理版本的必要条件。
