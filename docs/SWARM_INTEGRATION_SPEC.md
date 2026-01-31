# Swarm Integration Specification

## Visão Geral

Migração do backend do Swarm (Node.js) para dentro do Vibe-Kanban (Rust), resultando em um único backend unificado.

**Objetivo:** Todas as tasks do swarm aparecem no frontend do vibe-kanban, com monitoramento em tempo real da execução nos sandboxes.

---

## Arquitetura

### Antes: 2 Backends Separados

```
┌─────────────────────────┐        ┌─────────────────────────┐
│   VIBE-KANBAN (Rust)    │        │     SWARM (Node.js)     │
│   porta 5173            │        │     porta 8080          │
│                         │        │                         │
│ • Tasks                 │        │ • SwarmService          │
│ • Workspaces            │        │ • TaskService           │
│ • Sessions              │        │ • AgentService          │
│ • Git                   │        │ • PoolManager           │
│                         │        │ • TriggerEngine         │
│ • SQLite                │        │ • ChatService           │
│                         │        │ • DaytonaProvider       │
│                         │        │                         │
│                         │        │ • JSON files            │
└─────────────────────────┘        └─────────────────────────┘
```

### Depois: 1 Backend Unificado

```
┌─────────────────────────────────────────────────────────────┐
│                    VIBE-KANBAN (Rust)                        │
│                      porta 5173                              │
│                                                              │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │   EXISTENTE         │    │   NOVO (migrado do swarm)   │ │
│  │                     │    │                             │ │
│  │ • Tasks             │    │ • SwarmService              │ │
│  │ • Workspaces        │    │ • PoolManager               │ │
│  │ • Sessions          │    │ • TriggerEngine             │ │
│  │ • Git               │    │ • ChatService               │ │
│  │ • Projects          │    │ • DaytonaClient             │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
│                                                              │
│                        SQLite (tudo junto)                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Conceitos

| Conceito | Descrição |
|----------|-----------|
| **Swarm** | Projeto/contexto de trabalho que agrupa tasks |
| **Task** | Unidade de trabalho a ser executada |
| **Skill** | Instruções no description da task (`SKILL: xxx`) |
| **CLI** | Ferramentas no description da task (`CLI: xxx`) |
| **Sandbox** | Container Daytona temporário que executa a task |
| **Pool** | Conjunto de sandboxes ativos no momento |

**Importante:** Não existe "Agent" como entidade fixa. Sandboxes são criados dinamicamente, executam, e são destruídos.

---

## Fluxo de Execução

```
1. USUÁRIO
   "Quero criar uma API de pagamentos"
         │
         ▼
2. SWARM MASTER ANALISA
   - Busca skill apropriada (das 213 disponíveis)
   - Busca CLI necessário
   - Define tags
         │
         ▼
3. CRIA TASK
   {
     "title": "Criar API de pagamentos",
     "description": "SKILL: backend-developer\nCLI: stripe-cli\n\n...",
     "tags": ["backend", "api", "payments"],
     "priority": "high"
   }
         │
         ▼
4. TRIGGER ENGINE
   - Detecta task pendente
   - Cria sandbox dinâmico (Daytona)
   - Injeta prompt com skill e CLI
         │
         ▼
5. SANDBOX EXECUTA
   - Claude Code roda dentro do sandbox
   - Lê a skill
   - Usa o CLI
   - Faz o trabalho
         │
         ▼
6. FINALIZA
   - Task marcada como DONE
   - Sandbox destruído (ou volta pro pool)
   - Próxima task começa
