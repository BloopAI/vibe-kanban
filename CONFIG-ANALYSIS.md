# Vibe Kanban 项目配置文件分析报告

> 生成时间: 2026-01-20
> 项目版本: 0.0.157
> 分析范围: 全项目配置文件

---

## 📊 配置文件分类总览

| 类别 | 数量 | 主要用途 |
|------|------|----------|
| **仓库配置** | 5 | Git、GitHub、CI/CD |
| **项目构建配置** | 15 | 编译、打包、依赖管理 |
| **MCP 配置** | 3 | MCP 服务器配置 |
| **Agent 配置** | 9 | 各种 AI Agent 参数 |
| **用户配置** | 4 | 代码风格、格式化、Lint |
| **环境配置** | 2 | 环境变量、远程部署 |
| **开发配置** | 8 | TypeScript、Vite、Tailwind |

---

## 📁 一、仓库配置（Repository Configuration）

### 1.1 Git 配置

#### `.gitignore`
- **作用**: 指定 Git 忽略的文件和目录
- **关键排除**:
  - 构建产物: `target/`, `dist/`, `node_modules/`
  - 环境变量: `.env*`, `.env.local`, `.env.remote`
  - IDE 文件: `.vscode/`, `.idea/`
  - 运行时数据: `pids`, `*.pid`
  - 开发端口文件: `.dev-ports.json`
  - 云端目录: `vibe-kanban-cloud/`

#### `.npmrc`
```ini
engine-strict=true
```
- **作用**: 强制使用 package.json 中指定的 Node.js 和 pnpm 版本
- **值**: 要求 Node >= 18, pnpm >= 8

### 1.2 GitHub Actions 配置

#### `.github/workflows/test.yml`
- **触发条件**: PR 到 main/louis/fe-revision 分支
- **CI 环境**: buildjet-8vcpu-ubuntu-2204
- **测试流程**:
  1. 前端 Lint 和类型检查
  2. i18n 回归检查
  3. Rust 代码格式检查和 Clippy
  4. 单元测试 (`cargo test`)
  5. 类型生成检查

#### `.github/workflows/publish.yml`
- **作用**: 发布 NPX 包到 npm

#### `.github/workflows/pre-release.yml`
- **作用**: 预发布构建

#### `.github/workflows/remote-deploy-{dev,prod}.yml`
- **作用**: 远程部署到开发/生产环境

---

## 📦 二、项目构建配置（Build Configuration）

### 2.1 根目录配置

#### `package.json`
```json
{
  "name": "vibe-kanban",
  "version": "0.0.157",
  "bin": {
    "vibe-kanban": "npx-cli/bin/cli.js"
  }
}
```
- **核心脚本**:
  - `dev`: 同时启动前端和后端
  - `dev:qa`: QA 优化模式
  - `generate-types`: 从 Rust 生成 TypeScript 类型
  - `build:npx`: 构建 NPX 包
  - `remote:dev`: 远程部署模式

#### `pnpm-workspace.yaml`
```yaml
packages:
  - frontend
  - remote-frontend
```
- **作用**: 定义 pnpm monorepo 工作区
- **成员**: frontend 和 remote-frontend 两个子项目

#### `Cargo.toml` (Workspace)
```toml
[workspace]
members = [
  "crates/server",
  "crates/db",
  "crates/executors",
  "crates/services",
  "crates/utils",
  "crates/local-deployment",
  "crates/deployment",
  "crates/remote",
  "crates/review",
]
```
- **作用**: Rust workspace 配置
- **共享依赖**: tokio, axum, serde, sqlx 等

### 2.2 前端配置

#### `frontend/package.json`
- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5.0.8
- **样式**: Tailwind CSS 3.4.0
- **主要依赖**:
  - 路由: `react-router-dom`
  - 状态: `zustand`, `@tanstack/react-query`
  - UI: `@radix-ui/*` 组件库
  - 编辑器: `@codemirror/*`, `lexical`
  - 国际化: `i18next`, `react-i18next`
  - 监控: `@sentry/react`

#### `frontend/vite.config.ts`
- **构建配置**: Vite 构建工具配置
- **插件**: `@vitejs/plugin-react`

