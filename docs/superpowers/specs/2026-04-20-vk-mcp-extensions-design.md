# VK MCP 编排能力扩展 — 主设计文档

**状态:** Draft v4.1(round 4 claim 验证:修正 `stream_normalized_logs` 返回类型、去除不必要的 serde 改造、`McpServer` struct 命名、WorkspaceSummary 字段类型、§2 D12 交叉引用)
**日期:** 2026-04-20
**作者:** Claude(协作:phuongmumma35@hotmail.com)
**前置 PR:** `0095e565` "MCP error transparency"(PR1 — 在 MCP 反序列化侧扩展了 `ApiResponseEnvelope.error_kind` + 分类器)

---

## 1. 目标

让 Vibe Kanban 支持 **会话派生会话** 的编排模式:一个 *manager* MCP 会话能创建持久化 todo 项、派生 child 会话执行它们、观测每个 child 的状态和产出、聚合结果。

具体来说,manager 的 prompt 应该能够:

1. 创建 N 个持久化 todo(在 VK UI 中可见,会话重启后仍存在)
2. 为每个 todo 派生一个或多个 child workspace
3. 轮询 child 状态,带结构化错误信息
4. 读取 child 会话产出而不撑爆 manager context
5. 当 child 完成时更新 todo 状态

当前的 MCP 表面只支持步骤 2。步骤 1、3、4、5 都被缺失或半成品的能力阻塞。

## 2. 背景 — 当前的摩擦

VK MCP 服务(`crates/mcp/`)目前暴露 22 个 tool(workspace 启动、session 跟进、issue/repo/project 查询等)。有四个 gap 阻塞编排闭环:

1. **executor 失败不透明。** PR1 在 MCP 层 *透传* 了 `error_kind`,但服务端仍把所有 `ExecutorError` 变体桶到 `ErrorInfo::internal("ExecutorError")`(`crates/server/src/error.rs:498`)。manager 没有可机器识别的信号去分支(重试?放弃?叫人?)。
2. **没法读 child 会话产出。** MCP `get_execution` tool 仅返回元数据;`final_message` 字段被硬编码为 `None`(`crates/mcp/src/task_server/tools/sessions.rs:354`)。manager 能派生 child,但拿不到结果。
3. **Task entity 半成品。** `db::models::task::Task` 有 `parent_workspace_id` 和 `status` 字段,且被 `Workspace.task_id` 引用,但只有 `find_all` / `find_by_id`。没有 CRUD endpoint,没有 MCP wiring。manager 无处持久化 todo 列表。
4. **没有 UI 入口展示 manager 派生的 task 树。** 即便数据存在,观察者也无法追溯"哪个 manager 通过哪个 task 派生了哪个 workspace"。debug 编排失败几乎不可能。

**额外的阻塞性问题(v2 漏了):**

5. **Orchestrator 模式 scope 检查会挡住 manager → child 访问。** `scope_allows_workspace`(`crates/mcp/src/task_server/tools/mod.rs:322-337`)在 Orchestrator 模式下严格拒绝 scope 外的 workspace。manager scope 是自己,child workspace 是别的 ID,所以 `get_execution(child)` 会被直接拒绝。**必须放宽 scope 规则**让 manager 能访问自己派生的 children(见 D12)。

## 3. Scope — Tier A++(4 个 PR)

### In scope

| PR  | 主题                              | Server | MCP | UI |
|-----|----------------------------------|--------|-----|----|
| **PR-X1** | 错误透明                    | ✓      | ✓   |    |
| **PR-X2** | 读 child 会话产出           |        | ✓   |    |
| **PR-X3** | Task entity + 复合 tool + 并发护栏 + scope 放宽 | ✓ | ✓ |  |
| **PR-X4** | UI 展示 task 树             |        |     | ✓  |

### Out of scope

- MCP 传输稳定性 / 心跳 / 重连(暂无具体故障症状,延后)
- `batch_start` MCP tool(LLM 的 tool-loop 本身就是串行的;PR-X3 的 per-parent 并发上限提供 manager 需要的反压)
- SSE 推送订阅(`subscribe_session_events`)— LLM 节奏下轮询 `get_execution` 完全够
- 项目级标签 CRUD MCP wiring — 独立功能,延后
- 给现有的 `/api/workspaces/start` + `/api/workspaces/{id}/links` 两步流程加服务端事务包装。新的 `/api/tasks/start` 是原子的;旧的两步路径保持现状,留给调用方处理
- 多层 task 嵌套(Task → Task)。只支持 Workspace → Task → Workspace
- 鉴权 / 授权变化
- 远程(`crates/remote`)crate 的改动 — 只针对 local-deployment

### 依赖顺序

```
PR-X1(error envelope + stderr tail + get_execution 字段升级)
  ↓ 数据形状被消费
PR-X2(read_session_messages)
  ↓ 独立
PR-X3(Task CRUD + create_and_start_task + 并发上限 + scope 放宽)
  ↓ 数据模型被消费
PR-X4(UI breadcrumb + 分组)
```

合并顺序:X1 → X2 → X3 → X4。X2 和 X3 可并行分支。

---

## 4. PR-X1 — 错误透明

### 4.1 问题

`ApiError::Executor(_)` 把所有 `ExecutorError` 变体折叠成单一 500。PR1 在 MCP 侧的 `ApiResponseEnvelope` 加了 `error_kind`,但服务端的 `ApiResponse<T,E>`(`crates/utils/src/response.rs:5`)仍然只有 `{success, data, error_data, message}`。manager 收到 `success: false` + 一段自由文本 message,无法编程决定下一步做什么。

### 4.2 设计

**服务端:`crates/utils/src/response.rs`**

新增 `error` 对象(替代之前草案里的扁平 `error_kind`),携带 manager 分支需要的全部信息:

