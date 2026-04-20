# VK MCP 编排扩展实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Vibe Kanban 的 MCP 表面能支撑 "manager 会话派生 child 会话" 的编排闭环 — 错误透明、child 产出可读、持久化 todo、可观测 UI。

**Architecture:** 四个顺序 PR,每个独立可合并:
- **PR-X1** 服务端 `ApiResponse` 新增 `error` envelope;MCP `get_execution` 升级 `status` 类型
- **PR-X2** 新 MCP tool `read_session_messages`(复用 `NormalizedEntry` + patch rebuild)
- **PR-X3** Task CRUD + 原子 `create_and_start_task` + per-parent 并发上限 + Orchestrator scope 放宽(走 HTTP,memoize)
- **PR-X4** UI breadcrumb + group-by-manager toggle

**Tech Stack:** Rust (rmcp v1.2.0, axum, sqlx, reqwest, ts-rs) / TypeScript (React + Vite + Tailwind,vitest)

**Spec:** `docs/superpowers/specs/2026-04-20-vk-mcp-extensions-design.md` (v4.1)

---

## 前置与通用约定

**工作目录:** 本计划在现有 worktree `/Users/xyz/ABC/vibe-kanban/.claude/worktrees/exciting-hellman-14d43c/` 中执行,分支 `claude/exciting-hellman-14d43c`。

**开发循环:** 每改一块代码立刻跑最小范围测试,成段完成后跑全局 check。

**常用命令速查:**
- 单 crate 测试:`cargo test -p <crate> <filter>`
- 单 rust file test:`cargo test -p <crate> --lib -- <path::to::test>`
- 完整 Rust 校验:`cargo check --workspace && cargo clippy --workspace --all-targets -- -D warnings`
- 完整测试:`cargo test --workspace`
- SQLx 离线预处理:`pnpm run prepare-db`
- 类型生成:`pnpm run generate-types`
- 格式化:`pnpm run format`
- Lint 全套:`pnpm run lint`
- 前端测试:`pnpm --filter web-core vitest run`
- 前端 type-check:`pnpm run check`

**Push gate 合规:** 每个 PR 结束先 commit + 展示 diff,**等用户明确授权后再 `git push`**。每个 PR 的最后一个任务是一个显式的 "Push Gate checkpoint" — 碰到 checkpoint 必须停,等指令。

**Commit 习惯:** 小步提交、信息准确、遵循仓库惯例(参考 `git log --oneline`)。不要把跨 PR 的改动混到一个 commit。不要跳过 hooks。

**TDD 纪律:** 每个 feature task 先写失败测试、跑一次确认 FAIL、写最小实现、跑一次确认 PASS、commit。放 regression 测试而不是依赖 code review 捕捉。

**Type 生成时机:** 只在每个 PR 的末尾 regen 一次 `shared/types.ts`,避免中间提交里出现不稳定的类型 diff。

---

# PR-X1 — 错误透明

**PR 范围:** `ApiResponse` 新增 `error: Option<ApiErrorEnvelope>` envelope,服务端把 `ApiError::Executor` 按 5-kind 分类,捕捉 stderr tail,MCP `get_execution` 升级 `status: ExecutionProcessStatus`(从 `String` 升级,wire 不变)+ 新增 `error` 字段,`final_message` 继续保持 `None`(留给 PR-X2)。

**文件拓扑:**
- **修改** `crates/utils/src/response.rs` — 加 `ApiErrorEnvelope`、`ApiResponse.error`
- **修改** `crates/server/src/error.rs` — `ErrorInfo.error`、`ApiError::Executor` 展开为 5-kind 映射
- **修改** `crates/services/src/services/container.rs` — `ExecutorFailureContext`,`start_execution` 捕捉 stderr tail
- **修改** `crates/server/src/routes/sessions/mod.rs` — `follow_up` 透传 context
- **修改** `crates/server/src/routes/workspaces/create.rs` — `create_and_start_workspace` 透传 context
- **修改** `crates/mcp/src/task_server/tools/sessions.rs` — `get_execution` 升级
- **重新生成** `shared/types.ts`

---

### Task 1.1: 在 `ApiResponse` 中加入 `error` envelope

**Files:**
- Modify: `crates/utils/src/response.rs`
- Test: 同文件 `#[cfg(test)] mod tests`

- [ ] **Step 1: 在 `crates/utils/src/response.rs` 末尾追加失败测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_round_trip_retains_all_fields() {
        let env = ApiErrorEnvelope {
            kind: "executor_not_found".to_string(),
            retryable: false,
            human_intervention_required: true,
            stderr_tail: Some("claude: command not found".to_string()),
            program: Some("claude".to_string()),
        };
        let json = serde_json::to_string(&env).expect("serialize");
        let back: ApiErrorEnvelope = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.kind, env.kind);
        assert_eq!(back.retryable, env.retryable);
        assert_eq!(back.human_intervention_required, env.human_intervention_required);
        assert_eq!(back.stderr_tail, env.stderr_tail);
        assert_eq!(back.program, env.program);
    }

    #[test]
    fn response_error_field_is_skipped_when_none() {
        let resp: ApiResponse<(), ()> = ApiResponse::error("oops");
        let json = serde_json::to_string(&resp).unwrap();
        assert!(!json.contains("\"error\":"), "unexpected `error` key in {json}");
    }

    #[test]
    fn response_with_error_envelope_serializes() {
        let resp: ApiResponse<(), ()> = ApiResponse::error_with_envelope(
            "spawn failed",
            ApiErrorEnvelope {
                kind: "spawn_failed".to_string(),
                retryable: true,
                human_intervention_required: false,
                stderr_tail: None,
                program: None,
            },
        );
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"kind\":\"spawn_failed\""));
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test -p utils response::tests -- --nocapture`
Expected: FAIL — `ApiErrorEnvelope not found`, `error_with_envelope not found`

- [ ] **Step 3: 实现 `ApiErrorEnvelope` 类型和 `error` 字段**

把 `crates/utils/src/response.rs` 改为:

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ApiErrorEnvelope {
    /// 稳定的机器可读 kind。manager 据此分支。
    pub kind: String,
    /// 是否可以原样重试。
    pub retryable: bool,
    /// 自动重试是否无效(认证失败、缺二进制等)。
    pub human_intervention_required: bool,
    /// executor stderr 的最后 ~2 KiB,用于诊断展示。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr_tail: Option<String>,
    /// executor 程序名(如 "claude"、"codex")。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub program: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct ApiResponse<T, E = T> {
    success: bool,
    data: Option<T>,
    error_data: Option<E>,
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    error: Option<ApiErrorEnvelope>,
}

impl<T, E> ApiResponse<T, E> {
    /// Creates a successful response, with `data` and no message.
    pub fn success(data: T) -> Self {
        ApiResponse {
            success: true,
            data: Some(data),
            message: None,
            error_data: None,
            error: None,
        }
    }

    /// Creates an error response, with `message` and no data.
    pub fn error(message: &str) -> Self {
        ApiResponse {
            success: false,
            data: None,
            message: Some(message.to_string()),
            error_data: None,
            error: None,
        }
    }

    /// Creates an error response carrying a structured `ApiErrorEnvelope`.
    pub fn error_with_envelope(message: &str, envelope: ApiErrorEnvelope) -> Self {
        ApiResponse {
            success: false,
            data: None,
            message: Some(message.to_string()),
            error_data: None,
            error: Some(envelope),
        }
    }

    /// Creates an error response, with no `data`, no `message`, but with arbitrary `error_data`.
    pub fn error_with_data(data: E) -> Self {
        ApiResponse {
            success: false,
            data: None,
            error_data: Some(data),
            message: None,
            error: None,
        }
    }

    /// Returns true if the response was successful.
    pub fn is_success(&self) -> bool {
        self.success
    }

    /// Returns a reference to the error message if present.
    pub fn message(&self) -> Option<&str> {
        self.message.as_deref()
    }

    /// Returns a reference to the structured error envelope if present.
    pub fn error_envelope(&self) -> Option<&ApiErrorEnvelope> {
        self.error.as_ref()
    }

    /// Consumes the response, returning the data payload if present.
    pub fn into_data(self) -> Option<T> {
        self.data
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cargo test -p utils response::tests -- --nocapture`
Expected: PASS (3 tests)

- [ ] **Step 5: 跑 workspace check 确保未破坏下游**

Run: `cargo check --workspace`
Expected: PASS(可能有 `ApiResponse` 字段数量导致的 warning,但不应有 error)

- [ ] **Step 6: Commit**

```bash
git add crates/utils/src/response.rs
git commit -m "feat(utils): add ApiErrorEnvelope + ApiResponse.error field"
```

---

### Task 1.2: 实现 `ExecutorError → ApiErrorEnvelope` 分类函数

**Files:**
- Modify: `crates/server/src/error.rs`
- Test: 同文件 `#[cfg(test)] mod tests`