#### `frontend/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "shared/*": ["../shared/*"]
    }
  }
}
```

#### `frontend/tailwind.{new,legacy}.config.js`
- **作用**: Tailwind CSS 配置
- **两个版本**: 新设计系统和旧版

#### `frontend/.prettierrc.json`
- **作用**: Prettier 代码格式化配置

#### `frontend/components.json`
- **作用**: Shadcn UI 组件配置

---

## 🔌 三、MCP 配置（MCP Configuration）

### 3.1 默认 MCP 服务器

#### `crates/executors/default_mcp.json`
```json
{
  "vibe_kanban": {
    "command": "npx",
    "args": ["-y", "vibe-kanban@latest", "--mcp"]
  },
  "context7": {
    "type": "http",
    "url": "https://mcp.context7.com/mcp"
  },
  "playwright": {
    "command": "npx",
    "args": ["@playwright/mcp@latest"]
  },
  "exa": {
    "command": "npx",
    "args": ["-y", "exa-mcp-server"]
  },
  "chrome_devtools": {
    "command": "npx",
    "args": ["chrome-devtools-mcp@latest"]
  }
}
```
- **内置 MCP**:
  1. **Vibe Kanban MCP**: 任务管理
  2. **Context7**: 文档和代码示例
  3. **Playwright**: 浏览器自动化
  4. **Exa**: 网络搜索和代码上下文
  5. **Chrome DevTools**: 浏览器调试

---

## 🤖 四、Agent 配置（Agent Configuration）

### 4.1 默认 Profiles 配置

#### `crates/executors/default_profiles.json`
- **作用**: 为不同 AI Agent 定义预设配置
- **支持的 Agent**:
  - **CLAUDE_CODE**: Claude Code (支持 Plan/Opus/Approvals 模式)
  - **AMP**: AMP Agent
  - **GEMINI**: Gemini (Flash/Pro/Approvals)
  - **CODEX**: Codex GPT-5.2 (支持 high/max reasoning)
  - **OPENCODE**: OpenCode (支持 plan/approvals 模式)
  - **QWEN_CODE**: Qwen Code
  - **CURSOR_AGENT**: Cursor Agent (支持多种模型)
  - **COPILOT**: GitHub Copilot
  - **DROID**: Droid Agent

- **配置示例**:
```json
"CLAUDE_CODE": {
  "DEFAULT": {
    "CLAUDE_CODE": {
      "dangerously_skip_permissions": true
    }
  },
  "PLAN": {
    "CLAUDE_CODE": {
      "plan": true
    }
  }
}
```

### 4.2 Agent Schemas

#### `shared/schemas/*.json`
- **claude_code.json**: Claude Code 配置 schema
- **codex.json**: Codex 配置 schema
- **gemini.json**: Gemini 配置 schema
- **opencode.json**: OpenCode 配置 schema
- **copilot.json**: Copilot 配置 schema
- **cursor_agent.json**: Cursor Agent 配置 schema
- **droid.json**: Droid 配置 schema
- **qwen_code.json**: Qwen Code 配置 schema
- **amp.json**: AMP 配置 schema

- **schema 包含的配置项**:
  - `model`: 模型选择
  - `plan`: 是否启用计划模式
  - `approvals`: 是否需要审批
  - `sandbox`: 沙箱配置
  - `auto_approve`: 自动审批
  - `dangerously_skip_permissions`: 跳过权限检查
  - `append_prompt`: 附加提示词

---

## 🎨 五、用户配置（User Configuration）

### 5.1 代码风格配置

#### `rustfmt.toml`
```toml
reorder_imports = true
group_imports = "StdExternalCrate"
imports_granularity = "Crate"
```
- **作用**: Rust 代码格式化规则
- **规则**:
  - 重新排序导入
  - 按标准库/外部库/本地 crate 分组
  - 以 crate 为粒度合并导入

#### `.cargo/config.toml`
- **作用**: Cargo 配置
- **可能包含**: 构建缓存、源替换等

### 5.2 ESLint 配置

#### 前端 ESLint (在 package.json 中)
- **插件**:
  - `@typescript-eslint/eslint-plugin`
  - `eslint-plugin-react-hooks`
  - `eslint-plugin-prettier`
  - `eslint-plugin-i18next`
  - `eslint-plugin-unused-imports`

---

## 🌍 六、环境配置（Environment Configuration）

### 6.1 环境变量文件

#### `.gitignore` 中排除的环境文件
- `.env`: 本地开发环境变量
- `.env.remote`: 远程部署环境变量
- `.env.local`: 本地覆盖
- `.env.development.local`: 开发环境特定
- `.env.test.local`: 测试环境特定
- `.env.production.local`: 生产环境特定

#### `remote-frontend/.env.production.example`
- **作用**: 远程前端生产环境变量模板
- **用途**: 提供环境变量参考，不应提交真实密钥

### 6.2 远程部署配置

#### `crates/remote/docker-compose.yml`
- **作用**: Docker Compose 配置
- **用途**: 远程部署容器编排

---

## 🛠️ 七、开发配置（Development Configuration）

### 7.1 TypeScript 配置

#### `frontend/tsconfig.json`
```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```
- **路径别名**:
  - `@/*`: `./src/*`
  - `@dialogs/*`: `./src/components/dialogs/*`
  - `shared/*`: `../shared/*`

#### `frontend/tsconfig.node.json`
- **作用**: Node.js 环境的 TypeScript 配置
- **用途**: Vite 配置文件的类型检查

### 7.2 Vite 配置

#### `frontend/vite.config.ts`
- **插件**: React 插件
- **构建优化**: 代码分割、压缩

#### `remote-frontend/vite.config.ts`
- **作用**: 远程前端 Vite 配置

### 7.3 Tailwind CSS 配置

#### `frontend/tailwind.new.config.js`
- **作用**: 新设计系统配置
- **特点**: 使用 CSS 变量，支持 `.new-design` 作用域

#### `frontend/tailwind.legacy.config.js`
- **作用**: 旧版 Tailwind 配置

### 7.4 PostCSS 配置

#### `frontend/postcss.config.cjs`
- **插件**: Autoprefixer
- **作用**: 自动添加浏览器前缀

---

## 📋 八、其他配置文件

### 8.1 Docker 配置

#### `Dockerfile`
- **作用**: Docker 镜像构建

#### `.dockerignore`
- **作用**: Docker 构建时忽略的文件

### 8.2 开发工具配置

#### `rust-toolchain.toml`
- **作用**: 指定 Rust 工具链版本

#### `.dev-ports.json`
- **作用**: 开发端口分配（动态生成，不提交）

---

## 🔍 配置文件优先级

### 环境变量加载顺序（从低到高）
1. `.env`: 默认环境变量
2. `.env.local`: 本地覆盖（不提交）
3. `.env.development.local` / `.env.test.local` / `.env.production.local`: 特定环境

### TypeScript 配置继承
```
tsconfig.json (base)
  ├── extends
  └── references
      └── tsconfig.node.json (Node 环境)
```

---

## 📝 配置文件最佳实践

### ✅ 推荐做法
1. **环境变量**: 使用 `.env.example` 提供模板
2. **代码风格**: 统一使用 rustfmt 和 Prettier
3. **类型安全**: TypeScript 严格模式
4. **依赖管理**: 使用 pnpm workspace 和 Cargo workspace

### ⚠️ 注意事项
1. **不要提交**:
   - `.env.local` 文件
   - `.dev-ports.json`
   - 真实的 API 密钥

2. **保持同步**:
   - Rust 类型变更后运行 `pnpm run generate-types`
   - 修改共享类型需要重新构建

3. **版本要求**:
   - Node.js >= 18
   - pnpm >= 8
   - Rust nightly-2025-12-04

---

## 🎯 快速参考

| 需求 | 配置文件 |
|------|----------|
| 添加新依赖 | `package.json` / `Cargo.toml` |
| 修改 Agent 行为 | `default_profiles.json` |
| 配置 MCP 服务器 | `default_mcp.json` |
| 调整代码风格 | `rustfmt.toml` / `.prettierrc.json` |
| 设置环境变量 | `.env` |
| 修改构建配置 | `vite.config.ts` / `Cargo.toml` |
| 配置 CI/CD | `.github/workflows/*.yml` |

---

**报告结束**

*本文档由 Claude Code 自动生成*
