# Roadmap: Web 处理界面（PDF 导入、处理与进度）

本文档定义 Passagen Web 从只读浏览扩展到完整处理闭环的能力：在浏览器中上传 PDF、
触发处理、查看进度和失败原因，直至论文达到 `outlined` 状态并可阅读。

## 背景

本设计源自 Core 拆分讨论（2026-09-03）。当时的结论是：

> 应该拆 Core；Web 也适合增加处理能力，但它不是简单补几个操作页面，而是需要先
> 建立可靠的后台任务和进度模型。先完成 Core 拆分，暂缓 Web processing UI。

前置条件现已满足：

- `passagen-core` 拆分已完成，CLI 和 Web 均通过 Core 公开接口工作；
- 处理 pipeline（scan → resolve_metadata → parse → summarize → outline）稳定，
  具备幂等、断点恢复和状态持久化能力；
- 数据库已有 `processing_runs` 和 `llm_calls` 记录。

当前缺口：Web 只能阅读处理完成的论文，导入和处理完全依赖 CLI
（`passagen scan` / `passagen run` / `passagen update`）。

## 产品目标

用户真正需要的操作是：

```text
导入论文
处理论文
重新处理
查看进度
查看失败原因
```

而不是理解并手动点击：

```text
metadata -> parse -> summarize -> outline
```

目标闭环：

```text
浏览器上传 PDF
  -> 内容寻址导入（复用现有 scan 逻辑）
  -> 后台处理 run（queued -> running -> completed/failed）
  -> 轮询 / SSE 进度
  -> outlined
  -> 现有 reader 界面阅读 Summary / Outline / PDF
```

## 设计原则

### 普通用户只接触 update 语义

Web 不把每个内部 stage 做成独立按钮。产品入口只有三个：

- `Process` / `Continue processing`：推进到当前最新实现阶段；
- `Reprocess`：高级选项，允许选择从 metadata、parse 或 summary 重建；
- `Process pending papers`：批量推进所有落后论文。

具体 stage 只作为状态展示和高级选项出现，与 CLI 的 `update [paper-id] [--force]`
语义保持一致。

### 不在 HTTP 请求线程内同步执行长任务

不允许：

```http
POST /api/papers/{id}/summarize
```

然后在 FastAPI handler 中等待 LLM 完成。处理可能持续数分钟，必须处理：

- 客户端断开；
- 重复提交；
- 数据库写锁；
- 任务进度；
- 失败恢复；
- 服务关闭；
- 同一 paper 的并发处理。

所有处理通过持久化的 run contract 异步执行。

### 业务逻辑全部在 Core

Web 不复制 stage 编排、状态转换或恢复语义。CLI 和 Web 调用同一个
`ProcessingService`，同一操作从任一端发起产生一致的 run、LLM call 和诊断
artifact。

## Core 契约

本节定义 Web 处理功能对 Core 的契约要求，与本文档 M1 对应（同 Web 首版 roadmap 的
M1 Catalog 契约模式）。run 持久化、状态转换和恢复的稳定语义由 Core 文档承载，本节
只规定 Web 所需要的最小接口。

### ProcessingService

在 Core 中提供与适配器无关的处理入口：

```python
class ProcessingService(Protocol):
    def start_update(
        self,
        paper_ids: list[str],
        *,
        mode: Literal["continue", "rebuild"] = "continue",
        from_stage: str | None = None,
    ) -> ProcessingRun: ...

    def get_run(self, run_id: str) -> ProcessingRun: ...

    def list_runs(
        self,
        *,
        status: str | None = None,
        limit: int = 50,
    ) -> list[ProcessingRun]: ...
```

`continue` 对应现有 `update`；`rebuild` + `from_stage` 对应 `update --force` 的
显式重建语义，不允许 Web 发明第三种恢复规则。

### ProcessingRun

```python
class ProcessingRun(BaseModel):
    id: str
    paper_ids: list[str]

    mode: Literal["continue", "rebuild"]
    from_stage: str | None = None

    status: Literal[
        "queued", "running", "completed", "failed", "interrupted"
    ]

    current_paper_id: str | None = None
    current_stage: str | None = None

    created_at: datetime
    finished_at: datetime | None = None

    error: str | None = None
```