- [ ] **Step 1: 在 `crates/server/src/error.rs` 末尾追加失败测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use executors::executors::ExecutorError;
    use utils::response::ApiErrorEnvelope;

    #[test]
    fn classifies_executable_not_found() {
        let err = ExecutorError::ExecutableNotFound { program: "claude".to_string() };
        let env = executor_error_envelope(&err, None, None);
        assert_eq!(env.kind, "executor_not_found");
        assert!(!env.retryable);
        assert!(env.human_intervention_required);
        assert_eq!(env.program.as_deref(), Some("claude"));
    }

    #[test]
    fn classifies_auth_required() {
        let err = ExecutorError::AuthRequired("token expired".into());
        let env = executor_error_envelope(&err, None, None);
        assert_eq!(env.kind, "auth_required");
        assert!(!env.retryable);
        assert!(env.human_intervention_required);
    }

    #[test]
    fn classifies_follow_up_not_supported() {
        let err = ExecutorError::FollowUpNotSupported("gemini".into());
        let env = executor_error_envelope(&err, None, None);
        assert_eq!(env.kind, "follow_up_not_supported");
        assert!(!env.retryable);
        assert!(!env.human_intervention_required);
    }

    #[test]
    fn classifies_spawn_error_as_retryable() {
        let err = ExecutorError::Io(std::io::Error::other("boom"));
        let env = executor_error_envelope(&err, None, None);
        assert_eq!(env.kind, "spawn_failed");
        assert!(env.retryable);
        assert!(!env.human_intervention_required);
    }

    #[test]
    fn unknown_variants_fall_through_to_internal() {
        let err = ExecutorError::UnknownExecutorType("foo".into());
        let env = executor_error_envelope(&err, None, None);
        assert_eq!(env.kind, "internal");
        assert!(env.retryable);
    }

    #[test]
    fn envelope_carries_stderr_tail_and_program() {
        let err = ExecutorError::AuthRequired("expired".into());
        let env = executor_error_envelope(
            &err,
            Some("last stderr line".to_string()),
            Some("claude".to_string()),
        );
        assert_eq!(env.stderr_tail.as_deref(), Some("last stderr line"));
        assert_eq!(env.program.as_deref(), Some("claude"));
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test -p server error::tests::classifies`
Expected: FAIL — `executor_error_envelope not found`

- [ ] **Step 3: 在 `crates/server/src/error.rs` 里实现分类函数**

在文件合适位置(例如 `ErrorInfo` 定义之后)加入:

```rust
use utils::response::ApiErrorEnvelope;

/// 把 `ExecutorError` 分类成稳定的 5-kind envelope。
/// - `executor_not_found`:缺二进制
/// - `auth_required`:需用户重新登录
/// - `follow_up_not_supported`:所选 executor 不支持 follow-up
/// - `spawn_failed`:可重试的 IO / spawn 失败
/// - `internal`:兜底
pub fn executor_error_envelope(
    err: &executors::executors::ExecutorError,
    stderr_tail: Option<String>,
    program: Option<String>,
) -> ApiErrorEnvelope {
    use executors::executors::ExecutorError::*;
    let (kind, retryable, human) = match err {
        ExecutableNotFound { .. } => ("executor_not_found", false, true),
        AuthRequired(_) => ("auth_required", false, true),
        FollowUpNotSupported(_) => ("follow_up_not_supported", false, false),
        SpawnError(_) | Io(_) => ("spawn_failed", true, false),
        _ => ("internal", true, false),
    };
    let program = program.or_else(|| match err {
        ExecutableNotFound { program } => Some(program.clone()),
        _ => None,
    });
    ApiErrorEnvelope {
        kind: kind.to_string(),
        retryable,
        human_intervention_required: human,
        stderr_tail,
        program,
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cargo test -p server error::tests::classifies`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/error.rs
git commit -m "feat(server): classify ExecutorError into 5-kind envelope"
```

---

### Task 1.3: 升级 `ErrorInfo` 并在 `ApiError` 响应里填充 envelope

**Files:**
- Modify: `crates/server/src/error.rs`

- [ ] **Step 1: 加失败测试 — 覆盖 `IntoResponse` 的 envelope 注入**

在 `error.rs` tests mod 末尾追加:

```rust
    use axum::response::IntoResponse;
    use http_body_util::BodyExt;

    #[tokio::test]
    async fn executor_error_response_carries_envelope() {
        let err: ApiError = ExecutorError::AuthRequired("expired".into()).into();
        let response = err.into_response();
        let (parts, body) = response.into_parts();
        let bytes = body.collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(parts.status, axum::http::StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(json["success"], false);
        assert_eq!(json["error"]["kind"], "auth_required");
        assert_eq!(json["error"]["retryable"], false);
        assert_eq!(json["error"]["human_intervention_required"], true);
    }

    #[tokio::test]
    async fn non_executor_error_has_no_envelope() {
        let err: ApiError = ApiError::BadRequest("bad".into());
        let response = err.into_response();
        let (_, body) = response.into_parts();
        let bytes = body.collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        // envelope 可选,对 BadRequest 不要求填
        assert!(json.get("error").map_or(true, |v| v.is_null()));
    }
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test -p server error::tests::executor_error_response`
Expected: FAIL — 当前 `IntoResponse` 不填 `error` 字段

- [ ] **Step 3: 修改 `ErrorInfo` 和 `IntoResponse` for `ApiError`**

把 `crates/server/src/error.rs` 的 `ErrorInfo` 定义改为:

```rust
struct ErrorInfo {
    status: StatusCode,
    error_type: &'static str,
    message: Option<String>,
    envelope: Option<utils::response::ApiErrorEnvelope>,
}
```

找到 `IntoResponse for ApiError` 的实现(约 line 498 附近),把 `ApiError::Executor` 的分支改为:

```rust
            ApiError::Executor(e) => ErrorInfo {
                status: StatusCode::INTERNAL_SERVER_ERROR,
                error_type: "ExecutorError",
                message: Some(e.to_string()),
                envelope: Some(executor_error_envelope(e, None, None)),
            },
```

同时修改所有其他返回 `ErrorInfo` 的分支,把 `envelope: None` 加上去。最后在 body 构造处改成:

```rust
        let body = ResponseJson(serde_json::json!({
            "success": false,
            "error_type": info.error_type,
            "message": info.message,
            "error": info.envelope,
        }));
```

> 细节:如果现有 body 里已有 `json!` 形式,把 `"error": info.envelope` 作为新 key 加入;其它 key 保持原样。

- [ ] **Step 4: 跑测试**

Run: `cargo test -p server error::tests`
Expected: PASS

- [ ] **Step 5: 跑 workspace check**

Run: `cargo check --workspace`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crates/server/src/error.rs
git commit -m "feat(server): attach ApiErrorEnvelope to ApiError responses"
```

---

### Task 1.4: 在 `ContainerService::start_execution` 捕捉 stderr tail

**Files:**
- Modify: `crates/services/src/services/container.rs`
- Modify: `crates/server/src/error.rs` — 接受可选 `ExecutorFailureContext`

- [ ] **Step 1: 加单元测试 — stderr 截断**

在 `crates/services/src/services/container.rs` 末尾追加(或在已有测试 mod 里加):

```rust
#[cfg(test)]
mod failure_context_tests {
    use super::*;

    #[test]
    fn truncates_stderr_from_left_to_2kib() {
        let big = "x".repeat(5000);
        let tail = truncate_stderr_tail(&big);
        assert!(tail.starts_with('…'));
        assert!(tail.len() <= 2050); // 2048 + few bytes for ellipsis/UTF-8 safety
    }

    #[test]
    fn short_stderr_passes_through() {
        let tail = truncate_stderr_tail("hello");
        assert_eq!(tail, "hello");
    }

    #[test]
    fn utf8_boundary_is_respected() {
        let s = format!("{}{}", "a".repeat(3000), "日本語");
        let tail = truncate_stderr_tail(&s);
        assert!(tail.is_char_boundary(0));
        assert!(tail.is_char_boundary(tail.len()));
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test -p services container::failure_context_tests`
Expected: FAIL — `truncate_stderr_tail` 未定义

- [ ] **Step 3: 实现 `ExecutorFailureContext` + `truncate_stderr_tail`**

在 `crates/services/src/services/container.rs` 合适位置加入:

```rust
/// Context attached to an executor failure surface to API callers.
#[derive(Debug, Clone)]
pub struct ExecutorFailureContext {
    pub stderr_tail: Option<String>,
    pub program: Option<String>,
}

/// Keep only the last ~2 KiB of stderr. Truncates from the left and prefixes "…".
/// Respects UTF-8 char boundaries.
pub fn truncate_stderr_tail(s: &str) -> String {
    const LIMIT: usize = 2048;
    if s.len() <= LIMIT {
        return s.to_string();
    }
    let start = s.len() - LIMIT;
    let mut boundary = start;
    while !s.is_char_boundary(boundary) && boundary < s.len() {
        boundary += 1;
    }
    format!("…{}", &s[boundary..])
}
```

同文件里 `start_execution` 末尾(失败路径)从 `MsgStore` 抓 `LogMsg::Stderr`(最后若干条拼起来)塞进 `ExecutorFailureContext`,挂到返回的错误上。具体实现点:
1. 在 start_execution 的错误返回前,遍历当前 MsgStore 找 `LogMsg::Stderr(s)`,把它们 join 后用 `truncate_stderr_tail` 截断
2. 把 `ExecutorFailureContext { stderr_tail, program }` 以 `tracing::field::debug` 记录,**同时** 作为附加信息透传给调用方

**机制选择:** 由于 `ApiError::Executor(#[from] ExecutorError)` 是自动转换,把 context 塞进一个 thread-local 或调用点显式传递都不理想。选择**显式传递**:
- 给 `start_execution` 的返回类型改为 `Result<Execution, (ExecutorError, Option<ExecutorFailureContext>)>`
- 或更保守:加一个姊妹方法 `start_execution_with_context` 返回 `(Result<Execution, ExecutorError>, Option<ExecutorFailureContext>)`,让 caller 拼。

选后者以避免级联 API 变更(所有其它 `start_execution` 调用点照旧)。

```rust
impl ContainerService {
    /// Returns the execution result plus an optional failure context
    /// captured from the MsgStore stderr tail. Safe to ignore the context
    /// for call sites that don't need it.
    pub async fn start_execution_with_context(
        &self,
        // ... same args as start_execution ...
    ) -> (Result<Execution, ExecutorError>, Option<ExecutorFailureContext>) {
        let result = self.start_execution(/* ... */).await;
        let context = if result.is_err() {
            let tail = self.collect_stderr_tail().map(|s| truncate_stderr_tail(&s));
            Some(ExecutorFailureContext {
                stderr_tail: tail,
                program: self.last_program_hint(),
            })
        } else {
            None
        };
        (result, context)
    }
}
```

> 注:`collect_stderr_tail` 和 `last_program_hint` 是两个小辅助方法,从 MsgStore 读最后 N 条 Stderr + executor 配置里读 program 名。如果 MsgStore 没有直接接口,加一个 `MsgStore::collect_stderr_tail(limit_bytes: usize) -> Option<String>` 的方法(在 `crates/utils/src/msg_store.rs`)。

- [ ] **Step 4: 跑测试**

Run: `cargo test -p services container::failure_context_tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/services/src/services/container.rs crates/utils/src/msg_store.rs
git commit -m "feat(services): capture stderr tail + program via ExecutorFailureContext"
```

---

### Task 1.5: Handler 层透传 `ExecutorFailureContext`

**Files:**
- Modify: `crates/server/src/routes/sessions/mod.rs`
- Modify: `crates/server/src/routes/workspaces/create.rs`
- Modify: `crates/server/src/error.rs` — `ApiError` 变体带 context

- [ ] **Step 1: 加集成测试 — 模拟 `ExecutableNotFound`**

新建 `crates/server/tests/executor_error_envelope.rs`(或已有 integration test 文件追加):

```rust
use axum::http::StatusCode;
use serde_json::Value;

#[tokio::test]
async fn missing_executable_returns_envelope_with_stderr() {
    let app = test_support::build_app().await;
    // Seed a project + repo + workspace ready to run.
    let workspace_id = test_support::seed_ready_workspace(&app).await;

    // Request follow_up with an invalid executor config that will hit ExecutableNotFound
    let resp = app.post(&format!("/api/sessions/{workspace_id}/follow_up"))
        .json(&serde_json::json!({
            "executor": "nonexistent-bin",
            "prompt": "hi"
        }))
        .send()
        .await;

    assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let body: Value = resp.json().await;
    assert_eq!(body["success"], false);
    assert_eq!(body["error"]["kind"], "executor_not_found");
    assert_eq!(body["error"]["human_intervention_required"], true);
    assert!(body["error"]["program"].as_str().unwrap_or("").contains("nonexistent"));
}
```

> 注:`test_support::build_app` / `seed_ready_workspace` 需要按已有集成测试辅助 API 调整。如果当前 `crates/server/tests/` 还没有 `test_support` 模块,先看其它 integration test 怎么搭 app,复用相同脚手架。

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test -p server --test executor_error_envelope -- --nocapture`
Expected: FAIL 或 "test_support not found"(后者需要先补辅助)

- [ ] **Step 3: 在 handler 层用 `start_execution_with_context` + 返回 envelope**

编辑 `crates/server/src/routes/sessions/mod.rs` 里 `follow_up` handler:

```rust
pub async fn follow_up(
    State(deployment): State<DeploymentImpl>,
    Path(session_id): Path<Uuid>,
    Json(body): Json<FollowUpRequest>,
) -> Result<ResponseJson<ApiResponse<FollowUpResponse>>, ApiError> {
    let container = deployment.container();
    let (result, context) = container
        .start_execution_with_context(/* ...same args... */)
        .await;

    match result {
        Ok(execution) => Ok(ResponseJson(ApiResponse::success(FollowUpResponse {
            execution_id: execution.id.to_string(),
        }))),
        Err(err) => {
            let envelope = crate::error::executor_error_envelope(
                &err,
                context.as_ref().and_then(|c| c.stderr_tail.clone()),
                context.as_ref().and_then(|c| c.program.clone()),
            );
            Err(ApiError::ExecutorWithContext {
                source: err,
                envelope,
            })
        }
    }
}
```

> 新增一个 `ApiError` 变体 `ExecutorWithContext { source: ExecutorError, envelope: ApiErrorEnvelope }` 以便 `IntoResponse` 可以直接用 envelope。原有的 `ApiError::Executor(#[from] ExecutorError)` 保留向后兼容(默认 envelope 为 classifier 给的)。

修改 `crates/server/src/error.rs` 的 `ApiError`:

```rust
#[error("Executor error: {source}")]
ExecutorWithContext {
    source: ExecutorError,
    envelope: ApiErrorEnvelope,
},
```

在 `IntoResponse` 的 match 里加:

```rust
ApiError::ExecutorWithContext { source, envelope } => ErrorInfo {
    status: StatusCode::INTERNAL_SERVER_ERROR,
    error_type: "ExecutorError",
    message: Some(source.to_string()),
    envelope: Some(envelope.clone()),
},
```

对 `workspaces/create.rs` 的 `create_and_start_workspace` 做同样改动。

- [ ] **Step 4: 跑集成测试**

Run: `cargo test -p server --test executor_error_envelope`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/sessions/mod.rs crates/server/src/routes/workspaces/create.rs crates/server/src/error.rs
git commit -m "feat(server): propagate executor failure context through follow_up + create"
```

---

### Task 1.6: 升级 MCP `get_execution` 响应

**Files:**
- Modify: `crates/mcp/src/task_server/tools/sessions.rs`

- [ ] **Step 1: 在 `crates/mcp/src/task_server/tools/sessions.rs` tests mod 加测试**

```rust
#[cfg(test)]
mod get_execution_tests {
    use super::*;
    use db::models::execution_process::ExecutionProcessStatus;

    #[test]
    fn status_serializes_lowercase() {
        let resp = GetExecutionResponse {
            execution_id: "abc".into(),
            session_id: "def".into(),
            status: ExecutionProcessStatus::Failed,
            is_finished: true,
            execution: serde_json::json!({}),
            error: Some(utils::response::ApiErrorEnvelope {
                kind: "auth_required".into(),
                retryable: false,
                human_intervention_required: true,
                stderr_tail: None,
                program: None,
            }),
            final_message: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"status\":\"failed\""));
        assert!(json.contains("\"kind\":\"auth_required\""));
    }

    #[test]
    fn final_message_stays_none() {
        // D11: final_message always None; manager must use read_session_messages.
        let resp = GetExecutionResponse {
            execution_id: "a".into(),
            session_id: "b".into(),
            status: ExecutionProcessStatus::Completed,
            is_finished: true,
            execution: serde_json::json!({}),
            error: None,
            final_message: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"final_message\":null"));
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test -p mcp sessions::get_execution_tests`
Expected: FAIL — `GetExecutionResponse` 没有 `error` 字段,`status` 仍是 `String`

- [ ] **Step 3: 修改 `GetExecutionResponse`**

把 `GetExecutionResponse` (约 line 132-141) 改为:

```rust
#[derive(Debug, Serialize, schemars::JsonSchema)]
struct GetExecutionResponse {
    execution_id: String,
    session_id: String,
    /// 机器可识别的执行状态枚举(wire 格式是小写字符串)。
    status: db::models::execution_process::ExecutionProcessStatus,
    is_finished: bool,
    execution: serde_json::Value,
    /// 失败时由服务端填充的结构化错误信息。
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<utils::response::ApiErrorEnvelope>,
    /// Deprecated: 始终 None。使用 read_session_messages 读取消息。
    #[schemars(description = "DEPRECATED — always null. Use read_session_messages instead.")]
    final_message: Option<String>,
}
```

同时修改 `get_execution` tool 函数的内部组装代码:
1. 把 `status: status_string` 改为 `status: exec_status_enum`(从 server 响应的 `execution` JSON 里解析出 `ExecutionProcessStatus`)
2. 在 failure 分支把 upstream `ApiResponseEnvelope.error` 映射到本地 `error` 字段
3. `final_message: None` 保持不变

- [ ] **Step 4: 跑测试**

Run: `cargo test -p mcp sessions::get_execution_tests`
Expected: PASS

- [ ] **Step 5: 跑全 MCP crate 测试**

Run: `cargo test -p mcp`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crates/mcp/src/task_server/tools/sessions.rs
git commit -m "feat(mcp): upgrade get_execution status to enum + add error envelope"
```

---

### Task 1.7: Regen types + 运行完整校验

**Files:**
- Regen: `shared/types.ts`

- [ ] **Step 1: 生成类型**

Run: `pnpm run generate-types`
Expected: `shared/types.ts` 更新,新增 `ApiErrorEnvelope`、`ExecutionProcessStatus` union literal

- [ ] **Step 2: 跑完整 check**

Run: `pnpm run check`
Expected: PASS(前后端 type-check 都过)

- [ ] **Step 3: 跑完整 clippy**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: PASS

- [ ] **Step 4: 跑完整测试**

Run: `cargo test --workspace`
Expected: PASS

- [ ] **Step 5: 跑 format**

Run: `pnpm run format`
Expected: 无 diff(或 format 后再 stage)

- [ ] **Step 6: Commit 类型 regen**

```bash
git add shared/types.ts
git commit -m "chore: regen shared types for PR-X1"
```

---

### 🛑 PR-X1 Push Gate Checkpoint

- [ ] 汇总本 PR 的 diff:`git log --oneline origin/main..HEAD` + `git diff --stat origin/main..HEAD`
- [ ] 人工 smoke 测试:`pnpm run dev` → 通过 MCP 客户端调 `get_execution` on a failed session → 断言 `status == "failed"` + `error.kind != null`
- [ ] 停,等用户授权 `git push`
- [ ] 授权后:`git push -u origin claude/exciting-hellman-14d43c`(如果还没 push 过)
- [ ] 开 PR:`gh pr create --title "feat(mcp): error transparency via ApiErrorEnvelope" --body ...`

---

# PR-X2 — 读 child 会话产出 (`read_session_messages`)

**PR 范围:** 新 MCP tool `read_session_messages`,后端走 `ContainerService::stream_normalized_logs` + patch apply 重建 `Vec<NormalizedEntry>`,按 D5/D5a 过滤 + 分页,提取 `final_assistant_message`。

**文件拓扑:**
- **新建** `crates/utils/src/log_msg.rs` 附近的 `rebuild_entries` 纯函数(或 `crates/executors/src/logs/mod.rs` 内部模块)
- **修改** `crates/server/src/routes/sessions/mod.rs` — 新路由 `GET /:session_id/messages`
- **修改** `crates/mcp/src/task_server/tools/sessions.rs` — 新 tool
- **Regen** `shared/types.ts`

---

### Task 2.1: 实现 `rebuild_entries` 纯函数

**Files:**
- Create: `crates/executors/src/logs/rebuild.rs`
- Modify: `crates/executors/src/logs/mod.rs` — export `rebuild`

- [ ] **Step 1: 新建 `crates/executors/src/logs/rebuild.rs` 并加失败测试**

```rust
//! Rebuild a `Vec<NormalizedEntry>` from a sequence of `LogMsg` values
//! (the same data layer the WebSocket conversation stream exposes).

use crate::logs::{NormalizedConversation, NormalizedEntry};
use json_patch::Patch;
use utils::log_msg::LogMsg;

/// Apply every `LogMsg::JsonPatch` in order to an empty conversation and return
/// the materialised `entries` vector.
pub fn rebuild_entries(msgs: &[LogMsg]) -> Vec<NormalizedEntry> {
    let mut doc = serde_json::to_value(NormalizedConversation::default())
        .expect("serialize empty conversation");
    for msg in msgs {
        if let LogMsg::JsonPatch(patch) = msg {
            // Ignore patch errors — matches frontend leniency.
            let _ = json_patch::patch(&mut doc, patch);
        }
    }
    let conv: NormalizedConversation = serde_json::from_value(doc).unwrap_or_default();
    conv.entries
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logs::{NormalizedEntry, NormalizedEntryType};
    use json_patch::PatchOperation;
    use serde_json::json;
    use utils::log_msg::LogMsg;

    fn mk_entry(content: &str) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::AssistantMessage,
            content: content.into(),
            metadata: None,
        }
    }

    #[test]
    fn empty_stream_yields_empty_vec() {
        let out = rebuild_entries(&[]);
        assert!(out.is_empty());
    }

    #[test]
    fn appends_entries_in_order() {
        let a = mk_entry("a");
        let b = mk_entry("b");
        let add_a = Patch(vec![PatchOperation::Add(json_patch::AddOperation {
            path: jsonptr::Pointer::parse("/entries/0").unwrap().to_owned(),
            value: serde_json::to_value(&a).unwrap(),
        })]);
        let add_b = Patch(vec![PatchOperation::Add(json_patch::AddOperation {
            path: jsonptr::Pointer::parse("/entries/1").unwrap().to_owned(),
            value: serde_json::to_value(&b).unwrap(),
        })]);
        let msgs = vec![LogMsg::JsonPatch(add_a), LogMsg::JsonPatch(add_b)];
        let out = rebuild_entries(&msgs);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].content, "a");
        assert_eq!(out[1].content, "b");
    }

    #[test]
    fn ignores_non_patch_messages() {
        let a = mk_entry("a");
        let add_a = Patch(vec![PatchOperation::Add(json_patch::AddOperation {
            path: jsonptr::Pointer::parse("/entries/0").unwrap().to_owned(),
            value: serde_json::to_value(&a).unwrap(),
        })]);
        let msgs = vec![
            LogMsg::Stdout("noise".into()),
            LogMsg::JsonPatch(add_a),
            LogMsg::Ready,
            LogMsg::Finished,
        ];
        let out = rebuild_entries(&msgs);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].content, "a");
    }
}
```

- [ ] **Step 2: 在 `crates/executors/src/logs/mod.rs` 里 export**

追加:

```rust
pub mod rebuild;
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cargo test -p executors logs::rebuild`
Expected: FAIL — 某个 import 缺失或 patch 路径不匹配

- [ ] **Step 4: 如果测试因为 `NormalizedConversation::default()` 不存在而失败,在 `logs/mod.rs` 给它加 `#[derive(Default)]`**

- [ ] **Step 5: 再跑**

Run: `cargo test -p executors logs::rebuild`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crates/executors/src/logs/rebuild.rs crates/executors/src/logs/mod.rs
git commit -m "feat(executors): add rebuild_entries helper for NormalizedEntry replay"
```

---

### Task 2.2: 实现 messages 过滤与分页

**Files:**
- Create: `crates/executors/src/logs/messages.rs`
- Modify: `crates/executors/src/logs/mod.rs` — export

- [ ] **Step 1: 新建文件 + 失败测试**

`crates/executors/src/logs/messages.rs`:

```rust
//! Projection layer over `Vec<NormalizedEntry>` that the MCP `read_session_messages`
//! tool + the REST `/api/sessions/{id}/messages` route share.

use crate::logs::{NormalizedEntry, NormalizedEntryType};

pub const DEFAULT_LAST_N: u32 = 20;
pub const MAX_LAST_N: u32 = 200;

/// D5a: entry types never surfaced to external readers.
fn is_permanently_filtered(entry_type: &NormalizedEntryType) -> bool {
    matches!(
        entry_type,
        NormalizedEntryType::Loading
            | NormalizedEntryType::TokenUsageInfo(_)
            | NormalizedEntryType::NextAction { .. }
            | NormalizedEntryType::UserAnsweredQuestions { .. }
    )
}

pub fn filter(entries: &[NormalizedEntry], include_thinking: bool) -> Vec<&NormalizedEntry> {
    entries
        .iter()
        .filter(|e| !is_permanently_filtered(&e.entry_type))
        .filter(|e| include_thinking || !matches!(e.entry_type, NormalizedEntryType::Thinking))
        .collect()
}

#[derive(Debug, Clone)]
pub struct PageParams {
    pub last_n: Option<u32>,
    pub from_index: Option<u32>,
    pub include_thinking: bool,
}

pub struct Page<'a> {
    pub entries: Vec<&'a NormalizedEntry>,
    pub total_count: u32,
    pub has_more: bool,
    pub start_index: u32,
}

pub fn page<'a>(entries: &'a [NormalizedEntry], params: &PageParams) -> Page<'a> {
    let filtered = filter(entries, params.include_thinking);
    let total = filtered.len() as u32;

    let (start, end) = if let Some(from) = params.from_index {
        let from = from.min(total);
        let n = params.last_n.unwrap_or(DEFAULT_LAST_N).min(MAX_LAST_N);
        (from, (from + n).min(total))
    } else {
        let n = params.last_n.unwrap_or(DEFAULT_LAST_N).min(MAX_LAST_N);
        let start = total.saturating_sub(n);
        (start, total)
    };

    Page {
        entries: filtered[start as usize..end as usize].to_vec(),
        total_count: total,
        has_more: start > 0,
        start_index: start,
    }
}

/// Extract the last AssistantMessage's content (full text, not truncated).
pub fn final_assistant_message(entries: &[NormalizedEntry]) -> Option<String> {
    entries
        .iter()
        .rev()
        .find(|e| matches!(e.entry_type, NormalizedEntryType::AssistantMessage))
        .map(|e| e.content.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logs::{NormalizedEntry, NormalizedEntryType, TokenUsageInfo};

    fn mk(t: NormalizedEntryType, content: &str) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: t,
            content: content.into(),
            metadata: None,
        }
    }

    #[test]
    fn d5a_entries_are_filtered_out() {
        let entries = vec![
            mk(NormalizedEntryType::UserMessage, "hi"),
            mk(NormalizedEntryType::Loading, ""),
            mk(NormalizedEntryType::NextAction { failed: false, execution_processes: 0, needs_setup: false }, ""),
            mk(NormalizedEntryType::TokenUsageInfo(TokenUsageInfo::default()), ""),
            mk(NormalizedEntryType::AssistantMessage, "hello"),
        ];
        let out = filter(&entries, false);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].content, "hi");
        assert_eq!(out[1].content, "hello");
    }

    #[test]
    fn thinking_is_off_by_default() {
        let entries = vec![
            mk(NormalizedEntryType::Thinking, "plan"),
            mk(NormalizedEntryType::AssistantMessage, "ok"),
        ];
        assert_eq!(filter(&entries, false).len(), 1);
        assert_eq!(filter(&entries, true).len(), 2);
    }

    #[test]
    fn last_n_windows_at_tail() {
        let entries: Vec<_> = (0..50)
            .map(|i| mk(NormalizedEntryType::UserMessage, &format!("{i}")))
            .collect();
        let page = page(&entries, &PageParams { last_n: Some(5), from_index: None, include_thinking: false });
        assert_eq!(page.total_count, 50);
        assert_eq!(page.entries.len(), 5);
        assert_eq!(page.entries.first().unwrap().content, "45");
        assert!(page.has_more);
    }

    #[test]
    fn from_index_overrides_tail_default() {
        let entries: Vec<_> = (0..10)
            .map(|i| mk(NormalizedEntryType::UserMessage, &format!("{i}")))
            .collect();
        let page = page(&entries, &PageParams { last_n: Some(3), from_index: Some(2), include_thinking: false });
        assert_eq!(page.entries.len(), 3);
        assert_eq!(page.entries[0].content, "2");
        assert_eq!(page.start_index, 2);
    }

    #[test]
    fn last_n_capped_at_max() {
        let entries: Vec<_> = (0..500)
            .map(|i| mk(NormalizedEntryType::UserMessage, &format!("{i}")))
            .collect();
        let page = page(&entries, &PageParams { last_n: Some(9999), from_index: None, include_thinking: false });
        assert_eq!(page.entries.len(), MAX_LAST_N as usize);
    }

    #[test]
    fn final_assistant_message_extracts_last() {
        let entries = vec![
            mk(NormalizedEntryType::AssistantMessage, "first"),
            mk(NormalizedEntryType::UserMessage, "hi again"),
            mk(NormalizedEntryType::AssistantMessage, "last"),
        ];
        assert_eq!(final_assistant_message(&entries).as_deref(), Some("last"));
    }

    #[test]
    fn final_assistant_message_handles_no_assistant() {
        let entries = vec![mk(NormalizedEntryType::UserMessage, "alone")];
        assert!(final_assistant_message(&entries).is_none());
    }
}
```

- [ ] **Step 2: 在 `crates/executors/src/logs/mod.rs` 里加 `pub mod messages;`**

- [ ] **Step 3: 跑测试**

Run: `cargo test -p executors logs::messages`
Expected: PASS (6 tests)

- [ ] **Step 4: Commit**

```bash
git add crates/executors/src/logs/messages.rs crates/executors/src/logs/mod.rs
git commit -m "feat(executors): add filter/paginate/extract helpers for session messages"
```

---

### Task 2.3: 新增服务端路由 `GET /api/sessions/{id}/messages`

**Files:**
- Modify: `crates/server/src/routes/sessions/mod.rs`

- [ ] **Step 1: 在路由 handler 外围写集成测试**

在 `crates/server/tests/session_messages.rs` 新建:

```rust
use axum::http::StatusCode;
use serde_json::Value;

#[tokio::test]
async fn returns_messages_with_pagination_defaults() {
    let app = test_support::build_app().await;
    let session_id = test_support::seed_session_with_entries(&app, 30).await;

    let resp = app.get(&format!("/api/sessions/{session_id}/messages")).send().await;
    assert_eq!(resp.status(), StatusCode::OK);

    let body: Value = resp.json().await;
    assert_eq!(body["success"], true);
    let data = &body["data"];
    assert_eq!(data["total_count"], 30);
    assert_eq!(data["has_more"], true);
    assert_eq!(data["messages"].as_array().unwrap().len(), 20);
    assert!(data["final_assistant_message"].is_string());
}

#[tokio::test]
async fn include_thinking_false_by_default() {
    let app = test_support::build_app().await;
    let session_id = test_support::seed_session_with_thinking(&app).await;

    let resp = app.get(&format!("/api/sessions/{session_id}/messages")).send().await;
    let body: Value = resp.json().await;
    let messages = body["data"]["messages"].as_array().unwrap();
    for m in messages {
        assert_ne!(m["entry_type"], "thinking");
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test -p server --test session_messages`
Expected: FAIL(路由 404 或 fixture 未就绪)

- [ ] **Step 3: 实现路由 handler**

在 `crates/server/src/routes/sessions/mod.rs` 增加:

```rust
use executors::logs::messages::{page, final_assistant_message, PageParams, DEFAULT_LAST_N, MAX_LAST_N};
use executors::logs::rebuild::rebuild_entries;
use executors::logs::NormalizedEntry;
use futures::StreamExt;
use serde::Deserialize;
use utils::log_msg::LogMsg;

#[derive(Debug, Deserialize)]
pub struct MessagesQuery {
    #[serde(default)]
    pub last_n: Option<u32>,
    #[serde(default)]
    pub from_index: Option<u32>,
    #[serde(default)]
    pub include_thinking: Option<bool>,
}

#[derive(Debug, serde::Serialize, ts_rs::TS)]
pub struct SessionMessage {
    pub index: u32,
    pub entry_type: String,
    pub content: String,
    pub timestamp: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, serde::Serialize, ts_rs::TS)]
pub struct SessionMessagesResponse {
    pub messages: Vec<SessionMessage>,
    pub total_count: u32,
    pub has_more: bool,
    pub final_assistant_message: Option<String>,
}

pub async fn get_session_messages(
    State(deployment): State<DeploymentImpl>,
    Path(session_id): Path<Uuid>,
    Query(query): Query<MessagesQuery>,
) -> Result<ResponseJson<ApiResponse<SessionMessagesResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // 1. Find latest execution process for this session.
    let session = db::models::session::Session::find_by_id(pool, session_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest(format!("session {session_id} not found")))?;
    let execution_id = db::models::execution_process::ExecutionProcess::find_latest_by_session_id(pool, session.id)
        .await?
        .ok_or_else(|| ApiError::BadRequest(format!("no execution for session {session_id}")))?
        .id;

    // 2. Collect LogMsg stream → rebuild NormalizedEntry vec.
    let container = deployment.container();
    let mut msgs: Vec<LogMsg> = Vec::new();
    if let Some(mut stream) = container.stream_normalized_logs(&execution_id).await {
        while let Some(item) = stream.next().await {
            match item {
                Ok(m) => msgs.push(m),
                Err(_) => break,
            }
        }
    }
    let entries: Vec<NormalizedEntry> = rebuild_entries(&msgs);

    // 3. Filter + paginate.
    let include_thinking = query.include_thinking.unwrap_or(false);
    let params = PageParams {
        last_n: query.last_n,
        from_index: query.from_index,
        include_thinking,
    };
    let page = page(&entries, &params);

    // 4. final_assistant_message from *filtered* entries to avoid Thinking leak.
    let final_msg = {
        let filtered_all: Vec<NormalizedEntry> = executors::logs::messages::filter(&entries, include_thinking)
            .into_iter().cloned().collect();
        final_assistant_message(&filtered_all)
    };

    let messages = page
        .entries
        .iter()
        .enumerate()
        .map(|(i, e)| SessionMessage {
            index: page.start_index + i as u32,
            entry_type: entry_type_discriminant(&e.entry_type),
            content: e.content.clone(),
            timestamp: e.timestamp.clone(),
            metadata: merged_metadata(e),
        })
        .collect();

    Ok(ResponseJson(ApiResponse::success(SessionMessagesResponse {
        messages,
        total_count: page.total_count,
        has_more: page.has_more,
        final_assistant_message: final_msg,
    })))
}

/// Extract the serde tag (`user_message` / `assistant_message` / `tool_use` / etc.)
fn entry_type_discriminant(t: &executors::logs::NormalizedEntryType) -> String {
    let v = serde_json::to_value(t).unwrap_or(serde_json::Value::Null);
    v.get("type").and_then(|x| x.as_str()).unwrap_or("unknown").to_string()
}

/// Merge NormalizedEntry.metadata with any inner fields of tagged variants
/// (e.g. ToolUse { tool_name, action_type, status }).
fn merged_metadata(entry: &NormalizedEntry) -> Option<serde_json::Value> {
    let mut combined = serde_json::Map::new();
    if let Ok(v) = serde_json::to_value(&entry.entry_type) {
        if let Some(obj) = v.as_object() {
            for (k, v) in obj {
                if k != "type" {
                    combined.insert(k.clone(), v.clone());
                }
            }
        }
    }
    if let Some(m) = &entry.metadata {
        if let Some(obj) = m.as_object() {
            for (k, v) in obj {
                combined.insert(k.clone(), v.clone());
            }
        }
    }
    if combined.is_empty() { None } else { Some(serde_json::Value::Object(combined)) }
}
```

在 `router()` 注册:

```rust
.route("/api/sessions/:session_id/messages", get(get_session_messages))
```

> 如果 `ExecutionProcess::find_latest_by_session_id` 不存在,顺手加:

```rust
// crates/db/src/models/execution_process.rs
pub async fn find_latest_by_session_id(pool: &SqlitePool, session_id: Uuid)
    -> Result<Option<Self>, sqlx::Error>
{
    sqlx::query_as!(
        ExecutionProcess,
        r#"SELECT ... FROM execution_processes WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1"#,
        session_id
    ).fetch_optional(pool).await
}
```

(把 SELECT 列照着现有 `find_by_id` 拷贝)

- [ ] **Step 4: 跑测试**

Run: `cargo test -p server --test session_messages`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/sessions/mod.rs crates/db/src/models/execution_process.rs crates/server/tests/session_messages.rs
git commit -m "feat(server): add GET /api/sessions/:id/messages with pagination"
```

---

### Task 2.4: 新 MCP tool `read_session_messages`

**Files:**
- Modify: `crates/mcp/src/task_server/tools/sessions.rs`

- [ ] **Step 1: 加 tool 单元测试**

```rust
#[cfg(test)]
mod read_session_messages_tests {
    use super::*;

    #[test]
    fn request_deserialises_with_defaults() {
        let req: ReadSessionMessagesRequest = serde_json::from_value(serde_json::json!({
            "workspace_id": "00000000-0000-0000-0000-000000000000"
        })).unwrap();
        assert_eq!(req.last_n, None);
        assert_eq!(req.from_index, None);
        assert_eq!(req.include_thinking, None);
    }

    #[test]
    fn response_serialises_empty_state() {
        let resp = ReadSessionMessagesResponse {
            messages: vec![],
            total_count: 0,
            has_more: false,
            final_assistant_message: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"total_count\":0"));
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test -p mcp read_session_messages_tests`
Expected: FAIL — 类型未定义

- [ ] **Step 3: 在 `sessions.rs` 实现 tool**

```rust
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct ReadSessionMessagesRequest {
    #[schemars(description = "要读取会话所属的 workspace ID。")]
    workspace_id: Uuid,
    #[schemars(description = "从尾部返回多少条消息。默认 20,最大 200。")]
    last_n: Option<u32>,
    #[schemars(description = "从第几条开始读(0-based)。设了之后覆盖 last_n。")]
    from_index: Option<u32>,
    #[schemars(description = "是否包含 thinking 内容。默认 false 以降低 token 成本。")]
    include_thinking: Option<bool>,
}

#[derive(Debug, serde::Serialize, schemars::JsonSchema)]
struct ReadSessionMessagesResponse {
    messages: Vec<SessionMessageSummary>,
    total_count: u32,
    has_more: bool,
    final_assistant_message: Option<String>,
}

#[derive(Debug, serde::Serialize, schemars::JsonSchema)]
struct SessionMessageSummary {
    index: u32,
    entry_type: String,
    content: String,
    timestamp: Option<String>,
    metadata: Option<serde_json::Value>,
}

#[tool(description = "Read the messages exchanged inside a child workspace's latest session. \
Paginated and filters Loading/TokenUsage/NextAction noise by default.")]
async fn read_session_messages(
    &self,
    Parameters(ReadSessionMessagesRequest { workspace_id, last_n, from_index, include_thinking }): Parameters<ReadSessionMessagesRequest>,
) -> Result<CallToolResult, ErrorData> {
    let workspace_id = match self.resolve_workspace_id(workspace_id) {
        Ok(id) => id,
        Err(e) => return Ok(Self::tool_error(e)),
    };
    // scope check upgraded to check_scope_allows_workspace in PR-X3; for now
    // use the legacy sync check. PR-X3 will rewire the call site.
    if let Err(e) = self.scope_allows_workspace(workspace_id) {
        return Ok(Self::tool_error(e));
    }

    // Resolve the latest session for this workspace.
    let sessions_url = self.url(&format!("/api/sessions?workspace_id={workspace_id}"));
    let sessions: Vec<db::models::session::Session> =
        match self.send_json(self.client.get(&sessions_url)).await {
            Ok(v) => v,
            Err(e) => return Ok(Self::tool_error(e)),
        };
    let session = match sessions.into_iter().next_back() {
        Some(s) => s,
        None => return Ok(Self::tool_error(ToolError::new(
            format!("no session for workspace {workspace_id}"), None))),
    };

    // Call the new REST endpoint.
    let mut url = self.url(&format!("/api/sessions/{}/messages", session.id));
    let mut params = Vec::new();
    if let Some(n) = last_n { params.push(format!("last_n={n}")); }
    if let Some(i) = from_index { params.push(format!("from_index={i}")); }
    if let Some(t) = include_thinking { params.push(format!("include_thinking={t}")); }
    if !params.is_empty() { url.push('?'); url.push_str(&params.join("&")); }

    let resp: crate::task_server::routes::SessionMessagesResponse =
        match self.send_json(self.client.get(&url)).await {
            Ok(v) => v,
            Err(e) => return Ok(Self::tool_error(e)),
        };

    Self::success(&ReadSessionMessagesResponse {
        messages: resp.messages.into_iter().map(|m| SessionMessageSummary {
            index: m.index,
            entry_type: m.entry_type,
            content: m.content,
            timestamp: m.timestamp,
            metadata: m.metadata,
        }).collect(),
        total_count: resp.total_count,
        has_more: resp.has_more,
        final_assistant_message: resp.final_assistant_message,
    })
}
```

在 Orchestrator mode router 的 tool 列表里注册新 tool。

- [ ] **Step 4: 跑测试**

Run: `cargo test -p mcp read_session_messages_tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/mcp/src/task_server/tools/sessions.rs crates/mcp/src/task_server/mod.rs
git commit -m "feat(mcp): add read_session_messages tool"
```

---

### Task 2.5: Regen types + 集成 smoke

**Files:**
- Regen: `shared/types.ts`

- [ ] **Step 1: Regen**

Run: `pnpm run generate-types`

- [ ] **Step 2: 跑前后端 check**

Run: `pnpm run check && cargo clippy --workspace --all-targets -- -D warnings`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "chore: regen shared types for PR-X2"
```

---

### 🛑 PR-X2 Push Gate Checkpoint

- [ ] 汇总:`git log --oneline origin/main..HEAD`
- [ ] 手工 smoke:`pnpm run dev` → MCP 调 `read_session_messages(workspace_id=<已完成 child>)` → 检查 `final_assistant_message` 等于 child 最后 assistant 输出
- [ ] 停,等授权 push
- [ ] `git push` + 开 PR

---

# PR-X3 — Task CRUD + 复合 tool + 并发 + scope 放宽

**PR 范围:** `Task::create/update/delete(含 D13 tx)/create_in_tx`;`Workspace::create_in_tx`;服务端 `/api/tasks/*` CRUD + `/api/tasks/start` 原子复合 + 并发上限(D7);MCP 5 新 tool + 2 扩展;`scope_allows_workspace` → `check_scope_allows_workspace` (async + memoize,D12);`WorkspaceSummary.task_id` 字段。

**文件拓扑:**
- **修改** `crates/db/src/models/task.rs` — 加 `create` / `update` / `delete`(事务)/ `create_in_tx` / `find_by_parent_workspace_id`
- **修改** `crates/db/src/models/workspace.rs` — 加 `create_in_tx`
- **修改** `crates/services/src/services/workspace.rs` — 加 `create_in_tx` helper
- **新建** `crates/services/src/services/task_concurrency.rs`
- **新建** `crates/server/src/routes/tasks/mod.rs` — CRUD + `/start`
- **修改** `crates/server/src/routes/mod.rs` — wire
- **新建** `crates/mcp/src/task_server/tools/tasks.rs` — 6 个 tool
- **新建** `crates/mcp/src/task_server/api_client.rs` — ApiClient 薄包装
- **修改** `crates/mcp/src/task_server/mod.rs` — 暴露 `api()`、注册新 tool
- **修改** `crates/mcp/src/task_server/tools/mod.rs` — `scope_allows_workspace` 改 async + memoize + 放宽规则
- **修改** `crates/mcp/src/task_server/tools/workspaces.rs` — `list_workspaces` 加 filter、`WorkspaceSummary` 加 `task_id`
- **修改** `crates/mcp/src/task_server/tools/task_attempts.rs` — `start_workspace` 加可选 `task_id`
- **修改** `crates/api-types/src/lib.rs` — `TaskCreate / TaskUpdate / CreateAndStartTaskRequest / CreateAndStartTaskResponse`
- **Regen** `shared/types.ts`

---

### Task 3.1: `Task::create` (最小)

**Files:**
- Modify: `crates/db/src/models/task.rs`

- [ ] **Step 1: 加单测**

在 `crates/db/src/models/task.rs` 末尾加 (用 sqlx test 宏):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    #[sqlx::test]
    async fn create_inserts_task(pool: SqlitePool) -> sqlx::Result<()> {
        let project_id = seed_project(&pool).await;
        let task = Task::create(&pool, TaskCreateParams {
            project_id,
            title: "todo-1".into(),
            description: Some("desc".into()),
            parent_workspace_id: None,
        }).await?;
        assert_eq!(task.title, "todo-1");
        assert_eq!(task.status, TaskStatus::Todo);
        let back = Task::find_by_id(&pool, task.id).await?.expect("persisted");
        assert_eq!(back.id, task.id);
        Ok(())
    }

    async fn seed_project(pool: &SqlitePool) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query!("INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, 'p', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", id)
            .execute(pool).await.unwrap();
        id
    }
}
```

- [ ] **Step 2: 跑失败**

Run: `cargo test -p db task::tests::create_inserts_task`
Expected: FAIL — `Task::create` / `TaskCreateParams` 未定义

- [ ] **Step 3: 实现**

在 `crates/db/src/models/task.rs` 追加:

```rust
pub struct TaskCreateParams {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub parent_workspace_id: Option<Uuid>,
}

impl Task {
    pub async fn create(pool: &SqlitePool, params: TaskCreateParams) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query!(
            r#"INSERT INTO tasks (id, project_id, title, description, status, parent_workspace_id, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 'todo', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"#,
            id, params.project_id, params.title, params.description, params.parent_workspace_id
        ).execute(pool).await?;
        Self::find_by_id(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
    }
}
```

- [ ] **Step 4: `pnpm run prepare-db`**(每次新增 sqlx query 后跑)

- [ ] **Step 5: 跑测试**

Run: `cargo test -p db task::tests::create_inserts_task`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crates/db/src/models/task.rs .sqlx/
git commit -m "feat(db): add Task::create"
```

---

### Task 3.2: `Task::update` (title/description/status)

- [ ] **Step 1: 单测**

在同 tests mod 追加:

```rust
    #[sqlx::test]
    async fn update_changes_fields(pool: SqlitePool) -> sqlx::Result<()> {
        let project_id = seed_project(&pool).await;
        let task = Task::create(&pool, TaskCreateParams {
            project_id, title: "a".into(), description: None, parent_workspace_id: None
        }).await?;
        Task::update(&pool, task.id, TaskUpdateParams {
            title: Some("b".into()),
            description: Some(Some("desc".into())),
            status: Some(TaskStatus::InProgress),
        }).await?;
        let back = Task::find_by_id(&pool, task.id).await?.unwrap();
        assert_eq!(back.title, "b");
        assert_eq!(back.description.as_deref(), Some("desc"));
        assert_eq!(back.status, TaskStatus::InProgress);
        Ok(())
    }
```

- [ ] **Step 2: FAIL:** `cargo test -p db task::tests::update_changes_fields`

- [ ] **Step 3: 实现**

```rust
pub struct TaskUpdateParams {
    pub title: Option<String>,
    pub description: Option<Option<String>>, // None = no change; Some(None) = set NULL
    pub status: Option<TaskStatus>,
}

impl Task {
    pub async fn update(pool: &SqlitePool, id: Uuid, params: TaskUpdateParams) -> Result<(), sqlx::Error> {
        // Build dynamic UPDATE; simpler: fetch, apply, write back.
        let mut task = Self::find_by_id(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
        if let Some(t) = params.title { task.title = t; }
        if let Some(d) = params.description { task.description = d; }
        if let Some(s) = params.status { task.status = s; }
        sqlx::query!(
            r#"UPDATE tasks SET title = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?"#,
            task.title, task.description, task.status, id
        ).execute(pool).await?;
        Ok(())
    }
}
```

- [ ] **Step 4: prepare-db,跑 PASS**

- [ ] **Step 5: Commit**

```bash
git add crates/db/src/models/task.rs .sqlx/
git commit -m "feat(db): add Task::update"
```

---

### Task 3.3: `Task::delete` — D13 事务级联

- [ ] **Step 1: 单测(happy path + 保留 workspace)**

```rust
    #[sqlx::test]
    async fn delete_cascades_workspace_task_id_to_null(pool: SqlitePool) -> sqlx::Result<()> {
        let project_id = seed_project(&pool).await;
        let task = Task::create(&pool, TaskCreateParams {
            project_id, title: "parent".into(), description: None, parent_workspace_id: None
        }).await?;
        let ws_id = seed_workspace_with_task(&pool, task.id).await;

        Task::delete(&pool, task.id).await?;

        // task removed
        assert!(Task::find_by_id(&pool, task.id).await?.is_none());
        // workspace preserved, task_id cleared
        let ws_task_id: Option<Uuid> = sqlx::query_scalar!(
            r#"SELECT task_id as "x: Uuid" FROM workspaces WHERE id = ?"#, ws_id
        ).fetch_one(&pool).await?;
        assert_eq!(ws_task_id, None);
        Ok(())
    }

    async fn seed_workspace_with_task(pool: &SqlitePool, task_id: Uuid) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query!(
            "INSERT INTO workspaces (id, task_id, branch, created_at, updated_at, archived, pinned, worktree_deleted) \
             VALUES (?, ?, 'main', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, 0)",
            id, task_id
        ).execute(pool).await.unwrap();
        id
    }
```

- [ ] **Step 2: FAIL:** `cargo test -p db task::tests::delete_cascades`

- [ ] **Step 3: 实现 D13 事务**

```rust
impl Task {
    /// D13: atomically clear workspace.task_id references, then delete the task.
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;
        sqlx::query!("UPDATE workspaces SET task_id = NULL WHERE task_id = ?", id)
            .execute(&mut *tx).await?;
        let rows = sqlx::query!("DELETE FROM tasks WHERE id = ?", id)
            .execute(&mut *tx).await?;
        if rows.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        tx.commit().await?;
        Ok(())
    }
}
```

- [ ] **Step 4: prepare-db + PASS**

- [ ] **Step 5: Commit**

```bash
git add crates/db/src/models/task.rs .sqlx/
git commit -m "feat(db): Task::delete with transactional workspace.task_id cascade (D13)"
```

---

### Task 3.4: `Task::create_in_tx` 和 `Workspace::create_in_tx`

- [ ] **Step 1: 加两个 `in_tx` 版本的测试**

```rust
    #[sqlx::test]
    async fn create_in_tx_rolls_back_on_abort(pool: SqlitePool) -> sqlx::Result<()> {
        let project_id = seed_project(&pool).await;
        let mut tx = pool.begin().await?;
        Task::create_in_tx(&mut tx, TaskCreateParams {
            project_id, title: "t".into(), description: None, parent_workspace_id: None
        }).await?;
        // drop tx without commit
        drop(tx);
        let all = Task::find_all(&pool).await?;
        assert!(all.iter().all(|t| t.title != "t"));
        Ok(())
    }
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: 实现 `Task::create_in_tx`**

```rust
use sqlx::{Sqlite, Transaction};

impl Task {
    pub async fn create_in_tx(
        tx: &mut Transaction<'_, Sqlite>,
        params: TaskCreateParams,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query!(
            r#"INSERT INTO tasks (id, project_id, title, description, status, parent_workspace_id, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 'todo', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"#,
            id, params.project_id, params.title, params.description, params.parent_workspace_id
        ).execute(&mut **tx).await?;
        // We can't call find_by_id(&pool) inside a tx easily; re-select within tx:
        let task = sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", parent_workspace_id as "parent_workspace_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks WHERE id = ?"#,
            id
        ).fetch_one(&mut **tx).await?;
        Ok(task)
    }
}
```

- [ ] **Step 4: 同理实现 `Workspace::create_in_tx` — 先加测试,后加实现**

复用现有 `Workspace::create` 的 SQL,改成接 `&mut Transaction` 而不是 `&SqlitePool`。提取公共参数结构 `WorkspaceCreateParams`(如果还不存在)。

- [ ] **Step 5: prepare-db + PASS**

- [ ] **Step 6: Commit**

```bash
git add crates/db/src/models/task.rs crates/db/src/models/workspace.rs .sqlx/
git commit -m "feat(db): add Task::create_in_tx and Workspace::create_in_tx"
```

---

### Task 3.5: `Task::find_by_parent_workspace_id`

- [ ] **Step 1: 测试**

```rust
    #[sqlx::test]
    async fn find_by_parent_returns_only_matching(pool: SqlitePool) -> sqlx::Result<()> {
        let project_id = seed_project(&pool).await;
        let parent = Uuid::new_v4();
        sqlx::query!("INSERT INTO workspaces (id, branch, created_at, updated_at, archived, pinned, worktree_deleted) VALUES (?, 'main', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, 0)", parent).execute(&pool).await.unwrap();
        let _a = Task::create(&pool, TaskCreateParams { project_id, title: "a".into(), description: None, parent_workspace_id: Some(parent) }).await?;
        let _b = Task::create(&pool, TaskCreateParams { project_id, title: "b".into(), description: None, parent_workspace_id: None }).await?;

        let list = Task::find_by_parent_workspace_id(&pool, parent).await?;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "a");
        Ok(())
    }
```

- [ ] **Step 2-5: FAIL → 实现 → prepare-db → PASS → Commit**

```rust
impl Task {
    pub async fn find_by_parent_workspace_id(pool: &SqlitePool, parent: Uuid)
        -> Result<Vec<Self>, sqlx::Error>
    {
        sqlx::query_as!(Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", parent_workspace_id as "parent_workspace_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks WHERE parent_workspace_id = ? ORDER BY created_at ASC"#,
            parent
        ).fetch_all(pool).await
    }
}
```

```bash
git add crates/db/src/models/task.rs .sqlx/
git commit -m "feat(db): Task::find_by_parent_workspace_id"
```

---

### Task 3.6: services 层 `workspace::create_in_tx` helper

**Files:**
- Modify: `crates/services/src/services/workspace.rs`

- [ ] **Step 1: 测试**

```rust
#[cfg(test)]
mod create_in_tx_tests {
    use super::*;
    use sqlx::SqlitePool;

    #[sqlx::test]
    async fn creates_workspace_with_repos_in_tx(pool: SqlitePool) -> sqlx::Result<()> {
        let mut tx = pool.begin().await?;
        let ws = workspace::create_in_tx(&mut tx, WorkspaceCreateParams {
            name: Some("hello".into()),
            task_id: None,
            branch: "main".into(),
            repo_ids: vec![],
        }).await.expect("create");
        tx.commit().await?;
        assert_eq!(ws.name.as_deref(), Some("hello"));
        Ok(())
    }
}
```

- [ ] **Step 2: FAIL → 实现 → PASS → Commit**

实现:抽取 `create_and_start_workspace` 里纯 DB 写的部分成 `pub async fn create_in_tx(tx, params) -> Result<Workspace, ServiceError>`。不包含 `start_execution` 调用。

```bash
git add crates/services/src/services/workspace.rs .sqlx/
git commit -m "feat(services): workspace::create_in_tx helper for atomic tasks flow"
```

---

### Task 3.7: `TaskConcurrency` service

**Files:**
- Create: `crates/services/src/services/task_concurrency.rs`

- [ ] **Step 1: 测试**

```rust
use super::*;
use sqlx::SqlitePool;

#[sqlx::test]
async fn running_children_count_is_accurate(pool: SqlitePool) {
    let parent = seed_workspace(&pool).await;
    seed_running_child(&pool, parent).await;
    seed_running_child(&pool, parent).await;
    seed_completed_child(&pool, parent).await;

    let count = TaskConcurrency::running_children(&pool, parent).await.unwrap();
    assert_eq!(count, 2);
}

#[sqlx::test]
async fn limit_default_is_five() {
    std::env::remove_var("VK_MAX_CHILDREN_PER_PARENT");
    assert_eq!(TaskConcurrency::limit(), 5);
}

#[sqlx::test]
async fn limit_reads_env_override() {
    std::env::set_var("VK_MAX_CHILDREN_PER_PARENT", "12");
    assert_eq!(TaskConcurrency::limit(), 12);
    std::env::remove_var("VK_MAX_CHILDREN_PER_PARENT");
}
```

> `seed_*` helpers: 与 task tests 中做类似的工作 — insert workspace + task + execution_process row with `status = 'running' or 'completed'`. 拷贝已有 fixture 模式。

- [ ] **Step 2: FAIL**

- [ ] **Step 3: 实现**

```rust
//! Counts Running child workspaces by parent, enforces MAX_CHILDREN_PER_PARENT.

use sqlx::SqlitePool;
use uuid::Uuid;

pub struct TaskConcurrency;

impl TaskConcurrency {
    pub fn limit() -> u32 {
        std::env::var("VK_MAX_CHILDREN_PER_PARENT")
            .ok().and_then(|s| s.parse().ok()).unwrap_or(5)
    }

    /// Count workspaces whose latest ExecutionProcess is Running and whose
    /// Task.parent_workspace_id == parent.
    pub async fn running_children(pool: &SqlitePool, parent: Uuid) -> Result<u32, sqlx::Error> {
        let rows = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "c!: i64"
               FROM workspaces w
               JOIN tasks t ON t.id = w.task_id
               JOIN execution_processes ep ON ep.workspace_id = w.id
               WHERE t.parent_workspace_id = ?
                 AND ep.status = 'running'
                 AND ep.created_at = (
                     SELECT MAX(created_at) FROM execution_processes WHERE workspace_id = w.id
                 )"#,
            parent
        ).fetch_one(pool).await?;
        Ok(rows as u32)
    }

    pub async fn check_room(pool: &SqlitePool, parent: Uuid) -> Result<bool, sqlx::Error> {
        Ok(Self::running_children(pool, parent).await? < Self::limit())
    }
}
```

> 注:execution_process 的 SQL 里可能没有 `workspace_id` 字段(可能是 `session_id`),按实际 schema 调整。调整前先 `sqlx::query!("PRAGMA table_info(execution_processes)")` 确认。

- [ ] **Step 4: prepare-db + PASS + Commit**

```bash
git add crates/services/src/services/task_concurrency.rs crates/services/src/services/mod.rs .sqlx/
git commit -m "feat(services): add TaskConcurrency service"
```

---

### Task 3.8: Task CRUD 路由

**Files:**
- Create: `crates/server/src/routes/tasks/mod.rs`
- Modify: `crates/server/src/routes/mod.rs` — register

- [ ] **Step 1: 集成测试**

`crates/server/tests/task_crud.rs`:

```rust
use axum::http::StatusCode;
use serde_json::Value;

#[tokio::test]
async fn create_get_update_delete_happy_path() {
    let app = test_support::build_app().await;
    let project_id = test_support::seed_project(&app).await;

    // create
    let resp = app.post("/api/tasks").json(&serde_json::json!({
        "project_id": project_id,
        "title": "todo-1",
        "description": "d"
    })).send().await;
    assert_eq!(resp.status(), StatusCode::OK);
    let body: Value = resp.json().await;
    let id = body["data"]["id"].as_str().unwrap().to_string();

    // get
    let resp = app.get(&format!("/api/tasks/{id}")).send().await;
    assert_eq!(resp.status(), StatusCode::OK);

    // update
    let resp = app.put(&format!("/api/tasks/{id}")).json(&serde_json::json!({
        "title": "todo-1-renamed",
        "status": "in_progress"
    })).send().await;
    assert_eq!(resp.status(), StatusCode::OK);

    // delete
    let resp = app.delete(&format!("/api/tasks/{id}")).send().await;
    assert_eq!(resp.status(), StatusCode::OK);
    let resp = app.get(&format!("/api/tasks/{id}")).send().await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn delete_preserves_child_workspace() {
    let app = test_support::build_app().await;
    let task_id = test_support::seed_task_with_child(&app).await;
    let child_ws = test_support::child_workspace_id(&app, task_id).await;

    let resp = app.delete(&format!("/api/tasks/{task_id}")).send().await;
    assert_eq!(resp.status(), StatusCode::OK);

    let resp = app.get(&format!("/api/workspaces/{child_ws}")).send().await;
    assert_eq!(resp.status(), StatusCode::OK);
    let body: Value = resp.json().await;
    assert!(body["data"]["task_id"].is_null());
}
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: 实现 router**

```rust
// crates/server/src/routes/tasks/mod.rs
use axum::{Router, extract::{State, Path, Query}, routing::{get, post, put, delete}, Json, response::Json as ResponseJson};
use serde::Deserialize;
use uuid::Uuid;
use utils::response::ApiResponse;
use db::models::task::{Task, TaskCreateParams, TaskUpdateParams, TaskStatus};
use crate::{error::ApiError, DeploymentImpl};

pub fn router(_dep: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/api/tasks", post(create_task).get(list_tasks))
        .route("/api/tasks/:id", get(get_task).put(update_task).delete(delete_task))
}

#[derive(Deserialize)]
struct CreateBody {
    project_id: Uuid,
    title: String,
    description: Option<String>,
    parent_workspace_id: Option<Uuid>,
}

async fn create_task(State(dep): State<DeploymentImpl>, Json(body): Json<CreateBody>)
    -> Result<ResponseJson<ApiResponse<Task>>, ApiError>
{
    let task = Task::create(&dep.db().pool, TaskCreateParams {
        project_id: body.project_id,
        title: body.title,
        description: body.description,
        parent_workspace_id: body.parent_workspace_id,
    }).await?;
    Ok(ResponseJson(ApiResponse::success(task)))
}

async fn get_task(State(dep): State<DeploymentImpl>, Path(id): Path<Uuid>)
    -> Result<ResponseJson<ApiResponse<Task>>, ApiError>
{
    let t = Task::find_by_id(&dep.db().pool, id).await?
        .ok_or_else(|| ApiError::BadRequest(format!("task {id} not found")))?;
    Ok(ResponseJson(ApiResponse::success(t)))
}

#[derive(Deserialize)]
struct UpdateBody {
    title: Option<String>,
    description: Option<Option<String>>,
    status: Option<TaskStatus>,
}

async fn update_task(State(dep): State<DeploymentImpl>, Path(id): Path<Uuid>, Json(body): Json<UpdateBody>)
    -> Result<ResponseJson<ApiResponse<()>>, ApiError>
{
    Task::update(&dep.db().pool, id, TaskUpdateParams {
        title: body.title,
        description: body.description,
        status: body.status,
    }).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

async fn delete_task(State(dep): State<DeploymentImpl>, Path(id): Path<Uuid>)
    -> Result<ResponseJson<ApiResponse<()>>, ApiError>
{
    Task::delete(&dep.db().pool, id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

#[derive(Deserialize)]
struct ListQuery {
    parent_workspace_id: Option<Uuid>,
}

async fn list_tasks(State(dep): State<DeploymentImpl>, Query(q): Query<ListQuery>)
    -> Result<ResponseJson<ApiResponse<Vec<Task>>>, ApiError>
{
    let tasks = if let Some(p) = q.parent_workspace_id {
        Task::find_by_parent_workspace_id(&dep.db().pool, p).await?
    } else {
        Task::find_all(&dep.db().pool).await?
    };
    Ok(ResponseJson(ApiResponse::success(tasks)))
}
```

修改 `crates/server/src/routes/mod.rs`:
- `pub mod tasks;`
- 在 router 里 `.merge(tasks::router(&deployment))`

- [ ] **Step 4: PASS**

Run: `cargo test -p server --test task_crud`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/tasks/ crates/server/src/routes/mod.rs crates/server/tests/task_crud.rs .sqlx/
git commit -m "feat(server): Task CRUD routes"
```

---

### Task 3.9: `/api/tasks/start` 复合 endpoint + 并发检查

**Files:**
- Modify: `crates/server/src/routes/tasks/mod.rs`

- [ ] **Step 1: 集成测试**

加到 `task_crud.rs`:

```rust
#[tokio::test]
async fn tasks_start_is_atomic() {
    let app = test_support::build_app().await;
    let project_id = test_support::seed_project(&app).await;

    let resp = app.post("/api/tasks/start").json(&serde_json::json!({
        "task": { "project_id": project_id, "title": "atomic" },
        "workspace": { "repos": [], "executor_config": {}, "prompt": "go" }
    })).send().await;
    assert_eq!(resp.status(), StatusCode::OK);
    let body: Value = resp.json().await;
    assert!(body["data"]["task_id"].is_string());
    assert!(body["data"]["workspace_id"].is_string());
    assert!(body["data"]["execution_id"].is_string());
}

#[tokio::test]
async fn tasks_start_rolls_back_on_bad_repo() {
    let app = test_support::build_app().await;
    let project_id = test_support::seed_project(&app).await;

    let resp = app.post("/api/tasks/start").json(&serde_json::json!({
        "task": { "project_id": project_id, "title": "broken" },
        "workspace": { "repos": ["00000000-0000-0000-0000-000000000000"], "executor_config": {}, "prompt": "go" }
    })).send().await;
    assert!(resp.status().is_client_error() || resp.status().is_server_error());

    // no task row with that title
    let tasks = app.get("/api/tasks").send().await.json::<Value>().await;
    assert!(tasks["data"].as_array().unwrap().iter().all(|t| t["title"] != "broken"));
}

#[tokio::test]
async fn tasks_start_enforces_concurrency_limit() {
    std::env::set_var("VK_MAX_CHILDREN_PER_PARENT", "2");
    let app = test_support::build_app().await;
    let parent = test_support::seed_manager_workspace(&app).await;

    for _ in 0..2 {
        let resp = app.post("/api/tasks/start").json(&serde_json::json!({
            "task": { "project_id": parent.project_id, "title": "c", "parent_workspace_id": parent.id },
            "workspace": { "repos": [parent.repo_id], "executor_config": {}, "prompt": "go" }
        })).send().await;
        assert_eq!(resp.status(), StatusCode::OK);
    }
    let resp = app.post("/api/tasks/start").json(&serde_json::json!({
        "task": { "project_id": parent.project_id, "title": "c3", "parent_workspace_id": parent.id },
        "workspace": { "repos": [parent.repo_id], "executor_config": {}, "prompt": "go" }
    })).send().await;
    assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS);
    let body: Value = resp.json().await;
    assert_eq!(body["error"]["kind"], "parent_concurrency_exceeded");

    std::env::remove_var("VK_MAX_CHILDREN_PER_PARENT");
}
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: 实现**

在 `crates/server/src/routes/tasks/mod.rs` 加:

```rust
use services::services::{workspace::{self, WorkspaceCreateParams}, task_concurrency::TaskConcurrency};

#[derive(Deserialize)]
struct StartTaskBody {
    task: TaskSpec,
    workspace: WorkspaceSpec,
}

#[derive(Deserialize)]
struct TaskSpec {
    project_id: Uuid,
    title: String,
    description: Option<String>,
    parent_workspace_id: Option<Uuid>,
}

#[derive(Deserialize)]
struct WorkspaceSpec {
    name: Option<String>,
    repos: Vec<Uuid>,
    executor_config: serde_json::Value,
    prompt: String,
}

#[derive(serde::Serialize, ts_rs::TS)]
pub struct StartTaskResponse {
    pub task_id: Uuid,
    pub workspace_id: Uuid,
    pub execution_id: Uuid,
}

async fn start_task(
    State(dep): State<DeploymentImpl>,
    Json(body): Json<StartTaskBody>,
) -> Result<ResponseJson<ApiResponse<StartTaskResponse>>, ApiError> {
    let pool = &dep.db().pool;

    // D7 concurrency check (before tx, read-only).
    if let Some(parent) = body.task.parent_workspace_id {
        if !TaskConcurrency::check_room(pool, parent).await? {
            return Err(ApiError::TooManyRequestsWithKind {
                message: "parent concurrency exceeded".into(),
                kind: "parent_concurrency_exceeded".into(),
            });
        }
    }

    // D6 atomic tx: create task + workspace + links.
    let mut tx = pool.begin().await?;
    let task = Task::create_in_tx(&mut tx, TaskCreateParams {
        project_id: body.task.project_id,
        title: body.task.title,
        description: body.task.description,
        parent_workspace_id: body.task.parent_workspace_id,
    }).await?;
    let ws = workspace::create_in_tx(&mut tx, WorkspaceCreateParams {
        name: body.workspace.name,
        task_id: Some(task.id),
        branch: "main".into(),
        repo_ids: body.workspace.repos.clone(),
    }).await?;
    tx.commit().await?;

    // Spawn execution AFTER commit (D6 note).
    let container = dep.container();
    let execution_id = container
        .start_execution(/* use ws.id, body.workspace.executor_config, body.workspace.prompt */)
        .await?
        .id;

    Ok(ResponseJson(ApiResponse::success(StartTaskResponse {
        task_id: task.id,
        workspace_id: ws.id,
        execution_id,
    })))
}
```

并加一个新 `ApiError` 变体 `TooManyRequestsWithKind { message: String, kind: String }`,`IntoResponse` 里映射到 `StatusCode::TOO_MANY_REQUESTS` + envelope(kind, retryable: true, human: false)。

在 router 里 `.route("/api/tasks/start", post(start_task))`。

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/tasks/mod.rs crates/server/src/error.rs crates/server/tests/task_crud.rs
git commit -m "feat(server): /api/tasks/start atomic endpoint with parent concurrency guard"
```

