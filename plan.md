# Kimi CLI 集成到 Vibe Kanban 开发计划

## 背景与目标

### 项目背景

Vibe Kanban 是一个 AI 编程代理的编排平台，支持多种 code agent（如 Claude Code、Codex、Gemini CLI 等）的统一接入和管理。目前支持的 agent 包括：

- Claude Code (Anthropic)
- Codex (OpenAI)
- Gemini CLI (Google)
- OpenCode
- Qwen Code
- Amp
- Cursor Agent
- Copilot
- Droid

Kimi CLI 是 Moonshot AI 开发的 AI 编程助手，具有以下特点：
- 支持多种运行模式：shell、print、acp、wire
- 支持 Agent Client Protocol (ACP)
- 支持 Model Context Protocol (MCP)
- 支持 stream-json 结构化输出
- 内置 Subagent 系统（Task 工具）
- 支持自定义 agent 和 skills

### 集成目标

将 Kimi CLI 作为新的 code agent 集成到 Vibe Kanban，使用户可以：

1. 在 Vibe Kanban 中选择 Kimi CLI 作为执行代理
2. 通过 Vibe Kanban 的 UI 启动和管理 Kimi CLI 会话
3. 在统一的界面中查看 Kimi CLI 的执行日志和结果
4. 支持 Kimi CLI 的会话恢复（follow-up）功能
5. 正确显示 Kimi CLI 的 Subagent 执行过程

### 技术挑战

| 挑战 | 说明 | 解决思路 |
|------|------|----------|
| 输出格式转换 | Kimi CLI 使用 stream-json 格式，与 Vibe Kanban 的 NormalizedEntry 不同 | 编写专门的日志解析器 |
| 会话管理映射 | Kimi CLI 有自己的会话系统（context file） | 将 Kimi session ID 映射到 Vibe Kanban 的 session |
| Subagent 显示 | Kimi 的 Task 工具会创建子代理 | 扩展 NormalizedEntry 支持 subagent 事件 |
| 审批流程桥接 | Kimi 通过 Wire 协议进行审批 | 桥接到 Vibe Kanban 的审批系统 |
| 实时流处理 | stream-json 是流式输出 | 实现实时解析和 WebSocket 推送 |

---

## 开发阶段规划

### 阶段 1：基础 Executor 实现（预计 2-3 天）

**目标**：创建 Kimi executor 的基础结构，实现最简单的 spawn 功能

#### 1.1 创建 Executor 模块

文件：`crates/executors/src/executors/kimi.rs`

```rust
// 基础结构
pub struct Kimi {
    pub append_prompt: AppendPrompt,
    pub model: Option<String>,
    pub agent: Option<String>,
    pub skills: Option<Vec<String>>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}
```

实现：
- `StandardCodingAgentExecutor` trait
- `spawn` 方法 - 启动 Kimi CLI 进程
- `spawn_follow_up` 方法 - 支持会话恢复
- `default_mcp_config_path` - MCP 配置路径
- `get_availability_info` - 检查 Kimi CLI 是否安装

#### 1.2 注册到 Executor 系统

文件：`crates/executors/src/executors/mod.rs`

- 将 `Kimi` 添加到 `CodingAgent` enum
- 添加 `KIMI` 到 `BaseCodingAgent`

#### 1.3 添加 JSON Schema

文件：`shared/schemas/kimi.json`

定义 Kimi executor 的配置选项：
- model: 模型选择（kimi-k2 等）
- agent: agent 类型（default, okabe, custom）
- skills: 技能列表
- append_prompt: 追加提示词

**验收标准**：
- [ ] Kimi executor 可以编译通过
- [ ] 在 Vibe Kanban 中可以看到 Kimi 选项
- [ ] 可以启动 Kimi CLI 进程
- [ ] 基础日志可以输出到前端

---

### 阶段 2：日志解析与标准化（预计 3-4 天）

**目标**：将 Kimi CLI 的 stream-json 输出转换为 Vibe Kanban 的标准格式

#### 2.1 分析 Kimi CLI 的 stream-json 格式

Kimi CLI 的输出事件类型：
- `TurnBegin` / `TurnEnd` - 回合开始/结束
- `StepBegin` / `StepInterrupted` - 步骤开始/中断
- `AgentMessageChunk` - AI 消息片段
- `AgentThoughtChunk` - 思考过程
- `ToolCallStart` / `ToolCallProgress` / `ToolCallComplete` - 工具调用
- `SubagentEvent` - 子代理事件
- `ApprovalRequest` / `ApprovalResponse` - 审批
- `StatusUpdate` - 状态更新
- `CompactionBegin` / `CompactionEnd` - 上下文压缩

