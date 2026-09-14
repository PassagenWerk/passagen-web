# 后续产品能力

**状态：计划中**

Paper 与 Collection 的持久化问答、结构化问答归档、上下文路由、Collection synthesis 和
研究报告以 Passagen Core 的
`docs/roadmap/planned/collection-research-and-exploration.md` 为主规划。Web 只实现 API adapter
和浏览器 workflow，不在 FastAPI 或 React 中复制 prompt、检索、引用验证、重复问题检测或
stale 逻辑。

对应 Web 工作按以下顺序推进（1–4 已交付）：

1. Paper Ask 面板、conversation/turn API、持久化状态轮询和 citation navigation。
2. QaRecord archive/unarchive、搜索、结构化导出和 Previous answer 来源展示。
3. Source fingerprint、stale/partial 状态和重复问题复用的浏览器交互。
4. Collection workspace 的 `Synthesis | Reports | Ask`，以及长任务历史与恢复。
5. 当真实延迟证明 polling 不足时，再提供 SSE 和 provider token streaming。

其他后续 Web 工作根据 Core contract 和用户需求推进：

- 会议论文发现、获取审查和筛选 workflow。
- 覆盖结构化 artifact 内容的全文检索。
- [PDF 标记与标注](pdf-annotations.md)，包括专用 rendering layer、sidecar persistence 和
  后续 Ask 上下文集成。

这些能力尚未在 Web 中提供。共享业务行为必须先在 Core 实现，再增加浏览器 workflow。