---

### Task 3.10: `ApiClient` 薄包装 + `McpServer::api()`

**Files:**
- Create: `crates/mcp/src/task_server/api_client.rs`
- Modify: `crates/mcp/src/task_server/mod.rs`

- [ ] **Step 1: 测试**

```rust
#[cfg(test)]
mod api_client_tests {
    use super::*;

    #[tokio::test]
    async fn get_workspace_decodes_envelope() {
        let server = httpmock::MockServer::start();
        let wid = uuid::Uuid::new_v4();
        server.mock(|when, then| {
            when.method(httpmock::Method::GET).path(format!("/api/workspaces/{wid}"));
            then.status(200).json_body(serde_json::json!({
                "success": true,
                "data": { "id": wid.to_string(), "task_id": null, "branch": "main",
                          "created_at": "2025-01-01T00:00:00Z", "updated_at": "2025-01-01T00:00:00Z",
                          "archived": false, "pinned": false, "worktree_deleted": false }
            }));
        });
        let client = ApiClient::new(reqwest::Client::new(), server.base_url());
        let ws = client.get_workspace(wid).await.unwrap();
        assert_eq!(ws.id, wid);
    }

    #[tokio::test]
    async fn get_task_decodes_envelope() { /* analogous */ }
}
```

> 新增 `httpmock` 到 `[dev-dependencies]` 如未引入。