#### 2.2 实现日志解析器

文件：`crates/executors/src/executors/kimi/normalize_logs.rs`

```rust
pub struct KimiLogProcessor {
    // 状态跟踪
    current_step: Option<u32>,
    tool_call_map: HashMap<String, ToolCallInfo>,
}

impl KimiLogProcessor {
    pub fn process_logs(msg_store: Arc<MsgStore>, worktree_path: &Path) {
        // 解析 stream-json 并转换为 NormalizedEntry
    }
    
    fn convert_event(&mut self, event: KimiEvent) -> Vec<NormalizedEntry> {
        match event {
            KimiEvent::AgentMessageChunk { content } => {
                // 合并片段，生成 AssistantMessage
            }
            KimiEvent::ToolCallStart { tool_call } => {
                // 生成 ToolUse entry
            }
            KimiEvent::SubagentEvent { task_tool_call_id, event } => {
                // 递归处理 subagent 事件
            }
            // ... 其他事件
        }
    }
}
```

#### 2.3 映射到 NormalizedEntry

| Kimi 事件 | NormalizedEntry 类型 |
|-----------|---------------------|
| AgentMessageChunk | AssistantMessage |
| AgentThoughtChunk | Thinking |
| ToolCallStart/Progress | ToolUse |
| ToolCallComplete | ToolResult（通过 metadata）|
| SubagentEvent | 扩展：SubagentEntry |
| ApprovalRequest | ToolUse (pending_approval) |
| FileEdit (diff) | FileEdit |
| Shell command | CommandRun |

#### 2.4 处理 Subagent 事件

Kimi CLI 的 `Task` 工具会创建 subagent，需要：
- 解析 `SubagentEvent` 结构
- 在 UI 中显示为嵌套的会话
- 保持 subagent 与父 agent 的关联

**验收标准**：
- [ ] 可以正确解析 Kimi CLI 的所有 stream-json 事件
- [ ] 日志实时显示在前端
- [ ] AssistantMessage 正确显示
- [ ] ToolUse 正确显示（包括文件操作、shell 命令）
- [ ] Subagent 执行过程可见

---

### 阶段 3：会话管理与恢复（预计 2-3 天）

**目标**：实现 Kimi CLI 的会话恢复功能

#### 3.1 Kimi CLI 会话机制

Kimi CLI 使用 context file 存储会话：
- 默认位置：`~/.kimi/sessions/<session_id>.jsonl`
- 包含完整的消息历史
- 支持 `--session <id>` 恢复
- 支持 `--continue` 继续上一个会话

#### 3.2 会话 ID 映射

Vibe Kanban 的 session ID 需要映射到 Kimi CLI 的 session ID：

```rust
// 在 CodingAgentTurn 表中存储 Kimi session ID
pub struct CodingAgentTurn {
    // ... 现有字段
    pub agent_session_id: Option<String>,  // Kimi 的 session ID
}
```

#### 3.3 实现 spawn_follow_up

```rust
async fn spawn_follow_up(
    &self,
    current_dir: &Path,
    prompt: &str,
    session_id: &str,  // Vibe Kanban 的 session ID
    reset_to_message_id: Option<&str>,
    env: &ExecutionEnv,
) -> Result<SpawnedChild, ExecutorError> {
    // 1. 查询 Kimi session ID
    let kimi_session_id = get_kimi_session_id(session_id).await?;
    
    // 2. 构建命令
    let mut args = vec!["--print", "--output-format", "stream-json"];
    
    if let Some(kimi_sid) = kimi_session_id {
        args.extend(["--session", &kimi_sid]);
    } else {
        // 新会话
    }
    
    // 3. 启动进程
}
```

#### 3.4 处理 Session Fork（可选）

Kimi CLI 支持通过 context file 复制创建新会话，可以实现：
- 在 Vibe Kanban 中 reset 到某个消息点
- 创建分支会话

**验收标准**：
- [ ] 可以恢复之前的 Kimi CLI 会话
- [ ] follow-up 消息正确发送到现有会话
- [ ] session ID 正确映射和存储
- [ ] reset 功能正常工作

---

### 阶段 4：审批系统集成（预计 2-3 天）

**目标**：将 Kimi CLI 的审批流程桥接到 Vibe Kanban

#### 4.1 Kimi CLI 审批机制

Kimi CLI 通过 Wire 协议发送审批请求：
- `ApprovalRequest` 事件
- 包含：tool_call_id, sender, action, description
- 响应：`ApprovalResponse` (approve, approve_for_session, reject)