规则：

- run 状态持久化到数据库，不只存在于内存；
- 同一 paper 不允许并发的 queued/running run，冲突请求返回稳定错误；
- 服务重启后，queued/running 的 run 必须进入明确的 `interrupted` 状态，
  不能永久显示为运行中；
- 单篇失败不中止整个批量 run，结果汇总 updated/skipped/failed。

### ProgressEvent

Core 发出结构化进度事件，由适配器决定展示方式：

```python
class ProgressEvent(BaseModel):
    run_id: str
    paper_id: str | None
    stage: str
    current: int
    total: int
    message: str
```

CLI 渲染为终端进度；Web 提供给轮询接口或 SSE。Core 不知道最终展示形式。

### 日志与诊断

沿用 Core 拆分确立的统一规则（见
[`passagen-core/docs/roadmap-collection-research-and-exploration.md`](../../passagen-core/docs/roadmap-collection-research-and-exploration.md)
的"日志与诊断"一节）：

- LLM prompt、raw response 和校验错误由 Core 统一持久化为 run artifact；
- 普通日志、HTTP access log 不保存完整 prompt、论文正文；
- 任何记录中禁止出现 API key。

## Web API

```http
POST /api/processing-runs
GET  /api/processing-runs
GET  /api/processing-runs/{run-id}
GET  /api/processing-runs/{run-id}/events
```

创建请求：

```json
{
  "paper_ids": ["paper-id"],
  "mode": "continue"
}
```

或：

```json
{
  "paper_ids": ["paper-id"],
  "mode": "rebuild",
  "from_stage": "metadata"
}
```

响应使用 `202 Accepted`：

```json
{
  "id": "run-id",
  "status": "queued"
}
```

前端首版轮询状态，之后按需要增加 SSE。同一 paper 已有活跃 run 时返回 `409`。

PDF 导入单独提供上传端点：

```http
POST /api/papers/import
```

接受 multipart 多文件上传，响应汇总：

```json
{
  "added": ["paper-id"],
  "duplicates": ["paper-id"],
  "failed": [{"filename": "x.pdf", "reason": "not_a_pdf"}]
}
```

上传与处理是两个独立操作：导入成功只创建 `discovered` 状态的 Paper，是否处理由
用户显式触发 `Process`。这保持了导入的可预期性，也避免一次大上传直接触发大量
LLM 调用。

## 配置来源

Web 获得处理能力后，服务进程需要 GROBID、LLM、pipeline 等配置。规则：

1. **配置与数据同处**：配置的规范位置是 `<data_dir>/passagen.yaml`，与数据库、
   PDF、artifact 和 run 诊断放在同一个受管理目录：

   ```text
   data/
   ├── passagen.yaml        # 唯一规范配置位置
   ├── passagen.db
   ├── pdfs/
   ├── papers/
   └── runs/
   ```

   库因此成为自包含单元：整体复制 `data_dir` 即完整迁移配置与全部状态，
   CLI 和 Web 不可能因为启动目录不同而静默用错配置。

2. **统一读取**：CLI 和 Web 都通过 Core 的 `load_settings()` 从
   `<data_dir>/passagen.yaml` 加载，只读这一份文件：

   ```bash
   passagen update                       # data_dir 默认 ./data/
   passagen-web serve --data-dir data/   # 无需新增配置参数
   ```

   显式 `--config` 保留为测试和特殊场景的逃生口；`PASSAGEN_*` 环境变量继续在
   最上层合并；API key 仍只来自进程的环境变量（`api_key_env`），不进入任何
   API 响应。

3. **循环依赖约束**：必须先由 `--data-dir` 定位配置文件，因此配置文件中出现
   `data_dir` 字段时直接报 `ConfigError`。配置中的相对路径（如
   `facts_prompt_path`）相对配置文件所在目录解析，prompt 文件可随库迁移。