- [ ] **Step 2: FAIL**

- [ ] **Step 3: 实现**

```rust
//! Thin wrapper over reqwest::Client for MCP → server HTTP calls.
//! Centralises envelope decoding for the handful of routes MCP consumes today.

use db::models::{task::Task, workspace::Workspace};
use reqwest::Client;
use uuid::Uuid;
use utils::response::ApiResponse;

#[derive(thiserror::Error, Debug)]
pub enum ApiClientError {
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error("server error: {0}")]
    Server(String),
    #[error("invalid response shape")]
    BadShape,
}

pub type ApiResult<T> = Result<T, ApiClientError>;

pub struct ApiClient {
    client: Client,
    base_url: String,
}

impl ApiClient {
    pub fn new(client: Client, base_url: String) -> Self { Self { client, base_url } }

    pub async fn get_workspace(&self, id: Uuid) -> ApiResult<Workspace> {
        self.get_json(&format!("/api/workspaces/{id}")).await
    }

    pub async fn get_task(&self, id: Uuid) -> ApiResult<Task> {
        self.get_json(&format!("/api/tasks/{id}")).await
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, path: &str) -> ApiResult<T> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self.client.get(url).send().await?;
        let envelope: ApiResponse<T> = resp.json().await?;
        if !envelope.is_success() {
            return Err(ApiClientError::Server(envelope.message().unwrap_or("").to_string()));
        }
        envelope.into_data().ok_or(ApiClientError::BadShape)
    }
}
```