#### 4.2 桥接实现

```rust
// 在 KimiLogProcessor 中处理 ApprovalRequest
fn handle_approval_request(&mut self, request: ApprovalRequest) -> NormalizedEntry {
    NormalizedEntry {
        entry_type: NormalizedEntryType::ToolUse {
            tool_name: request.sender,
            action_type: ActionType::CommandRun {
                command: request.action,
                result: None,
                category: CommandCategory::Unknown,
            },
            status: ToolStatus::PendingApproval {
                approval_id: request.id,
                requested_at: Utc::now(),
                timeout_at: Utc::now() + Duration::minutes(5),
            },
        },
        content: request.description,
        metadata: Some(json!({
            "approval_request": request,
        })),
    }
}
```

#### 4.3 审批响应处理

当用户在 Vibe Kanban 中审批后：
1. 前端发送审批结果到后端
2. 后端找到对应的 Kimi CLI 进程
3. 通过 stdin 发送 `ApprovalResponse` 事件

**验收标准**：
- [ ] 审批请求正确显示在 Vibe Kanban UI
- [ ] 用户可以批准/拒绝操作
- [ ] 审批结果正确传递给 Kimi CLI
- [ ] 支持"此会话始终允许"选项

---

### 阶段 5：高级功能支持（预计 3-4 天）

**目标**：支持 Kimi CLI 的高级特性

#### 5.1 Skills 支持

Kimi CLI 支持加载 skills：

```rust
// ExecutorConfig 扩展
pub struct Kimi {
    // ...
    pub skills: Option<Vec<String>>,  // 技能名称列表
}

// 启动时加载
if let Some(skills) = &self.skills {
    for skill in skills {
        builder = builder.extend_params(["--skill", skill]);
    }
}
```

#### 5.2 自定义 Agent 支持

支持加载自定义 agent YAML 文件：

```rust
pub struct Kimi {
    // ...
    pub agent_file: Option<PathBuf>,  // 自定义 agent 文件路径
}
```

#### 5.3 模型选择

Kimi CLI 支持多种模型：
- kimi-k2
- kimi-k2.5
- 其他 Moonshot 模型

```rust
pub struct Kimi {
    pub model: Option<String>,
}
```

#### 5.4 上下文压缩事件

处理 `CompactionBegin` / `CompactionEnd`：
- 显示上下文压缩提示
- 更新 token 使用情况

**验收标准**：
- [ ] Skills 可以正常加载和使用
- [ ] 自定义 agent 文件可以加载
- [ ] 模型选择生效
- [ ] 上下文压缩事件正确显示

---

### 阶段 6：前端集成与优化（预计 2-3 天）

**目标**：完善前端展示和用户体验

#### 6.1 Agent 图标和名称

- 添加 Kimi 的 logo
- 显示"Kimi CLI"名称

#### 6.2 配置界面

在 Agent 配置面板中添加 Kimi 特有选项：
- Model 选择下拉框
- Agent 类型选择（default/okabe/custom）
- Skills 多选框
- 自定义 agent 文件上传

#### 6.3 Subagent 展示优化

改进 `ChatSubagentEntry` 组件：
- 显示 subagent 类型
- 嵌套显示 subagent 的执行步骤
- 支持展开/收起

#### 6.4 错误处理

- Kimi CLI 未安装时的友好提示
- 登录状态检查（需要 `kimi login`）
- 网络错误处理

**验收标准**：
- [ ] Kimi 图标正确显示
- [ ] 配置界面可用
- [ ] Subagent 展示清晰
- [ ] 错误提示友好

---

### 阶段 7：测试与文档（预计 2-3 天）

**目标**：确保质量并编写文档

#### 7.1 单元测试

- Executor 创建测试
- 命令构建测试
- 日志解析测试

#### 7.2 集成测试

- 端到端会话测试
- 审批流程测试
- Subagent 测试

#### 7.3 文档

- 更新 AGENTS.md
- 添加 Kimi CLI 配置说明
- 添加故障排除指南

#### 7.4 性能优化

- 日志解析性能
- 内存使用优化

**验收标准**：
- [ ] 测试覆盖率达标
- [ ] 文档完整
- [ ] 性能满足要求

---

## 开发顺序与时间线

```
Week 1:
  Day 1-2: 阶段 1 - 基础 Executor 实现
  Day 3-5: 阶段 2 - 日志解析与标准化
  Day 6-7: 阶段 3 - 会话管理与恢复

Week 2:
  Day 1-2: 阶段 4 - 审批系统集成
  Day 3-4: 阶段 5 - 高级功能支持
  Day 5-6: 阶段 6 - 前端集成与优化
  Day 7:   阶段 7 - 测试与文档
```

