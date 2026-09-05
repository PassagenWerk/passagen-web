# Roadmap: Tag 筛选、赋值与管理界面

本文档定义 Passagen Web 对 Library Tags 交互的下一阶段改进计划。基础 Tag 数据模型、
CRUD API 和论文 Tag 分配已经完成；本阶段不重新设计领域模型，而是将筛选、论文赋值和
全局管理拆成清晰的工作流，并让大量 Tag 下的界面仍然可用。

## 背景

当前 Tag UI 分布在两个位置：

- Library 的 Find 栏同时包含单 Tag 筛选和可展开的全局 Tag Manager；
- Paper 的 `Edit Library Data` 同时包含书目元数据编辑和当前论文的 Tag 分配。

这带来四个主要问题：

1. 全局 Tag Manager 与 Find 的检索职责不一致，并且每个 Tag 都渲染为一整行编辑表单；
   Tag 增多后 Find 栏会变得很长。
2. Find 只支持选择一个 Tag，无法表达论文必须包含一组 Tag 或包含其中任意 Tag。
3. Tag 分配入口位于 Paper 头部。阅读较长 Summary 或 Outline 时，用户需要滚回顶部，
   打断当前阅读位置和思路。
4. 阅读中需要的新 Tag 必须先在左侧 Manager 创建，再返回 Read 勾选并保存，跨栏往返
   过多。

## 产品目标

完成后的主要工作流应为：

```text
按多组 Tag 查找论文
  -> 打开论文并持续阅读
  -> 在当前阅读位置打开 Tag Picker
  -> 选择已有 Tag，或创建并立即分配新 Tag
  -> 不离开阅读上下文继续阅读
```

全局维护工作流应为：

```text
从 Tag 筛选器或论文 Tag Picker 进入 Manage library tags
  -> 搜索并选择一个 Tag
  -> 重命名、改色或删除
```

## 设计原则

### 按任务拆分入口

- Find 只负责筛选，不直接展开全局 CRUD 表单。
- Read 只负责查看和修改当前论文的 Tag。
- 独立 Tags 工作区负责创建、重命名、改色和删除全局 Tag。
- Paper Keywords 继续保持生成、只读，并与 Library Tags 明确区分。

### 阅读中的操作不改变阅读位置

Summary、Outline、Tag 和字号控件使用同一条 sticky 阅读工具栏。打开、分配或创建 Tag
不得将阅读区域滚回 Paper 头部，也不得强制导航到另一个页面。

### 大量 Tag 默认可控

Tag 选择器必须提供搜索和有界滚动区域。收起状态只展示有限数量的已选 Tag 和剩余数量，
不得因为 Tag 总数或选择数量增加而无限撑高 Find 或 Read。

### 筛选状态属于 URL

选中的 Tag 和匹配方式应保存在 URL 中，以支持刷新、前进、后退和分享。Tag 编辑面板的
开关状态不进入 URL。

## 信息架构

### Find：多 Tag 筛选

移除 Find 中现有的展开式 `Manage Library Tags`，用多选 Tag Filter 替换单选框：

```text
TAGS                                      MANAGE
┌──────────────────────────────────────────────┐
│ Systems  Priority  +2                      v │
└──────────────────────────────────────────────┘
```

展开面板包括：

- Tag 搜索框；
- 带颜色点的多选列表；
- 已选择 Tag 优先显示；
- `Match all` / `Match any` 选择；
- 清除全部 Tag 条件；
- 有界高度和内部滚动。

收起时最多显示两个 Tag，其余显示 `+N`。`Manage` 是进入全局 Tags 工作区的链接，不在
Find 内渲染管理表单。

匹配语义：

- `all` 为默认值，论文必须包含所有选中的 Tag；
- `any` 表示论文包含任意一个选中的 Tag；
- 第一阶段不提供排除 Tag、布尔表达式或嵌套 Tag。

建议 URL 契约：

```text
/?tag=tag-a&tag=tag-b&tag_match=all
```

`tag` 使用重复查询参数，而不是逗号拼接，以避免 ID 转义和顺序解析问题。只有一个或零个
Tag 时省略 `tag_match`，其行为等价于 `all`。

### Read：上下文 Tag Picker

将 Tag 分配从 `Edit Library Data` 移到 Summary / Outline 工具栏：

```text
SUMMARY   OUTLINE                           TAGS 2   Aa
```

工具栏在阅读区内 sticky。`TAGS N` 显示当前论文已分配数量，展开后提供：

- 搜索已有 Tag；
- 当前已分配 Tag 置顶；
- 直接添加或移除 Tag；
- 没有精确匹配时显示 `Create and assign "Tag name"`；
- 保存中、保存失败和重试状态；
- 进入全局 Tags 工作区的次要链接。

