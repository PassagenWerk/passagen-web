# Passagen Web 架构

Passagen Web 是 Core 的本地 HTTP 与浏览器适配器。它负责服务生命周期、browser-facing API、
后台 run 执行和 React UI，不拥有共享业务或数据库 schema。

## 依赖方向

```text
React UI -> /api -> FastAPI routes -> passagen.catalog
                                \-> passagen.processing
```

Web 不导入 Core ORM model、不直接打开 SQLite、不扫描 artifact 目录，也不依赖 Passagen CLI。
共享边界见
Passagen Core 仓库的 docs/development/architecture.md。

## Runtime

`passagen-web serve` 解析 data directory、共享配置、监听地址和 allowed origins，验证数据库后
启动 Uvicorn。一个进程通过 library lock 独占 data directory。

长任务不在 HTTP request handler 中同步执行。`POST /api/processing-runs` 持久化 queued run
并返回 `202`；进程内单 worker 通过 Core `ProcessingService` 执行任务。服务重启会把遗留活动
run 标记为 interrupted。

## HTTP Boundary

所有业务 endpoint 位于 `/api`。`passagen_web.schemas` 定义 browser-facing request/response，
并与 Core storage record 解耦。Core error 被映射为稳定 HTTP status 和 error payload。

PDF endpoint 只提供已登记且通过校验的 `original_pdf` artifact，支持 byte range、ETag 和
Last-Modified，不返回本地文件路径。

写请求验证 browser origin。直接访问服务自身 origin 自动允许；额外 origin 由
`--allow-origin` 显式添加。

## Frontend Boundary

- TanStack Query 管理 server state 和 cache invalidation。
- React Router 与 URLSearchParams 管理导航、筛选和 reader context。
- `frontend/src/api` 统一封装 HTTP contract。
- Feature 组件按 papers、processing、collections、tags 和 reader 组织。
- Theme、字号和临时 popover 状态属于浏览器本地状态。

Production build 输出到 `src/passagen_web/static`，由同一 FastAPI 进程提供 UI、API 和 SPA
fallback。Vite 开发服务器只用于前端开发，并将 `/api` 代理到本地 FastAPI。

## Processing UI

Header 使用低频全局 query 显示 active/idle 状态，活动 run 提高刷新频率。Paper Reader 的
stage reset 使用共享 paper-level controller，防止每个按钮建立重复 query。

Metadata、Summary 和 Outline reset 遵循从该阶段向后重建的 Core 语义。Abstract clean 是
独立非阻塞阶段，只刷新 cleaned view。所有 destructive reprocess 操作都需要明确确认。

## 测试边界

- Python tests 覆盖 route、schema、runtime lock 和 Core error mapping。
- Vitest 覆盖组件状态、请求 payload 和可访问交互。
- Playwright 通过 packaged static UI 和 FastAPI 验证主要用户工作流。