```rust
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct ApiResponse<T, E = T> {
    success: bool,
    data: Option<T>,
    error_data: Option<E>,
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    error: Option<ApiErrorEnvelope>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct ApiErrorEnvelope {
    /// 稳定的机器可读 kind。manager 据此分支。
    pub kind: String,
    /// 是否可以原样重试。
    pub retryable: bool,
    /// 自动重试是否无效(认证失败、缺二进制等)。
    pub human_intervention_required: bool,
    /// executor stderr 的最后 2 KiB,用于诊断展示。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr_tail: Option<String>,
    /// executor 程序名(如 "claude"、"codex")。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub program: Option<String>,
}
```

**服务端:`crates/server/src/error.rs`**

`ErrorInfo` 新增 `error: ApiErrorEnvelope`。被折叠的 line 498 展开为 5-kind 分类(刻意保持小;后续真有消费者再细分):

| `kind`                       | HTTP | `ExecutorError` 来源                                | retryable | human_intervention |
|------------------------------|------|----------------------------------------------------|-----------|--------------------|
| `executor_not_found`         | 500  | `ExecutableNotFound`                               | false     | true               |
| `auth_required`              | 500  | `AuthRequired`                                     | false     | true               |
| `follow_up_not_supported`    | 500  | `FollowUpNotSupported`                             | false     | false              |
| `spawn_failed`               | 500  | `SpawnError` / `Io` / 其他未列出的                  | true      | false              |
| `internal`                   | 500  | catch-all + 非 executor 类错误                      | true      | false              |

**D1 — executor 错误统一保持 HTTP 500。** manager 通过 `error.kind` 分支,而不是 status code。改成 401/424/409 会破坏现有客户端契约,收益为零。

**D2 — 5 个 kind 而不是 12 个。** 小集合更易于 switch。其他 `ExecutorError` 变体(`Json`、`TomlSerialize`、`CommandBuild` 等)统一映射到 `internal`,直到真有消费者要求细分。`kind` 是字符串,前向兼容。

**stderr tail 捕获(`crates/services/src/services/container.rs`)**

`ContainerService::start_execution`(`crates/services/src/services/container.rs:1133`)把失败写到 `MsgStore` 的 `LogMsg::Stderr`,但路由 handler 看不到。新增:

```rust
pub struct ExecutorFailureContext {
    pub error: ExecutorError,
    pub stderr_tail: Option<String>,   // ≤ 2048 字节 UTF-8,左侧用 "…" 截断
    pub program: Option<String>,
}
```

`ApiError::Executor` 变成 `Executor { source: ExecutorError, context: Option<ExecutorFailureContext> }`。自定义 `From<ExecutorError>` 让 `?` 操作符在 `context: None` 的情况下继续工作。

**升级 `get_execution` MCP tool**

> ⚠️ **v2 修正**:`get_execution` 已经返回 `status`(string label,见 `sessions.rs:351`)和 `final_message: None`(line 354)。本 PR **不是新增 status 字段**,而是:
> - 把现有 `status: String` 升级为 `status: ExecutionProcessStatus` enum(机器可识别)
> - 新增 `error: Option<ApiErrorEnvelope>`(失败时填充)
> - **保留** `final_message: None` 不动 — 由 PR-X2 的 `read_session_messages` 唯一负责读消息,避免双源维护(见 D11)

升级后的响应:

```rust
struct GetExecutionResponse {
    execution_id: String,
    session_id: String,
    status: ExecutionProcessStatus,                  // Running | Completed | Failed | Killed(从 string 升级)
    is_finished: bool,
    execution: serde_json::Value,                    // 现有完整序列化保留
    error: Option<ApiErrorEnvelope>,                 // 新增,status == Failed 时填充
    final_message: Option<String>,                   // 保持 None;manager 应改用 read_session_messages
}
```

输入仍然是 `execution_id`(不是 workspace_id)。

manager 轮询 `get_execution`;`status` 进入终态时停止轮询,失败时读 `error.retryable` / `error.human_intervention_required`。

### 4.3 PR 边界

- `crates/utils/src/response.rs` — `ApiErrorEnvelope`,`ApiResponse.error` 字段
- `crates/server/src/error.rs` — `ErrorInfo.error`,展开 `ApiError::Executor` 分支为 5-kind 映射;现有其他分支默认 `error.kind = error_type`,`retryable = true`,`human_intervention_required = false`
- `crates/services/src/services/container.rs` — `ExecutorFailureContext`,在 `start_execution` 中捕获 stderr tail
- `crates/server/src/routes/sessions/mod.rs` — `follow_up` handler 透传 context
- `crates/server/src/routes/workspaces/create.rs` — `create_and_start_workspace` handler 透传 context
- `crates/mcp/src/task_server/tools/sessions.rs` — `get_execution` 升级 `status` 类型 + 新增 `error` 字段
- `shared/types.ts` 通过 `pnpm run generate-types` 重新生成
- 测试:
  - 单元:`ApiResponse::error_full` 来回序列化 `error` envelope
  - 单元:每个 `ExecutorError` 变体 → 期望的 `kind` + flags
  - 集成:模拟 `ExecutableNotFound` → `kind: "executor_not_found"`、`retryable: false`、`human_intervention_required: true` + stderr tail

预估 diff:~500 LOC(含测试)。

---

## 5. PR-X2 — 读 child 会话产出

### 5.1 问题

manager 通过 `start_workspace` 派生 child,轮询直到 `status == Completed`,然后需要提取结果。`final_message: None` 在 `crates/mcp/src/task_server/tools/sessions.rs:354` 是死路。

朴素的"返回完整对话"风险是几万 token,会撑爆 manager 的 context。分页 + 合理默认值是必须的。

### 5.2 设计

> ⚠️ **v4 修正(round 3):** 此前草案以为消息存在 `CodingAgentTurn` 中,但代码核查发现 `CodingAgentTurn`(`crates/db/src/models/coding_agent_turn.rs:7-18`)只持久化 `prompt` / `summary` / `agent_session_id`,**不存对话消息**。VK 真正的消息持久化路径是:executor 输出 → `MsgStore`(内存环缓冲)→ `ExecutionProcessLogs.logs`(`crates/db/src/models/execution_process_logs.rs:8-14`,JSONL,持久化)→ 通过 `ContainerService::stream_normalized_logs` 还原为 `NormalizedEntry` 流。前端通过 WebSocket 消费同样的 `NormalizedEntry`。本 PR **必须复用 `NormalizedEntry`** 体系,而不是引入第二条平行的消息表面。