Tag 切换采用即时保存，不再提供单独的 `Save tags` 按钮。新 Tag 使用统一默认颜色创建，
避免在阅读过程中强制选择颜色；用户可稍后在 Tags 工作区调整颜色。

创建并分配分为两个明确操作：

```text
POST /api/tags
PUT  /api/papers/{paper_id}/tags/{tag_id}
```

如果创建成功而分配失败，保留已经创建的全局 Tag，并显示“Tag 已创建但未能分配”的可重试
错误，不进行隐式删除。

完成 Read Picker 后，将 `Edit Library Data` 改名为 `Edit Metadata`，只保留标题、Venue
和年份等书目字段。

### Tags：全局管理工作区

新增路由：

```text
/tags
/tags/{tag_id}
```

第一版不增加一级导航项；入口位于 Find Tag Filter 的 `Manage` 和 Read Tag Picker 底部。
页面沿用 Collections 的索引加工作区结构：

- 左侧为可搜索、可滚动的紧凑 Tag 索引和固定的新建入口；
- 右侧只编辑当前选中的一个 Tag；
- 编辑项包括名称和颜色；
- 显示该 Tag 的论文使用数量；
- 删除操作显示影响范围并要求确认；
- 删除完成后，从 URL 筛选、论文缓存和当前选择中移除失效 Tag。

Tag 索引不为每个 Tag 同时渲染输入框、Save 和 Delete。颜色只作为颜色点或边框提示，
不作为大面积背景，保证 Light/Dark 模式下文字可读。

## 前端组件边界

提取共享的 Tag 选择基础组件，但不创建同时承担筛选、赋值和 CRUD 的巨型组件：

```text
TagPicker
  搜索、选择状态、颜色点、键盘操作、有界滚动、空状态

TagFilter
  URL 同步、all/any 语义、收起后的选择摘要

PaperTagPicker
  当前论文即时赋值、创建并分配、乐观状态和失败恢复

TagsPage
  全局 Tag 索引、详情编辑、删除确认和使用数量
```

Tag 数据继续由顶层 React Query 缓存共享。创建、重命名或删除后，必须使 `tags`、
`papers`、`paper` 及相关筛选结果失效或得到精确更新。

## Core 与 Web API 契约

### 多 Tag 筛选

当前 Core `PaperFilters` 只包含单个 `tag_id`，Web API 也只接受单个 `tag: str | None`。
多选筛选必须在数据库查询层完成，不能只过滤当前前端分页，否则 `total`、分页和排序会错误。

Core 需要表达：

```python
tag_ids: tuple[str, ...] = ()
tag_match: Literal["all", "any"] = "all"
```

查询规则：

- `any`：存在至少一条 `paper_tags.tag_id IN (...)`；
- `all`：每个请求的 Tag 都存在于论文 Tag 集合，可使用分组后的
  `COUNT(DISTINCT tag_id) == len(tag_ids)` 或等价的多个 `EXISTS`；
- 多 Tag 查询不得因 join 产生重复 Paper；
- `total` 必须与实际筛选结果一致；
- 未知 Tag ID 返回空结果，而不是退化为无筛选。

Web API 将重复的 `tag` 参数解析为列表，并校验 `tag_match`。前端 API 使用
`URLSearchParams.getAll("tag")` / `append("tag", id)`，不得继续通过 `get` / `set`
丢失重复值。

### 单项 Tag 分配

为即时切换增加幂等端点：

```http
PUT    /api/papers/{paper_id}/tags/{tag_id}
DELETE /api/papers/{paper_id}/tags/{tag_id}
```

它们分别调用 Core 已有的 `add_paper_tag` 和 `remove_paper_tag`。重复添加或移除不存在的
关系应保持幂等，并返回更新后的 Paper，方便前端精确更新缓存。现有完整替换端点暂时保留
给批量调用者：

```http
PUT /api/papers/{paper_id}/tags
```

### Tag 使用数量

Tags 工作区需要 Tag 使用数量。优先扩展 Tag 列表投影，返回 `paper_count`，并由 Core 使用
聚合查询一次取得；不得由 Web 对每个 Tag 分别查询论文，避免 N+1 请求。

## Milestones

### M1：共享 Tag Picker 与阅读中快捷赋值

工作内容：

- 实现可搜索、有界滚动且支持键盘操作的 `TagPicker`；
- 为 Web API 增加单项 Tag 添加和移除端点；
- 将阅读工具栏改为 sticky，并加入 `TAGS N` 入口；
- 实现已有 Tag 的即时添加和移除；
- 实现 `Create and assign`，区分创建失败与分配失败；
- 从 `PaperLibraryEditor` 移除 Tag 区域，并改名为 `Edit Metadata`。

