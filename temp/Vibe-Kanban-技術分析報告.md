# Vibe Kanban 技術分析報告（繁體中文版）

## 專案基本資訊

**專案名稱**: Vibe Kanban  
**版本**: 0.0.56  
**許可證**: Apache License 2.0  
**官方網站**: https://vibekanban.com  
**GitHub 倉庫**: https://github.com/BloopAI/vibe-kanban  
**NPM 套件**: https://www.npmjs.com/package/vibe-kanban  

## 專案概述

Vibe Kanban 是一個革命性的 AI 程式設計代理協調平台，專為現代軟體開發流程設計。它將傳統的看板管理與多個 AI 程式設計助手（如 Claude Code、Gemini CLI、Amp 等）深度整合，讓開發者能夠透過視覺化介面高效管理和協調多個 AI 代理的並行工作。

### 核心價值主張

1. **多 AI 代理統一管理**：支援 10+ 種主流 AI 程式設計工具的統一介面
2. **可視化任務協調**：透過 Kanban 看板直觀地管理開發任務
3. **實時執行監控**：提供 WebSocket 串流的即時日誌和狀態更新
4. **GitHub 深度整合**：自動化的分支管理、PR 建立和程式碼審查流程
5. **零設定即用**：透過 `npx vibe-kanban` 一行命令啟動

## 技術架構深度分析

### 1. 整體架構設計

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vibe Kanban 架構全景                          │
├─────────────────────────────────────────────────────────────────┤
│  前端 (React 18 + TypeScript)                                   │
│  ├── UI 層: shadcn/ui + Tailwind CSS + Radix UI                │
│  ├── 狀態管理: React Hooks + Context API                        │
│  ├── 路由: React Router                                         │
│  └── 拖拽: @dnd-kit (Kanban 操作)                               │
├─────────────────────────────────────────────────────────────────┤
│  後端 (Rust + Axum)                                             │
│  ├── Web 框架: Axum (Tokio 非同步)                              │
│  ├── 資料庫: SQLite + SQLx (編譯時查詢檢查)                      │
│  ├── 執行器系統: 多 AI 代理抽象層                                │
│  └── MCP 伺服器: Model Context Protocol 支援                    │
├─────────────────────────────────────────────────────────────────┤
│  整合層                                                          │
│  ├── GitHub OAuth + API 整合                                    │
│  ├── Git 操作: libgit2 (分支管理、worktree)                     │
│  ├── 類型同步: ts-rs (Rust → TypeScript)                        │
│  └── WebSocket: 即時日誌串流                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 2. 後端核心模組分析

#### 2.1 執行器系統 (Executor System)

**設計模式**: 策略模式 + 工廠模式

```rust
// 統一的執行器介面
#[async_trait]
pub trait Executor: Send + Sync {
    async fn spawn(&self, pool: &SqlitePool, task_id: Uuid, worktree_path: &str) 
        -> Result<CommandProcess, ExecutorError>;
    
    async fn spawn_followup(&self, pool: &SqlitePool, task_id: Uuid, 
        session_id: &str, prompt: &str, worktree_path: &str) 
        -> Result<CommandProcess, ExecutorError>;
        
    fn normalize_logs(&self, logs: &str, worktree_path: &str) 
        -> Result<NormalizedConversation, String>;
}
```

**支援的執行器類型**:
- **Claude Code**: Anthropic Claude 編程助手
- **Gemini CLI**: Google Gemini 命令行工具
- **Amp**: 新興的 AI 編程代理
- **Aider**: 開源 AI 配對編程工具
- **Codex**: GitHub Copilot 相關工具
- **Setup Script**: 自定義設置腳本
- **Dev Server**: 應用伺服器管理
- **Echo**: 測試和調試用執行器

**執行器配置枚舉**:
```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub enum ExecutorConfig {
    Echo,
    Claude,
    ClaudePlan,
    Amp,
    Gemini,
    SetupScript { script: String },
    ClaudeCodeRouter,
    CharmOpencode,
    SstOpencode,
    Aider,
    Codex,
}
```

#### 2.2 資料庫模型設計

**SQLite 資料表結構**:

```sql
-- 專案表
CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    repo_path TEXT,
    github_repo_id INTEGER,
    setup_script TEXT,
    cleanup_script TEXT,
    dev_script TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 任務表
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    project_id INTEGER NOT NULL,
    executor_config TEXT NOT NULL,
    parent_task_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 任務執行表
CREATE TABLE task_attempts (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    status TEXT NOT NULL,
    branch TEXT,
    base_branch TEXT,
    pr_url TEXT,
    worktree_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- 執行過程表
CREATE TABLE execution_processes (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    executor_type TEXT NOT NULL,
    status TEXT NOT NULL,
    stdout TEXT,
    stderr TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (attempt_id) REFERENCES task_attempts(id)
);
```

