# PDF 标记与标注

**状态：计划中**

## 目标

在 Passagen Web 的 PDF 阅读器中提供轻量、可靠的标记和批注能力，并为后续标注检索、
Ask 上下文引用以及带标注 PDF 导出保留扩展空间。

首个可交付版本包括：

- 文本高亮。
- 页面区域框选。
- 为高亮或区域添加、修改批注文字和颜色。
- 删除标注，以及从标注列表定位到对应页面。
- 标注随 Paper 持久化，重新打开 PDF 后可恢复。

## 技术方向

当前阅读器通过浏览器原生 PDF `iframe` 展示 `/api/papers/{paper_id}/pdf`。原生查看器内部
DOM、文本选择和缩放行为不可由应用可靠控制，因此不能在现有 `iframe` 外简单叠加标注。

计划使用 PDF.js rendering layer（React 中优先评估 `react-pdf`）替换内嵌原生查看器，
由应用控制 canvas、text layer 和 annotation overlay。保留现有 PDF API、按页导航和
在新标签页打开原文件的能力。

标注作为 sidecar data 存储，不修改原始 PDF：

- 页面位置使用 PDF 页面坐标或相对页面宽高归一化到 `0..1` 的矩形，避免缩放和响应式布局
  改变标注位置。
- 文本高亮同时保存选中文字；必要时保存前后文 selector，用于验证或重新定位。
- 一个跨行文本高亮可包含多个矩形。
- 标注记录关联 Paper，并包含类型、页码、颜色、批注内容和创建/更新时间。
- 保存 PDF fingerprint 或等价版本标识；原 PDF 被替换后不得静默套用可能失效的坐标。

建议的标注类型为 `highlight`、`area` 和 `note`。具体数据库模型和 repository contract
应先在 Passagen Core 中实现，Web 负责 API adapter 与浏览器交互。

## API 草案

Web API 预计提供：

```text
GET    /api/papers/{paper_id}/annotations
POST   /api/papers/{paper_id}/annotations
PATCH  /api/papers/{paper_id}/annotations/{annotation_id}
DELETE /api/papers/{paper_id}/annotations/{annotation_id}
```

创建和更新操作必须校验页码、标注类型、坐标范围和内容长度。接口响应使用服务端生成的
ID 与时间戳，前端通过 TanStack Query 更新和失效对应 Paper 的 annotation query。

## 交付阶段

1. 在 Core 增加 annotation schema、数据库迁移、repository/service contract 和测试。
2. 在 Web 增加 annotation API、校验、错误映射和 API 测试。
3. 用 PDF.js rendering layer 替换 `iframe`，保持现有页码链接、布局和 PDF 可用性错误处理。
4. 实现文本选择、区域框选、annotation overlay 和 CRUD 交互。
5. 增加标注列表、点击定位、键盘操作、移动端只读或受限编辑体验，以及端到端测试。
6. 评估将用户选择的标注作为 Paper Ask 的显式上下文来源。

## 非首版范围

- 手写、自由绘制、图章、签名和复杂图形工具。
- 多用户实时协作、权限和冲突合并。
- 直接覆盖原始 PDF。
- 在 Acrobat 等外部阅读器中直接显示 sidecar 标注。
- 扫描 PDF 的 OCR 选区生成；无 text layer 时首版仅提供区域标注。

未来如有明确需求，可增加“导出带标注副本”。该能力应生成新文件，并单独评估 PDF
annotation 写入库的兼容性、许可证和文件完整性，不改变原始 artifact。

## 验收标准

- 标注在不同缩放级别、面板宽度和页面重载后仍与原内容对齐。
- 多行文字可生成并恢复一个包含多个矩形的高亮。
- 页面切换和现有 citation navigation 能打开正确页，并显示该页标注。
- PDF 缺失、损坏或已被替换时提供明确状态，不丢失或错误覆盖已有标注。
- 桌面端支持完整 CRUD；移动端至少可以查看标注并安全定位。
- 原始 PDF 文件保持不变。