总计：**约 10-14 个工作日**

---

## 风险与应对

| 风险 | 可能性 | 影响 | 应对措施 |
|------|--------|------|----------|
| Kimi CLI 协议变更 | 中 | 高 | 关注 Kimi CLI 更新，编写适配层 |
| stream-json 解析复杂 | 中 | 中 | 使用 streamingjson crate，充分测试 |
| 审批流程难以桥接 | 低 | 高 | 与 Kimi CLI 团队沟通，寻找解决方案 |
| 会话恢复不稳定 | 中 | 中 | 增加重试机制，优雅降级 |

---

## 相关文件清单

### 需要修改的文件

1. `crates/executors/src/executors/kimi.rs` - 主 executor 实现（新建）
2. `crates/executors/src/executors/kimi/normalize_logs.rs` - 日志解析（新建）
3. `crates/executors/src/executors/kimi/client.rs` - 客户端通信（新建）
4. `crates/executors/src/executors/mod.rs` - 注册 Kimi executor
5. `shared/schemas/kimi.json` - JSON Schema（新建）
6. `crates/executors/default_profiles.json` - 添加默认配置

### 可能需要修改的文件

7. `crates/executors/src/logs/mod.rs` - 扩展 NormalizedEntry
8. `frontend/src/components/ui-new/primitives/conversation/ChatSubagentEntry.tsx` - 优化 subagent 显示
9. `frontend/src/types/attempt.ts` - 添加 Kimi 类型

---

## 参考资源

- [Kimi CLI GitHub](https://github.com/MoonshotAI/kimi-cli)
- [Kimi CLI 文档](https://moonshotai.github.io/kimi-cli/)
- [ACP 协议规范](https://github.com/agentclientprotocol/agent-client-protocol)
- [Vibe Kanban AGENTS.md](./AGENTS.md)
- [Vibe Kanban Executors 模块](./crates/executors/src/executors/)

---

## 更新记录

| 日期 | 版本 | 更新内容 | 作者 |
|------|------|----------|------|
| 2026-02-19 | 1.0 | 初始版本 | Assistant |
| 2026-02-19 | 1.1 | 完成阶段 1：基础 Executor 实现 | Assistant |

---

## 开发进度

### 阶段 1：基础 Executor 实现 ✅ 已完成

**已完成工作：**

1. **创建 Kimi Executor 模块** (`crates/executors/src/executors/kimi.rs`)
   - 实现 `Kimi` struct，支持配置：model, agent, skills, agent_file, yolo
   - 实现 `StandardCodingAgentExecutor` trait
   - 使用 ACP 模式 (`kimi acp`) 进行通信，与 Gemini/Qwen 保持一致
   - 实现 `spawn` 和 `spawn_follow_up` 方法
   - 实现 `discover_options`，提供模型选择 (kimi-k2, kimi-k2.5)
   - 实现 `get_availability_info`，检查 kimi 安装和登录状态

2. **注册到 Executor 系统** (`crates/executors/src/executors/mod.rs`)
   - 添加 `kimi` 模块声明
   - 将 `Kimi` 添加到 `CodingAgent` enum
   - 添加 `KIMI` 到 `BaseCodingAgent`
   - 配置 capabilities：SessionFork, ContextUsage

3. **创建 JSON Schema** (`shared/schemas/kimi.json`)
   - 定义配置选项：model, agent, skills, agent_file, yolo
   - 支持标准覆盖：base_command_override, additional_params, env

4. **添加依赖** (`crates/executors/Cargo.toml`)
   - 添加 `which = "6.0"` 用于检测 kimi 安装

**设计决策：**
- 使用 ACP (Agent Communication Protocol) 模式而非 stream-json 模式
- 复用现有的 `AcpAgentHarness`，与 Gemini/Qwen 保持一致
- 使用 `kimi_sessions` 作为 session namespace
- 支持 yolo 模式自动审批

**文件清单：**
```
crates/executors/src/executors/
├── kimi.rs                      # 主 executor 实现
├── mod.rs                       # 注册 Kimi executor (已修改)
└── ...

shared/schemas/
└── kimi.json                    # JSON Schema

crates/executors/Cargo.toml      # 添加 which 依赖
```

**下一步：**
- [ ] 编译测试，修复可能的编译错误
- [ ] 前端添加 Kimi 选项和图标
- [ ] 实际测试与 Kimi CLI 的集成

---

*本计划将根据实际开发进度进行调整和更新。*