修改 `McpServer`:

```rust
pub struct McpServer {
    client: reqwest::Client,
    base_url: String,
    api_client: crate::task_server::api_client::ApiClient,
    // ...
}

impl McpServer {
    pub fn api(&self) -> &crate::task_server::api_client::ApiClient { &self.api_client }
    // in constructors:
    // api_client: ApiClient::new(client.clone(), base_url.to_string()),
}
```

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add crates/mcp/src/task_server/api_client.rs crates/mcp/src/task_server/mod.rs crates/mcp/Cargo.toml
git commit -m "feat(mcp): add ApiClient wrapper for workspace/task lookups"
```

---

### Task 3.11: `check_scope_allows_workspace` — async + memoize + 放宽规则

**Files:**
- Modify: `crates/mcp/src/task_server/tools/mod.rs`

- [ ] **Step 1: 测试 — 三个核心场景**

```rust
#[cfg(test)]
mod check_scope_tests {
    use super::*;
    use httpmock::MockServer;
    use std::collections::HashMap;

    #[tokio::test]
    async fn same_workspace_passes_without_http() {
        let mock = MockServer::start();
        let server = McpServer::new_orchestrator(&mock.base_url())
            .with_scope_for_test(uuid::Uuid::new_v4());
        let target = server.scoped_workspace_id().unwrap();
        let mut cache = HashMap::new();
        assert!(check_scope_allows_workspace(&server, &mut cache, target).await);
        // No HTTP expectation set — mock recorded zero calls.
        assert_eq!(mock.hits(), 0);
    }