验收条件：

- 用户滚动到长 Outline 或 Summary 中部后，可以添加 Tag，阅读位置不变化；
- 用户可以在同一 Picker 内创建并分配新 Tag；
- 连续切换多个 Tag 不会发生旧响应覆盖新状态；
- 保存失败时 UI 恢复或明确标记未保存状态，并可重试；
- Picker 在桌面端和移动端均不超出可视区域；
- Light/Dark 模式下 Tag 颜色与文字保持可读。

### M2：多 Tag 筛选

工作内容：

- 扩展 Core `PaperFilters` 和数据库查询，支持 `all` / `any`；
- 扩展 Web API 重复 `tag` 参数和 `tag_match`；
- 将 Find 单选框替换为多选 `TagFilter`；
- 在 URL 中稳定保存多个 Tag 和匹配方式；
- 收起状态显示有限 Tag 摘要和 `+N`；
- 删除 Find 内现有的展开式 `LibraryTagManager`。

验收条件：

- `all` 只返回同时包含全部所选 Tag 的论文；
- `any` 返回包含任意所选 Tag 的论文；
- `total`、分页和排序在两种模式下均正确；
- 刷新、前进和后退保留筛选状态；
- Tag 数量较多时 Find 高度保持稳定，选择器内部可搜索和滚动；
- 清除筛选会移除所有重复 `tag` 参数和 `tag_match`。

### M3：全局 Tags 管理工作区

工作内容：

- 增加 `/tags` 和 `/tags/{tag_id}` 路由；
- 实现可搜索 Tag 索引和单项详情编辑；
- 增加 Tag `paper_count` 聚合投影；
- 提供新建、重命名、改色和带影响范围的删除确认；
- 从 Find 和 Read Picker 提供管理入口；
- 删除旧的逐行完整编辑器和不再使用的样式。

验收条件：

- 数十或数百个 Tag 不会产生同等数量的常驻编辑表单；
- 可以通过搜索快速定位并编辑一个 Tag；
- 删除前显示受影响论文数量；
- 重命名、改色或删除后，Library 列表、当前 Paper 和筛选状态一致更新；
- Tags 深层路由可以刷新，并能正确返回 Library 或阅读上下文。

### M4：可访问性与发布工作流

工作内容：

- 完成 Tag Picker 的焦点移动、Escape 关闭和焦点恢复；
- 检查触控目标、窄屏定位、滚动边界和 sticky 工具栏；
- 增加 Core、Web API、前端和 Playwright 覆盖；
- 使用大量 Tag fixture 验证搜索和渲染性能；
- 更新用户文档和 Changelog。

验收条件：

- Tag 筛选和论文赋值可只使用键盘完成；
- Picker 关闭后焦点返回触发按钮；
- 屏幕阅读器能识别选择数量、保存状态和 all/any 语义；
- 端到端测试覆盖筛选、阅读中赋值、创建并分配及全局管理；
- 生产构建中的 `/tags` 深层路由可直接刷新。

## 测试计划

| 层级 | 覆盖范围 |
| --- | --- |
| Core | all/any 查询、重复 ID、未知 ID、无重复结果、total 与分页 |
| Web API | 重复查询参数、匹配模式校验、单项添加/移除幂等性、使用数量 |
| 前端单元测试 | Picker 搜索、多选、URL 同步、即时保存、创建并分配、错误恢复 |
| Playwright | 长文阅读中赋值、多 Tag 筛选、Tags CRUD、移动端和深色模式 |

测试使用临时数据库和生成的 Tag fixture，不读取或修改真实论文库。至少包含：

- 一篇同时具有多个 Tag 的论文；
- 多篇只命中部分 Tag 的论文；
- 大量 Tag 的选择器场景；
- 创建成功但分配失败的场景；
- 删除正在被筛选和当前论文使用的 Tag 的场景。

## 非目标

本阶段明确不实现：

- 层级 Tag、父子关系或 Tag namespace；
- 任意布尔筛选表达式和排除 Tag；
- 自动把生成的 Paper Keywords 转换为 Library Tags；
- Tag 合并和批量重命名；
- 每个 Tag 的自定义图标；
- 多用户权限、共享 Tag 或服务端 UI 偏好；
- 在 Paper 正文中直接写入或修改生成 artifact。

## 实施顺序

```text
1. TagPicker 基础交互
2. 单项 Tag API + Read sticky Picker
3. Create and assign + 移除旧 Paper Tag 编辑区
------------------------------
首个可交付改进
------------------------------
4. Core/Web 多 Tag all/any 查询
5. Find 多选 TagFilter + 移除内嵌 Manager
6. /tags 全局管理工作区 + 使用数量
7. 键盘、移动端、大量 Tag 和端到端测试收尾
```