#### 2.3 Git 整合與工作樹管理

**Worktree 隔離策略**:
```rust
// 每個任務建立獨立的 Git worktree
pub struct WorktreeManager {
    base_repo_path: PathBuf,
    worktree_base: PathBuf,
}

impl WorktreeManager {
    // 為任務建立隔離的工作環境
    pub async fn create_worktree(&self, task_id: Uuid, branch_name: &str) 
        -> Result<PathBuf, GitError> {
        let worktree_path = self.worktree_base.join(format!("task-{}", task_id));
        
        // 使用 libgit2 建立 worktree
        let repo = Repository::open(&self.base_repo_path)?;
        repo.worktree(&branch_name, &worktree_path, None)?;
        
        Ok(worktree_path)
    }
}
```

#### 2.4 WebSocket 串流系統

**即時日誌串流實現**:
```rust
// 輸出串流到資料庫和 WebSocket
pub async fn stream_output_to_db(
    output: impl AsyncRead + Unpin,
    pool: SqlitePool,
    attempt_id: Uuid,
    execution_process_id: Uuid,
    is_stdout: bool,
) {
    let mut reader = BufReader::new(output);
    let mut accumulated_output = String::new();
    
    // 快速更新閾值：每行或 256 字節
    while let Ok(bytes_read) = reader.read_line(&mut line).await {
        if bytes_read == 0 { break; }
        
        accumulated_output.push_str(&line);
        
        // 即時更新資料庫
        if accumulated_output.len() > BUFFER_SIZE_THRESHOLD {
            ExecutionProcess::append_output(
                &pool, execution_process_id, 
                Some(&accumulated_output), None
            ).await?;
            accumulated_output.clear();
        }
    }
}
```

### 3. 前端架構分析

#### 3.1 組件架構設計

**核心組件樹**:
```
App
├── ThemeProvider (主題管理)
├── ConfigProvider (配置管理)
├── Router
│   ├── ProjectsPage
│   │   ├── ProjectList
│   │   ├── ProjectCard
│   │   └── ProjectForm
│   ├── ProjectTasksPage
│   │   ├── TaskKanbanBoard
│   │   ├── TaskCard (拖拽支援)
│   │   ├── TaskDetailsPanel
│   │   └── TaskFormDialog
│   └── SettingsPage
└── GlobalDialogs
    ├── GitHubLoginDialog
    ├── OnboardingDialog
    └── DisclaimerDialog
```

#### 3.2 狀態管理策略

**React Context + Hooks 模式**:
```typescript
// 任務詳情上下文
export const TaskDetailsContext = createContext<{
  selectedTask: Task | null;
  setSelectedTask: (task: Task | null) => void;
  logs: ExecutionProcess[];
  refreshLogs: () => void;
}>({});

// 配置管理 Hook
export const useConfig = () => {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    configApi.get().then(setConfig).finally(() => setLoading(false));
  }, []);
  
  return { config, loading, updateConfig: configApi.update };
};
```

#### 3.3 即時更新機制

**WebSocket 整合**:
```typescript
// 執行過程即時監控
export const useProcessLogs = (processId: string) => {
  const [logs, setLogs] = useState<string>('');
  
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3001/api/stream/${processId}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'stdout') {
        setLogs(prev => prev + data.content);
      }
    };
    
    return () => ws.close();
  }, [processId]);
  
  return logs;
};
```

## 主要功能模組詳解

### 1. 專案管理系統

**功能特色**:
- **GitHub 倉庫同步**: OAuth 認證後自動同步倉庫列表
- **本地專案管理**: 支援本地 Git 倉庫的專案建立
- **腳本配置**: 設置腳本、清理腳本、開發伺服器腳本
- **專案模板**: 預定義的專案範本快速建立

**API 端點**:
```
GET    /api/projects              # 獲取專案列表
POST   /api/projects              # 建立新專案
GET    /api/projects/:id          # 獲取專案詳情
PUT    /api/projects/:id          # 更新專案
DELETE /api/projects/:id          # 刪除專案
GET    /api/projects/:id/tasks    # 獲取專案任務
```

### 2. 任務看板系統

**Kanban 狀態流程**:
```
To Do → In Progress → Review → Done
  ↓         ↓          ↓       ↓
待處理    執行中      審查中   已完成
```