    #[tokio::test]
    async fn child_of_scoped_is_allowed() {
        let mock = MockServer::start();
        let parent = uuid::Uuid::new_v4();
        let task_id = uuid::Uuid::new_v4();
        let child = uuid::Uuid::new_v4();

        mock.mock(|when, then| {
            when.path(format!("/api/workspaces/{child}"));
            then.json_body(ws_envelope(child, Some(task_id)));
        });
        mock.mock(|when, then| {
            when.path(format!("/api/tasks/{task_id}"));
            then.json_body(task_envelope(task_id, Some(parent)));
        });

        let server = McpServer::new_orchestrator(&mock.base_url()).with_scope_for_test(parent);
        let mut cache = HashMap::new();
        assert!(check_scope_allows_workspace(&server, &mut cache, child).await);
    }

    #[tokio::test]
    async fn unrelated_workspace_is_rejected() { /* parent != scope */ }

    #[tokio::test]
    async fn cache_short_circuits_second_call() {
        // set up mock that only answers once; second check with same target must not re-call.
    }
}
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: 实现**

把现有 `scope_allows_workspace` 改造为:

```rust
use std::collections::HashMap;

pub async fn check_scope_allows_workspace(
    server: &McpServer,
    scope_cache: &mut HashMap<Uuid, bool>,
    target: Uuid,
) -> bool {
    if !matches!(server.mode(), McpMode::Orchestrator) { return true; }
    let scoped = match server.scoped_workspace_id() { Some(x) => x, None => return true };
    if target == scoped { return true; }
    if let Some(cached) = scope_cache.get(&target) { return *cached; }

    let allowed = async {
        let ws = server.api().get_workspace(target).await.ok()?;
        let tid = ws.task_id?;
        let t = server.api().get_task(tid).await.ok()?;
        Some(t.parent_workspace_id == Some(scoped))
    }.await.unwrap_or(false);

    scope_cache.insert(target, allowed);
    allowed
}
```