新 MCP tool `read_session_messages`:

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ReadSessionMessagesRequest {
    #[schemars(description = "要读取会话所属的 workspace ID。")]
    workspace_id: Uuid,
    #[schemars(description = "从尾部返回多少条消息。默认 20,最大 200。")]
    last_n: Option<u32>,
    #[schemars(description = "从第几条开始读(0-based)。设了之后覆盖 last_n。")]
    from_index: Option<u32>,
    #[schemars(description = "是否包含 thinking 内容(对应 NormalizedEntryType::Thinking)。默认 false 以降低 token 成本。")]
    include_thinking: Option<bool>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct ReadSessionMessagesResponse {
    messages: Vec<SessionMessage>,
    /// 过滤后该会话的总消息数(不只是返回的窗口)。
    total_count: u32,
    /// 是否还有比返回窗口更早的消息。
    has_more: bool,
    /// 便利字段:会话最后一条 assistant 消息的完整文本(不截断)。
    /// 由服务端从 NormalizedEntryType::AssistantMessage 中提取。
    /// 大多数 manager 查询只需要这个 — 不必扫描整个 messages 数组。
    final_assistant_message: Option<String>,
}

/// 单条消息。形状直接对齐 VK 已有的 NormalizedEntry,
/// 避免引入第二个不一致的消息模型。
#[derive(Debug, Serialize, schemars::JsonSchema)]
struct SessionMessage {
    /// 在过滤后流中的 0-based 索引。
    index: u32,
    /// 序列化后的 NormalizedEntryType discriminant,例如:
    /// "user_message" | "assistant_message" | "tool_use" | "system_message"
    /// | "error_message" | "thinking"。manager 根据这个 switch。
    entry_type: String,
    /// 完整内容文本。
    content: String,
    /// RFC3339,可能为 None(取决于 executor)。
    timestamp: Option<String>,
    /// NormalizedEntry.metadata 透传,供 manager 解析 tool_use 详情等。
    metadata: Option<serde_json::Value>,
}
```

**D3 — 默认 `last_n = 20`。** manager 的典型查询是"child 成功了吗、最后说了什么"。20 条覆盖大多数终态,token 成本约 2-5 KB。

**D4 — `final_assistant_message` 单独是顶层字段。** 99% 的 manager 查询只想要"child 最终说了什么"。直接 surface 它,不强迫每个 manager 解析 `messages` 数组。完整文本,不截断 — manager 在这里依赖完整性。

**D5 — `include_thinking = false` 默认关闭。** Thinking 块(`NormalizedEntryType::Thinking`,对应 Claude 的 reasoning 等)能让 token 成本翻 3-10 倍。默认关;manager 深度调试时再打开。**注意命名:** VK 内部统一用 "thinking"(见 `crates/executors/src/logs/mod.rs:121`),所以参数名也用 `include_thinking`,而不是更一般的 "reasoning"。

**D5a — 永久过滤的 entry types。** 以下 `NormalizedEntryType` 永远不返回给 manager,因为它们是 UI 流式状态、不属于"对话历史":
- `Loading` — 流式加载占位
- `TokenUsageInfo` — token 计数事件
- `NextAction` — UI hint
- `UserAnsweredQuestions` — 内部回调

manager 拿到的 `total_count` 也是 *过滤后* 的计数(否则 `last_n` 窗口会被噪声塞满)。

**D11 — `final_message` 字段策略:** PR-X1 升级后的 `GetExecutionResponse.final_message` 保持 `None`。manager 必须改用 `read_session_messages` 来读消息。理由:避免双数据源(get_execution 是元数据 + 状态,read_session_messages 是内容)同时维护。

**实现路径:**

1. **服务端新路由** `GET /api/sessions/{session_id}/messages?last_n=&from_index=&include_thinking=`
   - 通过 path 参数 `session_id` 按 `Session.id` 加载(`crates/db/src/models/session.rs:23-31`)
   - 找最新 `ExecutionProcess where session_id == session.id`(`crates/db/src/models/execution_process.rs:563-579` 已有 helper)
   - 调用 `ContainerService::stream_normalized_logs(&execution_id).await`(`crates/services/src/services/container.rs:830-833`)
     - 返回签名:`Option<BoxStream<'static, Result<LogMsg, io::Error>>>`
     - **注意:流元素是 `LogMsg`,不是 `NormalizedEntry`。** 需要 `collect` 并从中提取 `LogMsg::JsonPatch(patch)` 子集,然后按顺序 apply patch 到一个维护中的 `NormalizedConversation` 状态,得到最终 `Vec<NormalizedEntry>`。这是服务端从 patch 流重建对话快照的标准做法,前端 WebSocket 消费者也是这么做的(`packages/web-core/src/features/workspace-chat/model/hooks/useConversationHistory.ts:99-104`)。若前端侧已有纯函数版本可共享,复用之;否则在 `crates/utils/src/log_msg.rs` 附近提供一个小 helper `fn rebuild_entries(stream: Vec<LogMsg>) -> Vec<NormalizedEntry>`。
   - 过滤掉 D5a 永久剔除的 entry types;若 `include_thinking == false`,再剔除 `Thinking`
   - 在过滤后的列表上应用分页(`from_index` 优先于 `last_n`)
   - 提取最后一条 `entry_type == AssistantMessage` 作为 `final_assistant_message`

2. **`SessionMessage` 序列化:** `entry_type` 字段取 `NormalizedEntryType` 已有的 serde tag(`#[serde(tag = "type", rename_all = "snake_case")]`,见 `crates/executors/src/logs/mod.rs:71-72`)所产生的 discriminant 字符串。带内部字段的变体(`ToolUse { tool_name, action_type, status }`、`ErrorMessage { error_type }`)把这些字段合并进 `SessionMessage.metadata`,跟原有 `NormalizedEntry.metadata` 并到同一个 JSON 对象;如果 key 冲突以 entry 原始 metadata 优先(保守,避免破坏现有约定)。

3. **MCP tool 是薄包装** — 把 workspace_id 解析到 latest session_id,然后调上面的路由。

4. **复用现成基础设施** — 该路径已有 WebSocket 端点 `/api/execution-processes/{id}/normalized-logs/ws`(`crates/server/src/routes/execution_processes.rs:138-165`)在为前端服务,本 PR 提供的是同一数据源的 REST + 分页快照视图,不引入新的存储或解析层。

### 5.3 PR 边界

- `crates/mcp/src/task_server/tools/sessions.rs` — 新 tool `read_session_messages`
- `crates/server/src/routes/sessions/mod.rs` — 新路由 `GET /api/sessions/{id}/messages?last_n=&from_index=&include_thinking=`;handler 内部调 `ContainerService::stream_normalized_logs` 并重建 `Vec<NormalizedEntry>`
- `crates/utils/src/log_msg.rs` 或相邻位置 — 新增纯函数 `rebuild_entries(Vec<LogMsg>) -> Vec<NormalizedEntry>` 复用前端的 patch-apply 语义(如果已有共享实现,直接复用而非新增)
- `shared/types.ts` 重新生成

> ℹ️ **不需要改 `crates/executors/src/logs/mod.rs`。** 代码核查:`NormalizedEntryType` 已经带 `#[serde(tag = "type", rename_all = "snake_case")]`(line 71-72),产生的 discriminant 就是 `user_message` / `assistant_message` / `tool_use` / `thinking` 等 — 契约现成。
- 测试:
  - 单元:D5a 过滤(`Loading` / `TokenUsageInfo` / `NextAction` 不出现在输出中)
  - 单元:`include_thinking` toggle(on → Thinking 出现;off → 不出现)
  - 单元:分页计算(`last_n` 窗口、`from_index` 覆盖、`has_more` flag)
  - 单元:`final_assistant_message` 提取(空会话、最后是 tool_use、最后是 user_message 三种 case)
  - 集成:派生小 child → 等待 → 读 → 断言 `final_assistant_message` 匹配 executor 最后一条 assistant 输出

预估 diff:~350 LOC(含 NormalizedEntry 映射层)。

---

## 6. PR-X3 — Task entity + 复合 tool + 并发护栏 + scope 放宽

### 6.1 问题

四个独立 gap 共享一个 PR,因为它们形成一个连贯单元:

1. **没有持久化 todo 列表。** `Task` entity 只有 `find_all` / `find_by_id` — 没有 `create`、`update`、`delete`,没有路由,没有 MCP。
2. **主路径两步割裂。** 即使有了 Task CRUD,"创建 todo + 派生 child"还是要 `create_task` 然后 `start_workspace(task_id=...)`。10 个 todo 就是 20 次 RPC,加上非平凡的错误恢复菱形。
3. **没有反压。** manager 可能一次傻派 50 个 child,耗尽磁盘 / 进程数。
4. **Orchestrator 模式 scope 检查阻塞 manager → child 访问(新发现的阻塞)。** 见 §2 第 5 点和 D12。

### 6.2 设计

**服务端:Task CRUD endpoint**

```
POST   /api/tasks                          — 创建
GET    /api/tasks/{id}                     — 获取
PUT    /api/tasks/{id}                     — 更新(title、description、status)
DELETE /api/tasks/{id}                     — 删除(按 D13 事务级联清空 workspace.task_id)
GET    /api/tasks?parent_workspace_id=...  — 列表(按 parent 过滤)
```

`Task::create`、`update`、`delete` 在 `crates/db/src/models/task.rs` 中按 `workspace.rs` 现有模式新增。

**D13(新增)— `delete_task` 级联一致性方案:应用层事务 UPDATE-then-DELETE。**

代码核查发现:当前 schema 中 `workspace.task_id` **没有** `ON DELETE` 外键约束(FK 在早期迁移中被移除,用应用层关系替代)。这意味着 `DELETE FROM tasks WHERE id = ?` 会留下 dangling `workspace.task_id`,后续 `list_workspaces(task_id=X)` 行为不定义。

选三条路径之一:

| 方案 | 优点 | 缺点 |
|-----|------|------|
| (a) 加回 `ON DELETE SET NULL` FK 迁移 | DB 层强一致 | 需要 schema 迁移 + 对已存 dangling 数据做清洗;与当前"应用层关系"架构走向相反 |
| **(b) 应用层事务 UPDATE-then-DELETE** | 不改 schema;语义清晰;可读性高 | 依赖代码纪律(必须走 `Task::delete` 而非裸 SQL) |
| (c) 拒绝删除有关联 workspace 的 task | 最简单 | 把清理负担推给 manager,违反 D9 的"用户主动路径由用户决定"原则 |

**选 (b)**。理由:与 VK 当前"关系交给应用层管理"的设计一致;迁移风险为零;`Task::delete` 是唯一入口(MCP 与 REST 都走它),代码纪律成本可控。

```rust
// crates/db/src/models/task.rs
impl Task {
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;
        sqlx::query!("UPDATE workspaces SET task_id = NULL WHERE task_id = ?", id)
            .execute(&mut *tx).await?;
        sqlx::query!("DELETE FROM tasks WHERE id = ?", id)
            .execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
}
```

副作用:子 workspace 在 task 删除后变成 standalone(不再出现在 manager `list_tasks` 下),其自身历史保留。manager 应在 `delete_task` 前自行决定是否也 archive workspace。

**事务化 helper 抽取(为 `/api/tasks/start` 服务)**

当前 workspace 创建流程是 handler 层顺序调用多个服务方法,**不在** 单一 DB 事务中(见 `crates/server/src/routes/workspaces/create.rs`)。D6 规定只在新的 `/api/tasks/start` 提供原子性,因此新增一个纯 DB 层 helper:

```rust
// crates/services/src/services/workspace.rs(新函数)
pub async fn create_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    params: WorkspaceCreateParams,
) -> Result<Workspace, ServiceError>
```

`create_in_tx` 只做 DB 写(Workspace row + repo attaches + `task_id` 关联),**不** spawn agent 进程。`/api/tasks/start` handler:

```
1. tx = pool.begin()
2. Task::create_in_tx(&mut tx, task_params)
3. Workspace::create_in_tx(&mut tx, workspace_params, task_id = Some(t.id))
4. tx.commit()            ← 此前任何一步失败都干净回滚
5. ContainerService::start_execution(workspace.id)   ← 只有 commit 后才 spawn
```

旧的 `/api/workspaces/start` 保持现状(D6 明确 out-of-scope),但 `create_in_tx` 会作为新的权威 DB 层入口,后续若补齐旧路径也有基础。

**服务端:复合 endpoint — 原子的 create-and-start**

```
POST /api/tasks/start
body: {
  task: { project_id, title, description?, parent_workspace_id? },
  workspace: { name?, repos: [...], executor_config, prompt },
}
response: { task_id, workspace_id, execution_id }
```

单 DB 事务包裹 `{Task INSERT, Workspace INSERT, repo attaches, Workspace.task_id 关联}`。`start_execution`(派生 agent 进程的步骤)在事务 commit **之后** 才跑,所以事务内失败意味着什么都没派生,回滚干净。

**D6 — 仅在这个复合 endpoint 中通过 DB 事务保证原子性。** 通用的 `/api/workspaces/start` 端点保持现状。只有新的 `/api/tasks/start` 提供原子保证。其他 orphan window 在本 PR 中接受为 out-of-scope。

**服务端:per-parent 并发上限**

在 `POST /api/tasks/start` 和 `POST /api/workspaces/start`(后者当用 `task_id` 调用且该 task 的 `parent_workspace_id == Some(p)` 时),计数所有 workspace `W` 满足:`W.task_id IS NOT NULL` AND `Task[W.task_id].parent_workspace_id == p` AND `W` 的最新 `ExecutionProcess.status == Running`。如果 `count >= MAX_CHILDREN_PER_PARENT`(默认 5,可通过环境变量 `VK_MAX_CHILDREN_PER_PARENT` 配置),拒绝并返回:

```
HTTP 429 + error: { kind: "parent_concurrency_exceeded", retryable: true, human_intervention_required: false }
```

manager 用指数退避重试(或等某个轮询中的 child 完成后再试)。

**D7 — 上限在服务端而不是 MCP 端强制。** 未来可能有第二个 MCP 客户端(或直接 API 调用)绕过 MCP 端检查。服务端是正确的权威点。

**MCP tool — 5 个新增 + 2 个扩展**

```rust
// 新增
create_and_start_task(...)          // 主路径:复合的原子创建
create_task(...)                    // 用于"先建 todo 列表,稍后执行"
list_tasks(parent_workspace_id?)    // 默认按当前 MCP 调用方所在 workspace 过滤
get_task(task_id)
update_task_status(task_id, status) // status ∈ {todo, in_progress, in_review, done, cancelled}
delete_task(task_id)

// 扩展(已存在)
start_workspace(..., task_id?: Uuid)      // 可选 task_id,把新 attempt 绑定到已有 task
list_workspaces(..., task_id?: Uuid)      // 加 task_id filter(`crates/mcp/src/task_server/tools/workspaces.rs:102`)
                                          // 同时 WorkspaceSummary 加 task_id: Option<Uuid> 字段(否则结果分不清)
```

**D8 — `list_tasks` 默认按调用方 workspace context 过滤。** 当 MCP 服务有已知的调用方 workspace(Orchestrator 模式 — 见 `crates/mcp/src/task_server/tools/context.rs`),不带参数的 `list_tasks` 过滤为 `parent_workspace_id == caller`。manager 自然只看到自己的 todo。显式 `parent_workspace_id` 参数覆盖默认。当 MCP 服务没有已知调用方 workspace 且没有显式参数时,返回错误 `kind: "missing_parent_workspace_id"`(强制显式 scope,而不是无差别返回所有 task)。

**D9 — `create_and_start_task` 不需要 manager 端补偿**(由 D6 的服务端事务覆盖)。两步路径(`create_task` 然后 `start_workspace(task_id=...)`)如果 `start_workspace` 失败,manager 可以选择重试或调用 `update_task_status(task_id, Cancelled)` — 不自动清理。可接受:用户主动选了两步路径,恢复语义由用户决定。

**D12(阻塞性)— Orchestrator 模式 scope 放宽:允许访问自己派生的 children。**

`scope_allows_workspace`(`crates/mcp/src/task_server/tools/mod.rs:322-337`)目前在 Orchestrator 模式下严格拒绝任何 scope 外 workspace。这会挡住 manager 调用 `get_execution(child_execution_id)`、`read_session_messages(child_workspace_id)` 等所有跨 workspace 的操作。

放宽规则:在 Orchestrator 模式下,如果 target workspace `t` 满足以下任一条件,允许通过:

1. `t.id == scoped_workspace_id`(原有规则)
2. `t.task_id IS NOT NULL` AND `Task[t.task_id].parent_workspace_id == scoped_workspace_id`(新规则:t 是 scoped workspace 派生的 child)

**实现路径 — 走 HTTP,不在 MCP crate 引入 db 句柄。**

代码核查发现:MCP 服务结构 `McpServer`(`crates/mcp/src/task_server/mod.rs:50-56`)只持有 `reqwest::Client` 而没有 `SqlitePool`;把 db 句柄塞进 MCP crate 会破坏现有的 MCP→server 单向依赖契约,且 MCP 目前依赖 `db` 只是为了模型类型。因此 scope 检查通过 HTTP 两次查询完成。

**新增薄包装 `ApiClient`**(或等价:扩展 trait `McpHttpExt`,按 VK 现有 tool 文件的惯例选择):把裸 `reqwest::Client` 包一层,集中提供 `get_workspace(uuid) -> ApiResult<Workspace>` 和 `get_task(uuid) -> ApiResult<Task>`。理由:(1) 现有 MCP tool 代码里每个 HTTP 调用都在手写 `client.get(url).send().await` + 反序列化 `ApiResponseEnvelope`,这是明显重复;(2) D12 之后至少新增两个调用点,抽一次成本合理;(3) 便于 mock / 测试(参考已有 `response_classification` 测试模式)。

```rust
// crates/mcp/src/task_server/tools/mod.rs(改造后,示意)
pub async fn check_scope_allows_workspace(
    server: &McpServer,
    scope_cache: &mut HashMap<Uuid, bool>,   // 按 tool-call 生命周期创建
    target: Uuid,
) -> bool {
    let Some(scoped) = server.scoped_workspace_id() else { return true; };
    if target == scoped { return true; }
    if let Some(cached) = scope_cache.get(&target) { return *cached; }

    // 放宽规则 2:target 是 scoped 的 child?
    let allowed = async {
        let ws = server.api().get_workspace(target).await.ok()?;
        let task_id = ws.task_id?;
        let task = server.api().get_task(task_id).await.ok()?;
        Some(task.parent_workspace_id == Some(scoped))
    }.await.unwrap_or(false);

    scope_cache.insert(target, allowed);
    allowed
}
```

两次 HTTP RTT(workspace + task)在 LLM tool-loop 节奏下约 10 ms,可忽略。**缓存:** 单次 tool call 生命周期内用 `HashMap<Uuid, bool>` memoize,由 caller 穿入(避免全局锁)。**不做** 进程级全局缓存:避免 task 删除/重父后 TTL 问题,本 PR 保守。

**调用方影响:** 所有现有 `scope_allows_workspace` 调用点改为 `.await`。代码核查实际共 **8 处生产调用 + 1 处测试调用**(`workspaces.rs` 与 `sessions.rs` 中),全部改为异步。函数重命名 `scope_allows_workspace` → `check_scope_allows_workspace` 以反映语义(网络调用不再是纯函数)。调用签名新增 `scope_cache: &mut HashMap<Uuid, bool>` 参数,由每个 tool handler 在入口构造空的 HashMap 穿入 — 保证缓存仅限单 tool call 生命周期。

**安全语义:** manager A 不能访问 manager B 派生的 children。manager A 能访问 A 自己直接派生的 child(目前只支持一层,不支持 manager → child → grandchild 递归;见 §10 D12 翻转条目)。Standalone(非 Orchestrator)模式行为不变。

### 6.3 PR 边界

- `crates/db/src/models/task.rs` — `create`、`update`、`delete`(D13 事务实现)、`create_in_tx` 方法
- `crates/db/src/models/workspace.rs` — `create_in_tx` 方法(从现有 `create` 抽取 DB 部分)
- `crates/services/src/services/workspace.rs` — `create_in_tx(tx, params)` 纯 DB helper;`start_execution` 不变,保留给 handler 在 commit 后调用
- `crates/server/src/routes/tasks/`(新模块)— CRUD 路由 + `/start` 复合 + 并发检查
- `crates/server/src/routes/mod.rs` — wire `tasks::router()`
- `crates/services/src/services/task_concurrency.rs`(新)— 计数器 + 上限检查(独立提取以便测试)
- `crates/mcp/src/task_server/tools/tasks.rs`(新)— 5 个新 tool
- `crates/mcp/src/task_server/tools/task_attempts.rs` — 给 `start_workspace` 加可选 `task_id`
- `crates/mcp/src/task_server/tools/workspaces.rs` — 给 `list_workspaces` 加可选 `task_id` filter;给 `WorkspaceSummary` 加 `task_id: Option<Uuid>` 字段(TS 端 regen 为 `string | null`)
- `crates/mcp/src/task_server/tools/mod.rs` — `scope_allows_workspace` 改为 async(`check_scope_allows_workspace`)+ 新签名携带 `scope_cache` + D12 的 parent-child 关系检查;全部 8 处生产 + 1 处测试调用点改 `.await` 并在入口构造 HashMap
- `crates/mcp/src/task_server/api_client.rs`(新,或按 crate 惯例命名)— `ApiClient` 薄包装 `reqwest::Client`,集中提供 `get_workspace(uuid)` / `get_task(uuid)` 及后续可能的方法;解构已有的零散 `client.get(...)` 调用到此处(可选的后续清理,本 PR 最小化只搬 D12 需要的两个)
- `crates/mcp/src/task_server/mod.rs` — `McpServer` 增加 `api(&self) -> &ApiClient` 访问器;注册新 tool router
- `crates/api-types/src/lib.rs` — `TaskCreate`、`TaskUpdate`、`CreateAndStartTaskRequest`、`CreateAndStartTaskResponse`
- `shared/types.ts` 重新生成
- 测试:
  - 单元:`Task::create` / `update` / `delete` 主路径 + 约束违反
  - 单元:**D13 级联** — delete 有关联 workspace 的 task,断言 workspace 存活且 `task_id IS NULL`
  - 单元:**D13 事务回滚** — 模拟 workspace UPDATE 失败,断言 task 未被删除
  - 单元:并发检查在 `MAX_CHILDREN_PER_PARENT + 1` 时返回 429
  - 单元:scope 检查 — manager 访问自己 child 通过、访问别人 child 被拒、非 Orchestrator 模式行为不变
  - 单元:scope 检查 memoize — 同一 tool call 内对同一 target 重复检查只发一次 HTTP
  - 集成:`POST /api/tasks/start` 用故意错误的 `repo_id` → 没有 Task 行残留(事务回滚)
  - 集成:`POST /api/tasks/start` 成功路径 → Task + Workspace + 关联都存在,execution_id 已派生
  - 集成:派生 6 个 child 当 `MAX = 5` → 第 6 个收到 `parent_concurrency_exceeded`
  - 集成:Orchestrator 模式 manager 访问自己派生的 child 的 `get_execution` 不被拒

预估 diff:~1100 LOC(含 D12 scope 改造 + D13 事务 + `create_in_tx` helper 抽取)。

---

## 7. PR-X4 — UI 展示 task 树

### 7.1 问题

Tier A++ 创建了丰富的数据(manager workspace → tasks → child workspaces)但没有 UI surface,debug 编排失败需要 SQL 访问。最小的 UI 增量让编排 **可观测**。

### 7.2 设计

`packages/web-core`(`local-web` 和 `remote-web` 共享)中两处改动:

**改动 1 — Workspace 详情 breadcrumb**

当一个 workspace 有 `task_id != null`,fetch Task;当 Task 有 `parent_workspace_id != null`,fetch 该父 workspace。在 workspace 详情视图顶部渲染:

```
[Manager: <parent_workspace_name>] / [Task: <task_title>] / Attempt #<n>
```

每段是链接(父 workspace 可点击向上导航)。如果只有其中一种关系存在,只渲染可用的段。

**改动 2 — Workspace 列表分组开关**

在 workspace 列表头部加一个 "Group by manager" 开关。开启时:

- 没有 `task_id`(或 task 没有 `parent_workspace_id`)的 workspace 归到 "Standalone"
- 有 manager parent 的 workspace 归到 "Manager: <parent_workspace_name>",可折叠

默认关闭(保留当前扁平列表行为)。

**D10 — 只读 UI,不加编辑。** 本 PR 不加 task 编辑 UI(改名、改状态、删除)。这些通过 MCP tool 或直接 API 进行。UI 用于 **可观测性**。编辑 UI 是 follow-up,看用户需求决定。

### 7.3 PR 边界

- `packages/web-core/src/api/tasks.ts`(新)— Task GET endpoint 的 TS 客户端(POST/PUT/DELETE 在 UI 中不需要)
- `packages/web-core/src/hooks/useTaskBreadcrumb.ts`(新)— 给一个 workspace,fetch task + 父 workspace
- `packages/web-core/src/components/WorkspaceBreadcrumb.tsx`(新)
- `packages/web-core/src/components/WorkspaceList.tsx` — 加 `groupByManager` 开关 + 分组逻辑
- `packages/local-web/src/...` — 把 breadcrumb 接入现有 workspace 详情页
- 测试:Vitest 对 breadcrumb 组件 snapshot {无 task、只有 task、task + parent}

预估 diff:~400 LOC。

---

## 8. 横向关注点

### 8.1 类型共享

所有新的 request/response 类型用 `#[derive(Serialize, Deserialize, schemars::JsonSchema)]` 给 MCP。跨入 TS 的类型同时 derive `ts_rs::TS`。每个 PR 末尾跑 `pnpm run generate-types`。

### 8.2 测试策略

- **服务端:** 单元测试紧贴 handler;集成测试在 `crates/server/tests/`,覆盖触及 DB 事务和并发上限的流程。
- **MCP:** 单元测试紧贴每个 tool 文件,使用现有的伪 HTTP client 模式(参考 `crates/mcp/src/task_server/tools/mod.rs::tests::response_classification`)。
- **Web:** Vitest 与组件同位置;不加 e2e harness。
- **手工 smoke:** 每个 PR 在描述中包含一份手工 smoke 测试(如"通过 Claude Code MCP 派生 child → 断言 auth 失败时的 error_kind")。

### 8.3 向后兼容

- `ApiResponse.error` 是 `#[serde(skip_serializing_if = "Option::is_none")]` → 现有客户端无感知。
- 所有新 MCP tool 是叠加的。`start_workspace` 加的是 *可选* `task_id` — 不破坏。
- `get_execution` 响应字段:`status` 类型从 `String` 升级为 `ExecutionProcessStatus` enum — **wire 格式不变**。`ExecutionProcessStatus` 使用 `#[serde(rename_all = "lowercase")]`(`crates/db/src/models/execution_process.rs:39-48`),序列化字节与此前 `String` 标签完全相同(`"running"` / `"completed"` / `"failed"` / `"killed"`)。TS 端 regen 后从 `string` 变为 union literal,属于类型收窄而非破坏。
- `error` 字段新增,`final_message` 行为不变(仍 `None`)。
- Task CRUD endpoint 是净新增 — 现有客户端无影响。
- UI 改动是叠加的(新 breadcrumb 组件、新可选开关)。
- D13 的 `Task::delete` 级联:旧行为是 leaf delete 留下 dangling `task_id`;新行为是清理关联。旧客户端如果依赖 dangling 状态(无) — 不存在,因此净收益。

### 8.4 Push gate 合规

按用户策略:默认只读;commit 前展示 diff;**push 前等显式授权**。每个 PR 在 `git push` 处暂停等签字。无例外。

---

## 9. 决策日志

| ID  | 决策                                                                              | 状态     |
|-----|----------------------------------------------------------------------------------|----------|
| D1  | executor 错误统一 HTTP 500;manager 通过 `error.kind` 分支,不看 status            | 接受     |
| D2  | 5 个 canonical `kind`,不是 12 个;后续按需细分                                    | 接受     |
| D3  | `read_session_messages` 默认 `last_n = 20`                                       | 接受     |
| D4  | `final_assistant_message` 是顶层便利字段,完整文本                                | 接受     |
| D5  | `include_thinking = false` 默认关闭,控制 token 成本(命名对齐 VK 内部 `NormalizedEntryType::Thinking`) | 接受     |
| D6  | 仅在新 `/api/tasks/start` 用 DB 事务原子 — 不改造现有 endpoint                    | 接受     |
| D7  | 并发上限在服务端强制,不在 MCP 端                                                 | 接受     |
| D8  | `list_tasks` 默认按调用方 workspace 的 parent scope 过滤                          | 接受     |
| D9  | 两步路径(`create_task` + `start_workspace`)失败不自动清理                       | 接受     |
| D10 | UI 在本期只读;编辑 UI 延后                                                       | 接受     |
| D11 | `GetExecutionResponse.final_message` 保持 `None`;消息读取唯一渠道是 `read_session_messages` | 接受     |
| D12 | Orchestrator 模式 scope 放宽:manager 可访问自己派生的 children(通过 HTTP 两次查询,memoize 至单次 tool-call 生命周期) | 接受     |
| D13 | `Task::delete` 级联:应用层事务 UPDATE-then-DELETE,不改 FK schema    | 接受     |
| D5a | `NormalizedEntryType::{Loading, TokenUsageInfo, NextAction, UserAnsweredQuestions}` 永久过滤,不出现在 `read_session_messages` 输出中 | 接受     |

---

## 10. 最可能被翻转的决策

这些是 owner 可调用决策;最可能被 push back 的列出来:

- **D2** — 5 个 `kind` 如果你有具体消费者要求 `auth_required` 再细分,可能太粗。容易扩展。
- **D3** — `last_n = 20` 如果你的 manager prompt 期望长 final 消息带中间摘要,可能太小。已经支持 per-call 调整。
- **D5a** — 如果 manager 需要 `TokenUsageInfo` 做成本统计,可以把"永久过滤"改成"由参数控制"(例如 `include_meta_entries`)。目前无需求。
- **D6** — 接受 *其他* endpoint 的 orphan window 不修是有意取舍;如果你要全服务端原子性,那是个更大的 PR。`create_in_tx` helper 已经铺好路,后续补齐成本低。
- **D10** — 只读 UI 意味着人类无法通过 UI 改 manager 创建的 task 标题。如果 manager 起错名,只能再走 MCP。v1 可接受。
- **D12** — scope 放宽规则只支持一层(manager 直系 child),不支持递归(manager → child → grandchild)。如果要多层编排,放宽规则要递归查 task chain。本期不做。**另一轴:** 若未来 MCP 需要在毫秒内频繁检查 scope(例如高频率 tool call),可以考虑把 MCP 直连 db,此时 D12 的 HTTP 路径会变成 in-process 查询;目前 LLM 节奏下无此压力。
- **D13** — 如果你希望 "删除 task 保留 workspace 作为孤儿但带有历史引用",当前级联会清空 `task_id`。可以改成"仅 archive task 不物理删除",但会引入新的 archival 状态字段,超出本期。

如果以上无需翻转,ack spec 即可进入 writing-plans。

---

## 附录 A:Manager prompt 模式(参考)

一段参考片段,展示 manager prompt 端到端使用这些 tool 的样子。**不属于任何 PR** — 纯粹给 spec 评审者验证 API 表面是否自然组合。

```
你是 Vibe Kanban 中的一个 orchestrator session。你的 workspace ID 是 {self_workspace_id}。

启动时恢复状态:
  1. tasks = list_tasks()                                          # 默认 parent_workspace_id == self
  2. for t in tasks where t.status == in_progress:
       workspaces = list_workspaces(task_id=t.id)
       latest = workspaces[0]                                      # 已按 created_at desc 排序
       e = get_execution(latest.id)
       if e.status in (Completed, Failed):
         resolve t(对应地 update_task_status)

每个新工作:
  1. result = create_and_start_task(
       task: { project_id, title: "...", description: "...", parent_workspace_id: {self} },
       workspace: { repos: [...], executor_config: {...}, prompt: t.description }
     )
  2. 记录 (task_id, workspace_id) 用于轮询

轮询循环:
  for (tid, wid) in pending:
    e = get_execution(wid)
    if e.status == Running: continue
    if e.status == Completed:
      msgs = read_session_messages(wid)              # 默认 last_n=20
      summary = msgs.final_assistant_message
      update_task_status(tid, done)
    if e.status == Failed:
      if e.error.retryable and not e.error.human_intervention_required:
        重试最多 2 次
      else:
        update_task_status(tid, cancelled)
        把 e.error.kind + e.error.stderr_tail 上报给用户

反压:
  收到 parent_concurrency_exceeded:等下一个 pending child 完成,然后重试
```

---

## 附录 B:每个 PR 涉及的文件

| PR    | 文件 |
|-------|------|
| PR-X1 | `crates/utils/src/response.rs`、`crates/server/src/error.rs`、`crates/services/src/services/container.rs`、`crates/server/src/routes/sessions/mod.rs`、`crates/server/src/routes/workspaces/create.rs`、`crates/mcp/src/task_server/tools/sessions.rs`、`shared/types.ts`(重生) |
| PR-X2 | `crates/mcp/src/task_server/tools/sessions.rs`、`crates/server/src/routes/sessions/mod.rs`、`crates/executors/src/logs/mod.rs`(可能:`NormalizedEntryType` discriminant serde 调整)、`shared/types.ts`(重生) |
| PR-X3 | `crates/db/src/models/task.rs`(含 D13 事务 delete、`create_in_tx`)、`crates/db/src/models/workspace.rs`(`create_in_tx` 抽取)、`crates/services/src/services/workspace.rs`(`create_in_tx` helper)、`crates/server/src/routes/tasks/`(新)、`crates/server/src/routes/mod.rs`、`crates/services/src/services/task_concurrency.rs`(新)、`crates/mcp/src/task_server/tools/tasks.rs`(新)、`crates/mcp/src/task_server/tools/task_attempts.rs`(extend `start_workspace`)、`crates/mcp/src/task_server/tools/workspaces.rs`(extend `list_workspaces` + `WorkspaceSummary`)、`crates/mcp/src/task_server/tools/mod.rs`(`scope_allows_workspace` → `check_scope_allows_workspace`,async + HTTP 放宽规则 + memoize;8 处生产 + 1 处测试调用点改 `.await`)、`crates/mcp/src/task_server/http_client.rs`(新增 `get_workspace` / `get_task`)、`crates/mcp/src/task_server/mod.rs`、`crates/api-types/src/lib.rs`、`shared/types.ts`(重生) |
| PR-X4 | `packages/web-core/src/api/tasks.ts`(新)、`packages/web-core/src/hooks/useTaskBreadcrumb.ts`(新)、`packages/web-core/src/components/WorkspaceBreadcrumb.tsx`(新)、`packages/web-core/src/components/WorkspaceList.tsx`、`packages/local-web/src/...`(把 breadcrumb 接入现有详情页) |
