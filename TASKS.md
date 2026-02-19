# Vibe Kanban + Kimi CLI 集成 - 实施任务清单

## 项目状态

- **分支**: `feat/kimi-cli-integration`
- **当前阶段**: 基础 Executor 实现已完成
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

---

## 进行中 🚧

### 阶段 2: 编译测试与修复

**目标**: 确保代码能够编译通过

- [ ] 等待 Rust 工具链安装完成
- [ ] 运行 `cargo check -p executors`
- [ ] 修复编译错误
- [ ] 运行 `cargo clippy -p executors` 检查代码风格
- [ ] 运行 `cargo test -p executors` 运行单元测试

**预计时间**: 30-60 分钟

---

## 待实施 📋

### 阶段 3: 前端集成

**目标**: 在 Vibe Kanban UI 中添加 Kimi 选项

#### 3.1 类型定义

文件: `shared/types.ts` (如果是生成的则修改源文件)

- [ ] 确保 `BaseCodingAgent` 包含 `KIMI`
- [ ] 确保 `CodingAgent` 包含 `Kimi` 变体

#### 3.2 添加 Kimi 图标

文件: `frontend/src/components/ui-new/primitives/AgentIcon.tsx` (或类似文件)

- [ ] 创建 Kimi 图标组件
- [ ] 在 Agent 选择器中显示图标

参考实现:
```typescript
// 查找其他 agent 图标实现方式
// 例如: ClaudeIcon, GeminiIcon, etc.
```

#### 3.3 Agent 配置界面

文件: `frontend/src/components/ui-new/dialogs/settings/AgentSettings.tsx` (或类似)

- [ ] 添加 Kimi 特有的配置选项
  - [ ] Model 选择下拉框 (kimi-k2, kimi-k2.5)
  - [ ] Agent 类型选择 (default, okabe)
  - [ ] Skills 输入框
  - [ ] YOLO 模式开关

#### 3.4 默认配置

文件: `crates/executors/default_profiles.json`

- [ ] 添加 Kimi 的默认配置

```json
{
  "KIMI": {
    "default": {
      "model": "kimi-k2",
      "agent": "default"
    }
  }
}
```

**预计时间**: 2-3 小时

---

### 阶段 4: 集成测试

**目标**: 验证与真实 Kimi CLI 的集成

#### 4.1 环境准备

- [ ] 安装 Kimi CLI: `pip install kimi-cli`
- [ ] 登录 Kimi: `kimi login`
- [ ] 验证安装: `kimi --version`

#### 4.2 功能测试

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

- [ ] 测试工具调用
  - [ ] 文件读取
  - [ ] 文件写入
  - [ ] Shell 命令执行
  - [ ] 代码搜索

- [ ] 测试配置选项
  - [ ] 切换模型
  - [ ] 加载 skills
  - [ ] 使用自定义 agent 文件
  - [ ] YOLO 模式

#### 4.3 错误处理测试

- [ ] 测试 Kimi CLI 未安装时的错误提示
- [ ] 测试未登录时的错误提示
- [ ] 测试网络错误处理
- [ ] 测试超时处理

**预计时间**: 2-3 小时

---

### 阶段 5: 文档与完善

#### 5.1 代码文档

- [ ] 为 `Kimi` struct 添加文档注释
- [ ] 为关键方法添加文档注释
- [ ] 更新 `crates/executors/AGENTS.md` (如果存在)

#### 5.2 用户文档

- [ ] 在 `docs/` 中添加 Kimi CLI 配置指南
- [ ] 添加故障排除章节

#### 5.3 更新计划文档

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

## 当前阻塞项

1. **Rust 工具链安装** - 等待下载完成
   - 解决方案: 等待或手动安装

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

---

*最后更新: 2026-02-19*