同文件保留一个 `fn scope_allows_workspace_sync` shim 供测试阶段旧代码调用,在后面 Task 3.12 统一迁移。

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add crates/mcp/src/task_server/tools/mod.rs
git commit -m "feat(mcp): add async check_scope_allows_workspace with memoize (D12)"
```

---

### Task 3.12: 迁移所有 8 + 1 个 `scope_allows_workspace` 调用点

**Files:**
- Modify: `crates/mcp/src/task_server/tools/workspaces.rs`
- Modify: `crates/mcp/src/task_server/tools/sessions.rs`
- Modify(possibly): `crates/mcp/src/task_server/tools/task_attempts.rs` 等

- [ ] **Step 1: 找全部调用点**

Run: `rg 'scope_allows_workspace' crates/mcp/`
Expected: 8 生产 + 1 test。列出。

- [ ] **Step 2: 针对每个 tool 函数改造:**
  - 入口构造 `let mut scope_cache = std::collections::HashMap::new();`
  - 把 `self.scope_allows_workspace(id)` 换成 `check_scope_allows_workspace(self, &mut scope_cache, id).await`(返回 `bool`)并在 `false` 时用 `self.tool_error(...)` 返回错误
  - 多个 target 共用同一 `scope_cache`

- [ ] **Step 3: 跑 MCP 所有测试**

Run: `cargo test -p mcp`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add crates/mcp/src/task_server/tools/
git commit -m "refactor(mcp): rewire scope checks to async check_scope_allows_workspace"
```

---

### Task 3.13: 5 个新 MCP tool + 2 个扩展

**Files:**
- Create: `crates/mcp/src/task_server/tools/tasks.rs`
- Modify: `crates/mcp/src/task_server/tools/workspaces.rs`
- Modify: `crates/mcp/src/task_server/tools/task_attempts.rs`
- Modify: `crates/mcp/src/task_server/mod.rs` — 注册

- [ ] **Step 1: 单元测试**

`tasks.rs` 里加:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_tasks_without_scope_and_without_explicit_errors() { /* D8 */ }

    #[test]
    fn create_and_start_task_round_trip() { /* hit mock server */ }
}
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: 实现 tools(仿 `sessions.rs::create_session` 模式)**

在 `tasks.rs` 实现 6 个 tool:`create_task`、`create_and_start_task`、`list_tasks`、`get_task`、`update_task_status`、`delete_task`。每个:
- 定义 request/response 结构(`schemars::JsonSchema`)
- `#[tool(description = "...")]` 注解
- 按 D8 规则:`list_tasks` 在 `parent_workspace_id` 缺省 + Orchestrator 模式下用 `server.scoped_workspace_id()` 作为默认;Global 模式下返回 `missing_parent_workspace_id` 错误
- 调用走 `self.send_json(self.client.post(...))` / `self.client.get(...)`