**任務操作功能**:
- **拖拽操作**: @dnd-kit 實現的流暢拖拽體驗
- **狀態轉移**: 自動觸發相應的執行器動作
- **批量操作**: 多選任務的批量狀態更新
- **篩選排序**: 多維度的任務篩選和排序

**任務生命週期管理**:
```typescript
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress', 
  REVIEW = 'review',
  DONE = 'done',
  FAILED = 'failed'
}

// 任務狀態轉移邏輯
export const handleTaskStatusChange = async (
  taskId: string, 
  newStatus: TaskStatus
) => {
  switch (newStatus) {
    case TaskStatus.IN_PROGRESS:
      // 啟動 AI 執行器
      await startTaskExecution(taskId);
      break;
    case TaskStatus.REVIEW:
      // 等待人工審查
      await pauseExecution(taskId);
      break;
    case TaskStatus.DONE:
      // 清理工作樹，建立 PR
      await completeTask(taskId);
      break;
  }
};
```

### 3. AI 執行器協調系統

**執行器抽象層設計**:

所有 AI 執行器都實作統一的 `Executor` trait，提供以下核心功能：

1. **任務啟動** (`spawn`): 為新任務啟動 AI 代理
2. **後續對話** (`spawn_followup`): 在現有會話中繼續對話
3. **日誌標準化** (`normalize_logs`): 將不同 AI 的輸出格式統一化
4. **串流執行** (`execute_streaming`): 即時將執行過程串流到前端

**執行流程**:
```rust
// 1. 建立任務嘗試
let attempt = TaskAttempt::create(pool, task_id, branch_name).await?;

// 2. 建立 Git worktree
let worktree_path = git_service.create_worktree(task_id, &branch_name).await?;

// 3. 啟動執行器
let executor = config.create_executor();
let mut process = executor.execute_streaming(
    pool, task_id, attempt.id, process_id, &worktree_path
).await?;

// 4. 監控執行狀態
tokio::spawn(async move {
    let exit_status = process.wait().await?;
    ExecutionProcess::mark_completed(pool, process_id, exit_status).await?;
});
```

### 4. GitHub 整合系統

**OAuth 認證流程**:
```rust
// GitHub Device Flow 實現
pub async fn start_device_flow() -> Result<DeviceFlowResponse, GitHubError> {
    let client = octocrab::instance();
    
    let device_codes = client
        .post("/login/device/code", Some(&json!({
            "client_id": GITHUB_CLIENT_ID,
            "scope": "repo user:email"
        })))
        .await?;
        
    Ok(DeviceFlowResponse {
        device_code: device_codes.device_code,
        user_code: device_codes.user_code,
        verification_uri: device_codes.verification_uri,
        interval: device_codes.interval,
    })
}
```

**自動化 PR 工作流程**:
1. 任務完成後自動建立分支
2. 提交 AI 產生的程式碼變更
3. 透過 GitHub API 建立 Pull Request
4. 設定 PR 標題、描述和審查者
5. 監控 PR 狀態變化

### 5. 即時監控系統

**WebSocket 架構**:
```rust
// WebSocket 路由設定
pub fn stream_router() -> Router<AppState> {
    Router::new()
        .route("/stream/:process_id", get(websocket_handler))
}

// WebSocket 訊息處理
async fn websocket_handler(
    ws: WebSocketUpgrade,
    Path(process_id): Path<Uuid>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        handle_websocket(socket, process_id, state).await;
    })
}
```

**前端即時更新**:
```typescript
// React Hook 封裝 WebSocket 連接
export const useExecutionStream = (processId: string) => {
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<ProcessStatus>('running');
  
  useEffect(() => {
    const ws = new WebSocket(`/api/stream/${processId}`);
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'stdout':
          setOutput(prev => prev + message.data);
          break;
        case 'status_change':
          setStatus(message.status);
          break;
        case 'completed':
          setStatus('completed');
          break;
      }
    };
    
    return () => ws.close();
  }, [processId]);
  
  return { output, status };
};
```

## MCP (Model Context Protocol) 整合

### MCP 伺服器實現

Vibe Kanban 內建完整的 MCP 伺服器，讓外部工具能夠透過標準化協議與系統整合：

```rust
// MCP 工具定義
pub fn register_tools() -> Vec<Tool> {
    vec![
        Tool::new("create_task")
            .description("Create a new task in a project")
            .parameter("project_id", ParameterType::String, true)
            .parameter("title", ParameterType::String, true)
            .parameter("description", ParameterType::String, false),
            
        Tool::new("update_task")
            .description("Update an existing task")
            .parameter("task_id", ParameterType::String, true)
            .parameter("status", ParameterType::String, false),
            
        Tool::new("list_tasks")
            .description("List all tasks in a project")
            .parameter("project_id", ParameterType::String, true),
    ]
}
```