4. **迁移**：若旧的 `./passagen.yaml` 与 `<data_dir>/passagen.yaml` 同时存在，
   报 `ConfigError` 要求消除歧义；只存在旧位置时给出明确的移动提示。
   实施本 roadmap 时需同步更新 `passagen-core/docs/architecture.md`、
   `operations.md` 和 `roadmap.md` M0 中"配置从 `./passagen.yaml` 读取"的约定。

5. **启动时加载一次**：Web 是长驻进程，配置修改后需要重启服务生效。启动日志
   必须打印实际使用的配置路径；后续按需再评估热加载。

6. **Run 级配置快照**：库生命周期内配置仍可能被编辑，因此创建 run 时将本次
   运行实际使用的 provider、model、prompt 版本和 token 预算快照进
   `data_dir/runs/<run-id>/run.json`，保证单次运行的可复现性。

明确不实现：

- 将配置存入 SQLite（不可版本化、不可 diff）；
- Web 端配置编辑界面；
- 在 `data_dir` 之外维护第二份规范配置。

## 后台执行

首版使用单进程、单 worker 的进程内队列：

- 不需要分布式任务系统；
- 任务状态必须持久化，重启可恢复或可明确标记中断；
- 写数据库沿用现有短事务规则，不在持有写事务时调用 GROBID、Crossref 或 LLM；
- 外部服务不可用时复用现有 `ProviderHealthSnapshot` 降级语义，不阻塞无关页面。

## UI 设计

### 信息架构

在应用顶层增加 `Processing` 入口，与现有 `Library`、`Collections` 并列：

```text
Library       查找、筛选和阅读论文
Collections   整理和维护论文集合
Processing    导入、处理、监控和恢复任务
```

处理工作流使用独立工作区，避免把上传、批量操作、run 监控和失败诊断继续堆入
Library 的三栏浏览界面。`Manage` 不作为页面名称，因为它无法区分论文处理、集合、
标签和 metadata 等多种管理职责。

建议的浏览器路由为：

```text
/processing                         处理工作区
/processing/runs/{run_id}           单次 run 详情
```

Processing 是处理任务的主要入口，但 Library 和 Paper 仍提供上下文状态及单篇快捷
操作，用户无需为推进当前论文而强制离开阅读上下文。

### Processing 页面

- PDF 上传入口（多文件、拖放）及导入结果反馈（新增 / 重复 / 失败及原因）；
- 待处理、处理中和失败论文视图；
- `Process pending papers` 批量入口；
- 最近 runs、整体进度、结果汇总和稳定的失败分类；
- 批量重试，以及 `Reprocess from...` 高级选项；
- 可从论文或 run 进入对应 Paper 页面。

### Library 页面

- 保持现有查找、筛选和阅读职责；
- 论文条目显示处理状态和失败标记，不展开完整诊断；
- 提供进入 Processing 工作区的明确入口；
- 可按处理状态筛选论文，但不承载上传、批量处理或 run 管理。

### Paper 页面

- 未完成论文显示 `Process` / `Continue processing`；
- 处理中显示当前 stage、进度和预计状态；
- 已完成论文显示 `Reprocess`，高级选项允许选择起始 stage；
- 失败时显示稳定的错误分类和重试入口；
- 提供进入对应 run 详情的入口；
- 保留现有 reader、collection、tag 和 metadata 编辑功能不变。

### 状态呈现

- 处理状态使用与 CLI 一致的阶段名：discovered、metadata_resolved、parsed、
  summarized、outlined；
- 进度来自 `ProgressEvent`，失败原因来自稳定错误分类，不向浏览器暴露
  Python traceback 或 artifact 绝对路径。

## Milestones

### M1：Core ProcessingService 与 run contract

工作内容：

- 将现有 stage 编排整理为适配器无关的 `ProcessingService`；
- 定义 `ProcessingRun`、`ProgressEvent` 和持久化；
- 实现冲突检测与中断恢复规则；
- CLI 的 `update` 改为经由同一 service 执行，行为不变。

验收条件：