扩展:
- `workspaces.rs::list_workspaces` 加 `task_id: Option<Uuid>` request 字段,在 URL 上拼 `?task_id=...`。`WorkspaceSummary` 加 `task_id: Option<Uuid>` 并在构造处填入。
- `task_attempts.rs::start_workspace` 加 `task_id: Option<Uuid>` 并透传到 `/api/workspaces/start` 或直接走 `/api/tasks/start`(若 manager 传 `task_id` 且新 task 就一步过去;否则沿用旧路径)。

在 `mod.rs` Orchestrator router 里注册新 tool 列表。

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add crates/mcp/src/task_server/tools/tasks.rs crates/mcp/src/task_server/tools/workspaces.rs crates/mcp/src/task_server/tools/task_attempts.rs crates/mcp/src/task_server/mod.rs
git commit -m "feat(mcp): add 5 task tools + task_id extension to list_workspaces/start_workspace"
```

---

### Task 3.14: Regen types + 全套校验

- [ ] **Step 1:** `pnpm run generate-types`
- [ ] **Step 2:** `pnpm run check`
- [ ] **Step 3:** `cargo clippy --workspace --all-targets -- -D warnings`
- [ ] **Step 4:** `cargo test --workspace`
- [ ] **Step 5:** `pnpm run format`
- [ ] **Step 6: Commit**

```bash
git add shared/types.ts
git commit -m "chore: regen shared types for PR-X3"
```

---

### 🛑 PR-X3 Push Gate Checkpoint

- [ ] Diff 汇总
- [ ] 手工 smoke:Orchestrator 模式 MCP 客户端 → `create_and_start_task()` → `list_tasks()` → `get_execution(child)`(验证 D12 通过) → `read_session_messages(child)`(PR-X2) → `update_task_status(done)` → `delete_task()`(验证 D13 workspace 保留但 `task_id=null`)
- [ ] 停,等授权

---

# PR-X4 — UI breadcrumb + group-by-manager

**PR 范围:** `WorkspaceSummary.task_id` 已在 PR-X3 暴露;UI 只 fetch + render。两个组件 + 一个 hook + 一个 list 改造。

**文件拓扑:**
- **新建** `packages/web-core/src/api/tasks.ts`
- **新建** `packages/web-core/src/hooks/useTaskBreadcrumb.ts`
- **新建** `packages/web-core/src/components/WorkspaceBreadcrumb.tsx`
- **修改** `packages/web-core/src/components/WorkspaceList.tsx`
- **修改** `packages/local-web/src/...`(details 页)

---

### Task 4.1: Task API 客户端

**Files:**
- Create: `packages/web-core/src/api/tasks.ts`

- [ ] **Step 1: 写 vitest**

`packages/web-core/src/api/tasks.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getTask } from './tasks';

describe('getTask', () => {
  it('unwraps ApiResponse envelope', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'abc', title: 't', project_id: 'p', status: 'todo' } }),
    }) as any;
    const task = await getTask('abc');
    expect(task.id).toBe('abc');
    expect(task.title).toBe('t');
  });

  it('throws on error envelope', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, message: 'not found' }),
    }) as any;
    await expect(getTask('abc')).rejects.toThrow(/not found/);
  });
});
```

- [ ] **Step 2: FAIL:** `pnpm --filter web-core vitest run src/api/tasks.test.ts`

- [ ] **Step 3: 实现**

```ts
// packages/web-core/src/api/tasks.ts
import type { Task } from 'shared/types';

type Envelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

export async function getTask(id: string): Promise<Task> {
  const resp = await fetch(`/api/tasks/${id}`);
  const body = (await resp.json()) as Envelope<Task>;
  if (!body.success || !body.data) {
    throw new Error(body.message ?? 'failed to fetch task');
  }
  return body.data;
}
```

- [ ] **Step 4: PASS + Commit**

```bash
git add packages/web-core/src/api/tasks.ts packages/web-core/src/api/tasks.test.ts
git commit -m "feat(web-core): add getTask API client"
```

---

### Task 4.2: `useTaskBreadcrumb` hook

**Files:**
- Create: `packages/web-core/src/hooks/useTaskBreadcrumb.ts`

- [ ] **Step 1: 测试**

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { useTaskBreadcrumb } from './useTaskBreadcrumb';
import * as tasksApi from '../api/tasks';
import * as workspacesApi from '../api/workspaces';

describe('useTaskBreadcrumb', () => {
  it('fetches task and parent workspace when workspace has task_id', async () => {
    vi.spyOn(tasksApi, 'getTask').mockResolvedValue({ id: 't1', title: 'T', parent_workspace_id: 'w0', status: 'todo', project_id: 'p' } as any);
    vi.spyOn(workspacesApi, 'getWorkspace').mockResolvedValue({ id: 'w0', name: 'Manager' } as any);

    const { result } = renderHook(() => useTaskBreadcrumb({ id: 'w1', task_id: 't1' } as any));
    await waitFor(() => expect(result.current.task).toBeTruthy());
    expect(result.current.task?.id).toBe('t1');
    expect(result.current.parentWorkspace?.name).toBe('Manager');
  });

  it('returns null task when workspace has no task_id', async () => {
    const { result } = renderHook(() => useTaskBreadcrumb({ id: 'w1', task_id: null } as any));
    expect(result.current.task).toBeNull();
  });
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: 实现**

```ts
// packages/web-core/src/hooks/useTaskBreadcrumb.ts
import { useEffect, useState } from 'react';
import { getTask } from '../api/tasks';
import { getWorkspace } from '../api/workspaces';
import type { Task, Workspace } from 'shared/types';

type WorkspaceSummary = { id: string; task_id: string | null };

export function useTaskBreadcrumb(workspace: WorkspaceSummary) {
  const [task, setTask] = useState<Task | null>(null);
  const [parentWorkspace, setParentWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!workspace.task_id) { setTask(null); setParentWorkspace(null); return; }
      const t = await getTask(workspace.task_id);
      if (cancelled) return;
      setTask(t);
      if (t.parent_workspace_id) {
        const p = await getWorkspace(t.parent_workspace_id);
        if (cancelled) return;
        setParentWorkspace(p);
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [workspace.task_id]);

  return { task, parentWorkspace };
}
```

- [ ] **Step 4: PASS + Commit**

```bash
git add packages/web-core/src/hooks/useTaskBreadcrumb.ts packages/web-core/src/hooks/useTaskBreadcrumb.test.ts
git commit -m "feat(web-core): useTaskBreadcrumb hook"
```

---

### Task 4.3: `WorkspaceBreadcrumb` 组件

**Files:**
- Create: `packages/web-core/src/components/WorkspaceBreadcrumb.tsx`

- [ ] **Step 1: 测试(三个 snapshot case)**

```tsx
import { render } from '@testing-library/react';
import { WorkspaceBreadcrumb } from './WorkspaceBreadcrumb';

describe('WorkspaceBreadcrumb', () => {
  it('renders nothing when no task and no parent', () => {
    const { container } = render(<WorkspaceBreadcrumb task={null} parentWorkspace={null} attemptIndex={1} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders task only when no parent', () => {
    const tree = render(<WorkspaceBreadcrumb task={{ id: 't', title: 'Ship', parent_workspace_id: null } as any} parentWorkspace={null} attemptIndex={1} />);
    expect(tree.getByText(/Task: Ship/)).toBeTruthy();
  });

  it('renders full chain when both present', () => {
    const tree = render(<WorkspaceBreadcrumb
      task={{ id: 't', title: 'Ship', parent_workspace_id: 'w0' } as any}
      parentWorkspace={{ id: 'w0', name: 'Manager' } as any}
      attemptIndex={3}
    />);
    expect(tree.getByText(/Manager/)).toBeTruthy();
    expect(tree.getByText(/Ship/)).toBeTruthy();
    expect(tree.getByText(/Attempt #3/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: 实现**

```tsx
// packages/web-core/src/components/WorkspaceBreadcrumb.tsx
import type { Task, Workspace } from 'shared/types';
import { Link } from 'react-router-dom';

type Props = {
  task: Task | null;
  parentWorkspace: Workspace | null;
  attemptIndex: number;
};

export function WorkspaceBreadcrumb({ task, parentWorkspace, attemptIndex }: Props) {
  if (!task && !parentWorkspace) return null;
  const segments: React.ReactNode[] = [];
  if (parentWorkspace) {
    segments.push(
      <Link key="p" to={`/workspaces/${parentWorkspace.id}`} className="underline">
        Manager: {parentWorkspace.name ?? parentWorkspace.id.slice(0, 8)}
      </Link>
    );
  }
  if (task) {
    segments.push(<span key="t">Task: {task.title}</span>);
  }
  segments.push(<span key="a">Attempt #{attemptIndex}</span>);
  return (
    <nav className="text-sm text-muted-foreground flex gap-2">
      {segments.map((s, i) => (
        <span key={i} className="flex gap-2 items-center">
          {s}
          {i < segments.length - 1 && <span>/</span>}
        </span>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: PASS + Commit**

```bash
git add packages/web-core/src/components/WorkspaceBreadcrumb.tsx packages/web-core/src/components/WorkspaceBreadcrumb.test.tsx
git commit -m "feat(web-core): WorkspaceBreadcrumb component"
```

---

### Task 4.4: 接入 workspace 详情页

**Files:**
- Modify: `packages/local-web/src/...`(找到 workspace detail page component)

- [ ] **Step 1: 定位现有 detail 页**

Run: `rg -l 'function WorkspaceDetail|const WorkspaceDetail' packages/local-web/src/`

- [ ] **Step 2: 在 detail 页顶部插入 breadcrumb**

```tsx
import { WorkspaceBreadcrumb } from '@vk/web-core/components/WorkspaceBreadcrumb';
import { useTaskBreadcrumb } from '@vk/web-core/hooks/useTaskBreadcrumb';

// inside WorkspaceDetail:
const { task, parentWorkspace } = useTaskBreadcrumb(workspace);
return (
  <>
    <WorkspaceBreadcrumb task={task} parentWorkspace={parentWorkspace} attemptIndex={attemptIndex} />
    {/* existing detail content */}
  </>
);
```

- [ ] **Step 3: Commit**

```bash
git add packages/local-web/src/
git commit -m "feat(local-web): surface WorkspaceBreadcrumb in detail page"
```

---

### Task 4.5: `WorkspaceList` — group by manager toggle

**Files:**
- Modify: `packages/web-core/src/components/WorkspaceList.tsx`

- [ ] **Step 1: 测试**

```tsx
describe('WorkspaceList groupByManager', () => {
  it('renders flat when toggle off', () => {
    const tree = render(<WorkspaceList workspaces={[ws1, ws2]} groupByManager={false} />);
    expect(tree.queryByText(/Standalone/)).toBeNull();
  });

  it('groups by parent workspace when toggle on', async () => {
    // ws1.task_id = 'ta' with parent = 'mgr1'
    // ws2.task_id = null
    const tree = render(<WorkspaceList workspaces={[ws1, ws2]} groupByManager={true} />);
    expect(await tree.findByText(/Standalone/)).toBeTruthy();
    expect(await tree.findByText(/Manager: /)).toBeTruthy();
  });
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: 实现**

接受新 prop `groupByManager: boolean`。当 `true`:
1. 对每个 workspace 按 `task_id → parent_workspace_id` 归类(需要从 Task + parent Workspace API fetch 一次,建议用 `useMemo` + batch 加载)
2. 无 parent 的归 "Standalone"
3. 渲染 collapsible sections

默认 `false`(保留扁平行为)。在 toolbar 里加开关。

- [ ] **Step 4: PASS + Commit**

```bash
git add packages/web-core/src/components/WorkspaceList.tsx packages/web-core/src/components/WorkspaceList.test.tsx
git commit -m "feat(web-core): WorkspaceList group-by-manager toggle"
```

---

### Task 4.6: 全套校验

- [ ] `pnpm run check`
- [ ] `pnpm run lint`
- [ ] `pnpm run format`
- [ ] `pnpm --filter web-core vitest run`
- [ ] `cargo test --workspace`(确保 Rust 侧没被 UI 类型漂移影响)

---

### 🛑 PR-X4 Push Gate Checkpoint

- [ ] 手工 smoke:`pnpm run dev` → 创建 manager workspace → 派生 child → 打开 child 页,看到 breadcrumb;在列表页切 toggle
- [ ] Diff 汇总 + 停,等授权 push

---

## 追加:全局收尾

每个 PR push 完成、merge 回 main 后:
- [ ] rebase 到 main 最新
- [ ] 如下游 PR 冲突,本地 fix 后 push-force-with-lease(先告知用户)
- [ ] 整个 Tier A++ 合入 main 后,开一个 follow-up issue 跟踪:
  - `include_meta_entries` 参数(D5a 翻转)
  - 递归 scope(D12 多层 manager)
  - 旧 `/api/workspaces/start` 事务化(D6 翻转)
  - Task 编辑 UI(D10 翻转)