### MCP 整合優勢

1. **IDE 整合**: VS Code 擴展可透過 MCP 直接操作 Kanban
2. **CLI 工具**: 命令行工具可自動建立和更新任務
3. **第三方服務**: 整合 Slack、Discord 等通訊工具
4. **自動化腳本**: CI/CD 流程可自動操作任務狀態

## 效能最佳化策略

### 1. 前端效能優化

**程式碼分割**:
```typescript
// 路由層級的懶載入
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

// 組件層級的條件載入
const TaskDetailsPanel = lazy(() => 
  import('./components/TaskDetailsPanel')
);
```

**狀態優化**:
- 使用 `useMemo` 和 `useCallback` 防止不必要的重新渲染
- 實作虛擬化列表處理大量任務
- WebSocket 連接的智能管理和自動重連

### 2. 後端效能優化

**資料庫優化**:
```sql
-- 關鍵索引設計
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_execution_processes_attempt ON execution_processes(attempt_id);
CREATE INDEX idx_task_attempts_task_status ON task_attempts(task_id, status);
```

**並發處理**:
- Tokio 非同步執行時的充分利用
- 執行器池管理防止系統過載
- SQLite 的 WAL 模式啟用並發讀取

### 3. 記憶體管理

**Rust 記憶體安全**:
- Zero-copy 字串處理
- Arc/Mutex 的智能使用
- 及時清理臨時 worktree

## 安全性設計

### 1. 認證與授權

**GitHub OAuth 安全**:
- PKCE (Proof Key for Code Exchange) 流程
- Token 的安全儲存和自動刷新
- 最小權限原則 (repo, user:email)

### 2. 程式碼執行安全

**沙盒隔離**:
- Git worktree 提供檔案系統隔離
- 執行器進程的權限限制  
- 敏感操作的明確確認機制

### 3. 資料安全

**本地資料保護**:
- SQLite 資料庫的檔案權限控制
- 敏感配置的加密儲存
- 審計日誌的完整記錄

## 部署與擴展性

### 1. 部署方式

**單命令部署**:
```bash
# NPX 即時部署
npx vibe-kanban

# Docker 容器部署  
docker run -p 3000:3000 vibe-kanban

# 原始碼編譯部署
pnpm run build && ./build-npm-package.sh
```

### 2. 擴展性設計

**水平擴展能力**:
- SQLite → PostgreSQL 的遷移支援
- 多實例負載均衡
- Redis 快取層整合

**垂直擴展優化**:
- 多核心 CPU 的充分利用
- 記憶體池的動態調整
- I/O 操作的非同步最佳化

## 與 Claude Night Pilot 的整合可能性

基於以上技術分析，Vibe Kanban 與 Claude Night Pilot 在以下方面具有高度的整合潜力：

### 1. 技術棧相容性
- **共同語言**: 兩專案都大量使用 Rust 和 TypeScript
- **資料庫**: 都採用 SQLite 作為主要儲存
- **前端框架**: 都採用現代化的前端技術棧

### 2. 功能互補性
- **任務管理**: Vibe Kanban 的看板系統 + Claude Night Pilot 的排程系統
- **AI 整合**: Vibe Kanban 的多 AI 支援 + Claude Night Pilot 的 Claude 專精
- **監控系統**: 兩者的監控能力可以互相增強

### 3. 架構整合點
- **執行器系統**: Claude Night Pilot 可作為 Vibe Kanban 的一個執行器
- **MCP 協議**: 透過 MCP 實現兩系統間的標準化通訊
- **WebSocket 串流**: 統一的即時更新機制

## 結論與建議

Vibe Kanban 是一個技術上非常成熟且架構設計優秀的專案，其模組化設計、多 AI 整合能力、以及完整的前後端分離架構，都為與 Claude Night Pilot 的整合提供了良好的基礎。

**推薦整合策略**:

1. **短期整合**: 將 Claude Night Pilot 作為 Vibe Kanban 的一個執行器模組
2. **中期整合**: 融合兩者的排程和監控系統
3. **長期整合**: 建立統一的 AI 開發工作流程平台

這種整合將大大增強 Claude Night Pilot 的功能完整性和用戶體驗，同時也能為 Vibe Kanban 帶來更專業的 Claude 整合能力。