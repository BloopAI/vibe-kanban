# Vibe Kanban + Kimi CLI 集成 - 实施任务清单

## 项目状态

- **分支**: `feat/kimi-cli-integration`
- **当前阶段**: 基础 Executor 实现已完成，编译通过
- **最后更新**: 2026-02-19

## 已完成 ✅

### 阶段 1: 基础 Executor 实现

- [x] 创建 `crates/executors/src/executors/kimi.rs`
  - [x] 实现 `Kimi` struct
  - [x] 支持配置: model, agent, skills, agent_file, yolo
  - [x] 实现 `StandardCodingAgentExecutor` trait
  - [x] 使用 ACP 模式 (`kimi acp`)
  
- [x] 注册到 Executor 系统
  - [x] 修改 `crates/executors/src/executors/mod.rs`
  - [x] 添加 `Kimi` 到 `CodingAgent` enum
  - [x] 配置 capabilities

- [x] 创建 JSON Schema (`shared/schemas/kimi.json`)

- [x] 添加依赖 (`which = "6.0"`)

### 阶段 2: 编译测试与修复

- [x] 运行 `cargo check -p executors` - **通过**
- [x] 修复编译错误
  - [x] 修复 `mcp_config.rs` 中的模式匹配，添加 `Kimi` 分支
  - [x] 修复未使用的导入警告

---

## 进行中 🚧

### 阶段 3: 完整构建与测试

- [x] 运行 `cargo check -p executors` - 编译检查通过
- [x] 运行 `cargo clippy -p executors` - 代码风格检查通过
- [x] 运行 `cargo test -p executors` - 35个测试全部通过

**状态**: ✅ 完成

---

## 待实施 📋

### 阶段 4: 前端集成

**目标**: 在 Vibe Kanban UI 中添加 Kimi 选项

#### 4.1 类型定义

文件: `crates/server/src/bin/generate_types.rs`

- [x] 添加 `Kimi` 类型到类型生成器
- [x] 添加 `kimi` JSON schema 生成

#### 4.2 添加 Kimi 图标

文件: `frontend/src/components/agents/AgentIcon.tsx`

- [x] 创建 Kimi 图标组件 (`kimi-light.svg`, `kimi-dark.svg`)
- [x] 在 AgentIcon.tsx 中添加 Kimi 支持

#### 4.3 Agent 配置界面 (待类型生成后)

文件: `frontend/src/components/ui-new/dialogs/settings/AgentSettings.tsx` (或类似)

- [ ] 添加 Kimi 特有的配置选项
  - [ ] Model 选择下拉框 (kimi-k2, kimi-k2.5)
  - [ ] Agent 类型选择 (default, okabe)
  - [ ] Skills 输入框
  - [ ] YOLO 模式开关

#### 4.4 默认配置

文件: `crates/executors/default_profiles.json`

- [x] 添加 Kimi 的默认配置

```json
{
  "KIMI": {
    "DEFAULT": {
      "KIMI": {
        "model": "kimi-k2",
        "yolo": true
      }
    }
  }
}
```

**状态**: ✅ 基础前端集成完成

---

### 阶段 5: 集成测试

**目标**: 验证与真实 Kimi CLI 的集成

#### 5.1 环境准备 ✅

- [x] 安装 Kimi CLI: `pip install kimi-cli`
- [x] 登录 Kimi: `kimi login`
- [x] 验证安装: `kimi --version` (v1.12.0)

#### 5.2 API 测试 ✅

- [x] 测试可用性检测 API
  ```bash
  GET /api/agents/check-availability?executor=KIMI
  Response: {"type": "LOGIN_DETECTED", "last_auth_timestamp": ...}
  ```
  
- [x] 测试预设选项 API
  ```bash
  GET /api/agents/preset-options?executor=KIMI
  Response: {"executor": "KIMI", "model_id": "kimi-k2", "permission_policy": "AUTO"}
  ```

#### 5.3 功能测试 (待 UI 验证)

- [ ] 测试基本对话
  - [ ] 创建 Workspace
  - [ ] 选择 Kimi 作为 Agent
  - [ ] 发送简单提示词
  - [ ] 验证响应显示

- [ ] 测试会话恢复
  - [ ] 开始一个会话
  - [ ] 发送多条消息
  - [ ] 关闭会话
  - [ ] 恢复会话
  - [ ] 验证上下文保持

#### 5.4 错误处理测试 (待进行)

- [ ] 测试 Kimi CLI 未安装时的错误提示
- [ ] 测试未登录时的错误提示
- [ ] 测试网络错误处理
- [ ] 测试超时处理

**状态**: 🚧 API 测试通过，待完整 UI 测试

---

### 阶段 6: 文档与完善

#### 6.1 代码文档

- [ ] 为 `Kimi` struct 添加文档注释
- [ ] 为关键方法添加文档注释
- [ ] 更新 `crates/executors/AGENTS.md` (如果存在)

#### 6.2 用户文档

- [ ] 在 `docs/` 中添加 Kimi CLI 配置指南
- [ ] 添加故障排除章节

#### 6.3 更新计划文档

- [ ] 更新 `plan.md` 标记完成的任务
- [ ] 记录已知问题和限制

**预计时间**: 1 小时

---

## 扩展功能 (可选) 🚀

### 多 Kimi 实例协作

基于之前的架构设计，实现多个 Kimi 实例协作:

- [ ] 实现角色系统 (Architect, Backend, Frontend, etc.)
- [ ] 实现共享知识库
- [ ] 实现同步点机制
- [ ] 实现工作流引擎
- [ ] 前端多 Session 监控界面

**预计时间**: 1-2 周

---

## 当前状态

✅ **编译通过** - `cargo check -p executors` 成功

---

## 快速开始

### 编译检查

```bash
# 设置 PATH
export PATH="$HOME/.cargo/bin:$PATH"

# 编译检查
cd /Users/elics/workspace/tools/vibe-kanban
cargo check -p executors

# 完整构建
cargo build

# 运行测试
cargo test -p executors
```

### 前端开发

```bash
# 安装依赖
pnpm install

# 生成类型 (如果修改了 Rust 类型)
pnpm run generate-types

# 启动前端开发服务器
pnpm run frontend:dev
```

---

## 参考资源

- [Kimi CLI GitHub](https://github.com/MoonshotAI/kimi-cli)
- [Kimi CLI 文档](https://moonshotai.github.io/kimi-cli/)
- [ACP 协议](https://github.com/agentclientprotocol/agent-client-protocol)
- [Vibe Kanban AGENTS.md](./AGENTS.md)

---

## 更新记录

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-02-19 | 1.0 | 创建任务清单 |
| 2026-02-19 | 1.1 | 编译通过，修复 mcp_config.rs 模式匹配 |

---

*最后更新: 2026-02-19*