- `passagen update` 输出与之前一致；
- 同一 paper 并发 run 被拒绝；
- 中断后重启不产生永久 running 的 run。

### M2：Web processing-runs API 与单 worker runner

工作内容：

- `POST/GET /api/processing-runs`；
- 进程内单 worker 队列，状态持久化；
- 轮询 events 端点；
- 配置规范位置迁移到 `<data_dir>/passagen.yaml`，CLI 和 Web 统一经
  `load_settings()` 读取（含旧 `./passagen.yaml` 的迁移提示）。

验收条件：

- 长任务返回 `202`；
- 页面可查看 queued/running/completed/failed/interrupted；
- 服务重启后运行中任务进入明确状态；
- CLI 和 Web 读取同一份 `<data_dir>/passagen.yaml`，处理行为一致；
- 配置中出现 `data_dir` 字段时报 `ConfigError`；
- 修改配置并重启后，新 run 使用新配置，历史 run 的快照不变。

### M3：Paper 快捷操作与 Processing 状态工作区

工作内容：

- 添加 `Processing` 一级导航和 `/processing` 路由；
- Processing 页面展示待处理、处理中、失败论文和最近 runs；
- Paper 页面提供单篇 Process / Continue / Retry 快捷操作；
- Library 展示简要处理状态，并提供 Processing 入口；
- 当前 stage、进度和失败原因展示。

验收条件：

- 从浏览器可将一篇新导入论文推进到 `outlined`；
- 失败论文显示可理解的错误分类；
- Library 保持查找、筛选和阅读布局，不承载完整 run 管理界面；
- 可从 Processing 或 Paper 进入对应 run 详情。

### M4：PDF 上传与批量处理

工作内容：

- `POST /api/papers/import` 多文件上传；
- 复用 Core 内容寻址导入与去重；
- Processing 页面提供上传入口与 `Process pending papers`；
- Processing 页面提供批量重试和 `Reprocess from...` 高级选项。

验收条件：

- 重复上传同一 PDF 不产生重复 Paper；
- 损坏文件与非 PDF 不中断整个上传批次；
- 批量处理隔离单篇失败并输出汇总。

### M5：进度实时化（可选）

仅在轮询体验被实际使用证明不足后：

- SSE 或 WebSocket 进度推送；
- 上传进度显示。

## 非目标

本阶段明确不实现：

- 分布式任务队列和多 worker 调度；
- 逐 stage 独立操作按钮；
- Web 端配置编辑界面（配置来源见"配置来源"一节）；
- 多用户和权限模型（仍默认 loopback 单用户）；
- 自动下载 PDF（发现与筛选 roadmap 已明确人工下载边界）；
- 对现有 pipeline 算法的重写。

## 与其它 Roadmap 的关系

- [`passagen-core/docs/history/roadmap-core-split.md`](../../passagen-core/docs/history/roadmap-core-split.md)：
  前置条件，已完成；当时"Web 论文处理页面"列为拆分阶段的非目标，由本文档承接。
- [`passagen-core/docs/roadmap-collection-research-and-exploration.md`](../../passagen-core/docs/roadmap-collection-research-and-exploration.md)：
  共享 run contract、`202 Accepted` 模式和日志诊断规则，两者不得各自发展出
  不一致的后台任务模型。
- [`passagen-core/docs/roadmap-discovery-and-screening.md`](../../passagen-core/docs/roadmap-discovery-and-screening.md)：
  该功能输出人工下载清单；用户下载 PDF 后可经本文档的上传界面导入，
  形成"发现 → 筛选 → 人工下载 → Web 上传 → 处理 → 阅读"的完整链路。

## 实施顺序

```text
1. ProcessingService 与 run/progress contract（Core）
2. CLI update 切换到同一 service（行为不变）
3. Web processing-runs API + 单 worker runner
4. Processing 状态工作区 + Paper 快捷操作 + Library 状态入口
------------------------------
首个可交付版本
------------------------------
5. Processing 页面 PDF 上传 + 批量处理 + Reprocess 高级选项
6. SSE 实时进度（按需）
```