```

---

## Database: Novas Tabelas

### Tabela: swarms

```sql
CREATE TABLE swarms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',  -- active, paused, stopped
    project_id TEXT REFERENCES projects(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tabela: swarm_chat

```sql
CREATE TABLE swarm_chat (
    id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL REFERENCES swarms(id),
    sender_type TEXT NOT NULL,  -- system, user, sandbox
    sender_id TEXT,             -- sandbox_id se for sandbox
    message TEXT NOT NULL,
    metadata TEXT,              -- JSON com dados extras
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Alterações na tabela tasks

```sql
ALTER TABLE tasks ADD COLUMN swarm_id TEXT REFERENCES swarms(id);
ALTER TABLE tasks ADD COLUMN sandbox_id TEXT;
ALTER TABLE tasks ADD COLUMN depends_on TEXT;      -- JSON array de task_ids
ALTER TABLE tasks ADD COLUMN triggers_after TEXT;  -- JSON array de task_ids
ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium';
ALTER TABLE tasks ADD COLUMN result TEXT;
ALTER TABLE tasks ADD COLUMN error TEXT;
ALTER TABLE tasks ADD COLUMN started_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMP;
```

### Tabela: sandboxes (pool tracking)

```sql
CREATE TABLE sandboxes (
    id TEXT PRIMARY KEY,
    daytona_id TEXT NOT NULL,
    swarm_id TEXT REFERENCES swarms(id),
    status TEXT NOT NULL DEFAULT 'idle',  -- idle, busy, destroyed
    current_task_id TEXT REFERENCES tasks(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);
```

---

## API Endpoints Novos

### Swarms

```
GET    /api/swarms                    # Lista todos os swarms
POST   /api/swarms                    # Cria novo swarm
GET    /api/swarms/:id                # Detalhes do swarm
PUT    /api/swarms/:id                # Atualiza swarm
DELETE /api/swarms/:id                # Deleta swarm
POST   /api/swarms/:id/pause          # Pausa o swarm
POST   /api/swarms/:id/resume         # Retoma o swarm
```

### Tasks do Swarm

```
GET    /api/swarms/:id/tasks          # Lista tasks do swarm
POST   /api/swarms/:id/tasks          # Cria task no swarm
GET    /api/swarms/:id/tasks/:taskId  # Detalhes da task
PUT    /api/swarms/:id/tasks/:taskId  # Atualiza task
DELETE /api/swarms/:id/tasks/:taskId  # Deleta task
POST   /api/swarms/:id/tasks/:taskId/retry  # Retry task falha
```

### Chat

```
GET    /api/swarms/:id/chat           # Lista mensagens
POST   /api/swarms/:id/chat           # Envia mensagem
```

### Pool

```
GET    /api/pool                      # Status do pool de sandboxes
GET    /api/pool/:sandboxId           # Detalhes de um sandbox
DELETE /api/pool/:sandboxId           # Destroi sandbox
POST   /api/pool/cleanup              # Limpa sandboxes idle
```

### Skills

```
GET    /api/skills                    # Lista todas as skills
GET    /api/skills/:name              # Conteúdo de uma skill
GET    /api/skills/search?q=xxx       # Busca skills
```

### WebSocket

```
WS     /ws/swarms/:id/tasks/:taskId/logs   # Stream de logs da task
WS     /ws/swarms/:id/chat                 # Stream do chat
WS     /ws/pool                            # Status do pool em tempo real
```

---

## Migração de Código

### De Node.js para Rust

| Node.js (origem) | Rust (destino) |
|------------------|----------------|
| `lib/swarm/SwarmService.js` | `crates/services/src/swarm/mod.rs` |
| `lib/swarm/TaskService.js` | Usar `tasks` existente + extensões |
| `lib/swarm/TaskExecutor.js` | `crates/services/src/swarm/executor.rs` |
| `lib/swarm/PoolManager.js` | `crates/services/src/swarm/pool.rs` |
| `lib/swarm/TriggerEngine.js` | `crates/services/src/swarm/trigger.rs` |
| `lib/swarm/ChatService.js` | `crates/services/src/swarm/chat.rs` |
| `lib/sandbox/DaytonaProvider.js` | `crates/services/src/swarm/daytona.rs` |
| `lib/routes/*.js` | `crates/server/src/routes/swarm/*.rs` |

---

## Frontend

### Rotas Novas

```
/swarms                      # Lista de swarms
/swarms/:id                  # Kanban do swarm + chat + monitor
```

### Layout: Swarm Detail

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HEADER                                                                      │
│  ← Swarms    📦 Nome do Swarm                         [⏸ Pause] [⚙️ Config] │
├────────────────────────────────────┬────────────────────────────────────────┤
│                                    │                                         │
│           KANBAN                   │            SIDE PANEL                   │
│           (60%)                    │             (40%)                       │
│                                    │                                         │
│  PENDING   RUNNING    DONE         │  ┌────────────────────────────────┐    │
│  ┌──────┐ ┌────────┐ ┌──────┐     │  │ 📦 POOL                        │    │
│  │Task 2│ │●Task 1 │ │Task 0│     │  │ sbx-abc ● Task 1               │    │
│  │      │ │        │ │  ✓   │     │  │ sbx-def ○ idle                 │    │
│  └──────┘ └────────┘ └──────┘     │  └────────────────────────────────┘    │
│                                    │                                         │
│  [+ Nova Task]                     │  ┌────────────────────────────────┐    │
│                                    │  │ 💬 CHAT                        │    │
│                                    │  │ mensagens...                   │    │
│                                    │  │ [input]                  [➤]  │    │
│                                    │  └────────────────────────────────┘    │
├────────────────────────────────────┴────────────────────────────────────────┤
│                                                                              │
│  👁️ MONITOR: Task 1 - Criar API                              [━ minimizar] │
│  ──────────────────────────────────────────────────────────────────────────  │
│  📦 sbx-abc123 │ 🧠 backend-developer │ 🔧 stripe-cli │ ⏱️ 2m15s           │
│                                                                              │
│  > Lendo skill backend-developer...                                         │
│  > Criando src/api/payments.py...                                           │
│  🤖 Claude: Vou usar FastAPI + Stripe SDK                                   │
│  ```python                                                                   │
│  @router.post("/payments")                                                  │
│  ...                                                                         │
│  █                                                                           │
│  ──────────────────────────────────────────────────────────────────────────  │
│  [⏹️ Cancelar] [📋 Copiar] [↻ Auto-scroll: ON]                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Task Card

```
┌────────────────────────────────────┐
│ 📝 Criar API de pagamentos         │
│                                    │
│ 🧠 SKILL: backend-developer        │  ← Extraído do description
│ 🔧 CLI: stripe-cli                 │  ← Extraído do description
│ 🏷️ backend, api, payments          │  ← Tags
│                                    │
│ ─────── Se RUNNING ─────────────── │
│ 📦 Sandbox: sbx-abc123             │
│ ⏱️ Rodando: 2m 15s                 │
│ ████████░░░░ 65%                   │
│                                    │
│ [👁️ Ver Execução]                  │  ← Abre monitor
└────────────────────────────────────┘
```

### Monitor: Estados

**RUNNING (streaming)**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 👁️ MONITOR: Task 1                                         🟢 RUNNING      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📦 sbx-abc123 │ 🧠 backend-developer │ 🔧 stripe-cli │ ⏱️ 2m15s            │
│                                                                              │
│ > Criando arquivo src/api/payments.py...                                    │
│ 🤖 Claude: Implementando endpoint POST /payments                            │
│ ```python                                                                    │
│ @router.post("/payments")                                                   │
│ async def create_payment(amount: int):                                      │
│ █                                                                            │
│                                                                              │
│ [⏹️ Cancelar] [📋 Copiar] [↻ Auto-scroll: ON]                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

**COMPLETED**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 👁️ MONITOR: Task 1                                         ✅ COMPLETED    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tempo total: 3m 45s                                                          │
│                                                                              │
│ Resultado:                                                                   │
│ API de pagamentos criada com sucesso                                        │
│                                                                              │
│ Arquivos criados:                                                            │
│ 📄 src/api/payments.py                                                       │
│ 📄 src/models/payment.py                                                     │
│ 📄 tests/test_payments.py                                                    │
│                                                                              │
│ [📋 Ver Log Completo] [📄 Ver Arquivos]                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**FAILED**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 👁️ MONITOR: Task 5                                         ❌ FAILED       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tempo: 1m 20s                                                                │
│                                                                              │
│ Erro:                                                                        │
│ DOCKER_TOKEN não configurado                                                │
│                                                                              │
│ Log:                                                                         │
│ > Tentando push para registry...                                            │
│ > Error: unauthorized: authentication required                              │
│                                                                              │
│ [🔄 Retry] [📋 Ver Log Completo]                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**PENDING**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 👁️ MONITOR: Task 2                                         ⏳ PENDING      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Aguardando execução...                                                       │
│ Posição na fila: 2                                                           │
│                                                                              │
│ Depende de:                                                                  │
│ └── ⏳ Task 1 - Criar API (running)                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Componentes Novos

```
frontend/src/components/swarm/
├── SwarmList.tsx           # Lista de swarms (/swarms)
├── SwarmCard.tsx           # Card de um swarm na lista
├── SwarmDetail.tsx         # Página completa do swarm
├── SwarmKanban.tsx         # Board de tasks
├── SwarmChat.tsx           # Painel de chat
├── SwarmPool.tsx           # Status dos sandboxes
├── SwarmMonitor.tsx        # Monitor de execução
├── TaskCardSwarm.tsx       # Card de task com info de execução
├── CreateSwarmDialog.tsx   # Modal criar swarm
└── CreateTaskDialog.tsx    # Modal criar task
```

---

## Fases de Implementação

### Fase 1: Database
- [ ] Migration: tabela `swarms`
- [ ] Migration: tabela `swarm_chat`
- [ ] Migration: tabela `sandboxes`
- [ ] Migration: campos extras em `tasks`

### Fase 2: Daytona Client (Rust)
- [ ] HTTP client para Daytona API
- [ ] Criar sandbox
- [ ] Executar comando
- [ ] Stream de logs
- [ ] Deletar sandbox

### Fase 3: Services Core
- [ ] SwarmService (CRUD)
- [ ] PoolManager (gerenciar sandboxes)
- [ ] ChatService (mensagens)

### Fase 4: Executor
- [ ] TriggerEngine (loop de execução)
- [ ] TaskExecutor (rodar Claude no sandbox)
- [ ] Prompt builder (injetar skill + CLI)

### Fase 5: API Routes
- [ ] /api/swarms/*
- [ ] /api/pool/*
- [ ] /api/skills/*
- [ ] WebSocket /ws/swarms/:id/tasks/:taskId/logs

### Fase 6: Frontend
- [ ] SwarmList + SwarmCard
- [ ] SwarmDetail (layout split)
- [ ] SwarmKanban
- [ ] SwarmChat
- [ ] SwarmPool
- [ ] SwarmMonitor
- [ ] TaskCardSwarm
- [ ] Dialogs (criar swarm, criar task)

---

## Settings: Configuração do Swarm

Nova página de settings para configurar o Daytona e outras opções do Swarm.

### Rota

```
/settings/swarm    # Nova aba no settings
```

### Arquivo

```
frontend/src/pages/settings/SwarmSettings.tsx
```

### Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Settings > Swarm                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  🔌 Daytona Connection                                                  ││
│  │  ───────────────────────────────────────────────────────────────────    ││
│  │                                                                          ││
│  │  API URL                                                                 ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │ https://api.daytona.io                                          │    ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  │  URL da API do Daytona                                                  ││
│  │                                                                          ││
│  │  API Key                                                                 ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │ ••••••••••••••••••••••••••••••••                                │ 👁️ ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  │  Chave de API do Daytona                                                ││
│  │                                                                          ││
│  │  [🔄 Testar Conexão]   Status: 🟢 Conectado                             ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  📦 Pool Configuration                                                  ││
│  │  ───────────────────────────────────────────────────────────────────    ││
│  │                                                                          ││
│  │  Max Sandboxes                                                           ││
│  │  ┌──────────┐                                                            ││
│  │  │ 5        │  Máximo de sandboxes simultâneos                          ││
│  │  └──────────┘                                                            ││
│  │                                                                          ││
│  │  Idle Timeout (minutos)                                                  ││
│  │  ┌──────────┐                                                            ││
│  │  │ 10       │  Tempo até destruir sandbox idle                          ││
│  │  └──────────┘                                                            ││
│  │                                                                          ││
│  │  Default Snapshot                                                        ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │ swarm-lite-v1                                              ▼   │    ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  │  Snapshot base para novos sandboxes                                     ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  🔐 Claude Credentials                                                  ││
│  │  ───────────────────────────────────────────────────────────────────    ││
│  │                                                                          ││
│  │  Anthropic API Key                                                       ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │ ••••••••••••••••••••••••••••••••                                │ 👁️ ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  │  API key para os sandboxes usarem Claude                                ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  📁 Skills Directory                                                    ││
│  │  ───────────────────────────────────────────────────────────────────    ││
│  │                                                                          ││
│  │  Skills Path                                                             ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │ /root/.claude/skills                                            │ 📂 ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  │  Diretório onde as skills estão armazenadas                             ││
│  │                                                                          ││
│  │  Skills encontradas: 213                                                 ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  🔧 Git Integration                                                     ││
│  │  ───────────────────────────────────────────────────────────────────    ││
│  │                                                                          ││
│  │  ☑️ Auto-commit após task completa                                      ││
│  │  ☑️ Auto-push para remote                                               ││
│  │                                                                          ││
│  │  Git Token (para push)                                                   ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │ ••••••••••••••••••••••••••••••••                                │ 👁️ ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  │  Token para autenticar push nos sandboxes                               ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  ⚡ Trigger Engine                                                      ││
│  │  ───────────────────────────────────────────────────────────────────    ││
│  │                                                                          ││
│  │  ☑️ Trigger Engine ativo                                                ││
│  │                                                                          ││
│  │  Poll Interval (segundos)                                                ││
│  │  ┌──────────┐                                                            ││
│  │  │ 5        │  Intervalo entre verificações de tasks pendentes          ││
│  │  └──────────┘                                                            ││
│  │                                                                          ││
│  │  Execution Timeout (minutos)                                             ││
│  │  ┌──────────┐                                                            ││
│  │  │ 10       │  Tempo máximo de execução de uma task                     ││
│  │  └──────────┘                                                            ││
│  │                                                                          ││
│  │  Max Retries                                                             ││
│  │  ┌──────────┐                                                            ││
│  │  │ 3        │  Tentativas antes de marcar como failed                   ││
│  │  └──────────┘                                                            ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ──────────────────────────────────────────────────────────────────────────  │
│                                            [Discard]  [Save Changes]        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Database: Tabela de Configuração

```sql
CREATE TABLE swarm_config (
    id TEXT PRIMARY KEY DEFAULT 'default',

    -- Daytona
    daytona_api_url TEXT,
    daytona_api_key TEXT,  -- Encrypted

    -- Pool
    pool_max_sandboxes INTEGER DEFAULT 5,
    pool_idle_timeout_minutes INTEGER DEFAULT 10,
    pool_default_snapshot TEXT DEFAULT 'swarm-lite-v1',

    -- Claude
    anthropic_api_key TEXT,  -- Encrypted

    -- Skills
    skills_path TEXT DEFAULT '/root/.claude/skills',

    -- Git
    git_auto_commit BOOLEAN DEFAULT true,
    git_auto_push BOOLEAN DEFAULT false,
    git_token TEXT,  -- Encrypted

    -- Trigger
    trigger_enabled BOOLEAN DEFAULT true,
    trigger_poll_interval_seconds INTEGER DEFAULT 5,
    trigger_execution_timeout_minutes INTEGER DEFAULT 10,
    trigger_max_retries INTEGER DEFAULT 3,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default config
INSERT INTO swarm_config (id) VALUES ('default');
```

### API Endpoints

```
GET    /api/config/swarm           # Retorna configuração (sem secrets)
PUT    /api/config/swarm           # Atualiza configuração
POST   /api/config/swarm/test      # Testa conexão com Daytona
GET    /api/config/swarm/status    # Status do Daytona + Pool + Trigger
```

### Modelo Rust

```rust
// crates/db/src/models/swarm_config.rs

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct SwarmConfig {
    pub id: String,

    // Daytona
    pub daytona_api_url: Option<String>,
    #[serde(skip_serializing)]  // Never return to frontend
    pub daytona_api_key: Option<String>,

    // Pool
    pub pool_max_sandboxes: i32,
    pub pool_idle_timeout_minutes: i32,
    pub pool_default_snapshot: String,

    // Claude
    #[serde(skip_serializing)]
    pub anthropic_api_key: Option<String>,

    // Skills
    pub skills_path: String,

    // Git
    pub git_auto_commit: bool,
    pub git_auto_push: bool,
    #[serde(skip_serializing)]
    pub git_token: Option<String>,

    // Trigger
    pub trigger_enabled: bool,
    pub trigger_poll_interval_seconds: i32,
    pub trigger_execution_timeout_minutes: i32,
    pub trigger_max_retries: i32,

    pub updated_at: DateTime<Utc>,
}

// DTO para update (aceita secrets)
#[derive(Debug, Deserialize)]
pub struct UpdateSwarmConfig {
    pub daytona_api_url: Option<String>,
    pub daytona_api_key: Option<String>,
    pub pool_max_sandboxes: Option<i32>,
    pub pool_idle_timeout_minutes: Option<i32>,
    pub pool_default_snapshot: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub skills_path: Option<String>,
    pub git_auto_commit: Option<bool>,
    pub git_auto_push: Option<bool>,
    pub git_token: Option<String>,
    pub trigger_enabled: Option<bool>,
    pub trigger_poll_interval_seconds: Option<i32>,
    pub trigger_execution_timeout_minutes: Option<i32>,
    pub trigger_max_retries: Option<i32>,
}
```

### Fases de Implementação Atualizadas

Na **Fase 1: Database**, adicionar:
- [ ] Migration: tabela `swarm_config`

Na **Fase 5: API Routes**, adicionar:
- [ ] /api/config/swarm (GET, PUT)
- [ ] /api/config/swarm/test
- [ ] /api/config/swarm/status

Na **Fase 6: Frontend**, adicionar:
- [ ] SwarmSettings.tsx
- [ ] Adicionar aba "Swarm" no SettingsLayout

---

## Referências

### Código Original (Node.js)
- `/root/claude-swarm-plugin/lib/swarm/` - Services
- `/root/claude-swarm-plugin/lib/routes/` - Routes
- `/root/claude-swarm-plugin/lib/sandbox/DaytonaProvider.js` - Daytona client
- `/root/claude-swarm-plugin/claude-code/agents/swarm-master.md` - Prompt do orchestrator

### Skills
- `/root/.claude/skills/` - 213 skills disponíveis
- Estrutura: `{skill-name}/SKILL.md`

### Vibe-Kanban Existente
- `/root/vibe-kanban/crates/db/` - Models e migrations
- `/root/vibe-kanban/crates/server/src/routes/` - API routes
- `/root/vibe-kanban/crates/services/` - Business logic
- `/root/vibe-kanban/frontend/src/` - React frontend
