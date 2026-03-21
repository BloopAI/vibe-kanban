# Vibe Builder: AI-Powered Task Orchestrator
## Architectural Design Document

This document outlines the architecture for a cross-platform task management system using **Flutter** (Frontend), **Firebase** (Global State & Database), and a **Rust Builder** (Local Execution Engine) powered by the Vibe Kanban core.

---

### 1. System Overview
The system is divided into three primary layers:
1.  **Management Layer (Flutter)**: A cross-platform mobile/web app for users to create projects, define tasks (issues), and monitor agent progress.
2.  **Coordination Layer (Firebase)**: A real-time cloud database (Firestore) that acts as the "Source of Truth" for task status, instructions, and execution logs.
3.  **Execution Layer (Rust Builder)**: A lightweight local background service running on a workstation that listens to Firebase, manages Git environments, and runs AI coding agents.

---

### 2. The Execution Layer (Rust Builder)
Instead of a full web server, the Builder is a specialized service that imports Vibe Kanban's core logic as library crates.

#### Core Components Reused:
*   **`crates/executors`**: Provides the abstraction for 10+ coding agents (Claude, Gemini, etc.). It handles process spawning, log capture, and authentication checks.
*   **`crates/worktree-manager`**: Ensures that every task runs in an isolated `git worktree`. This prevents the agent from corrupting the user's main development directory.
*   **`crates/services` (Partial)**: Specifically the `ContainerService` logic, which manages the state machine of a running process (Idle → Running → Success/Failure).

#### New Component: `crates/firebase-listener`
A custom Rust crate that:
*   Uses a Firebase Firestore client to subscribe to a `tasks` collection.
*   Filters for tasks where `status == 'READY'` and `assigned_builder == <LOCAL_ID>`.
*   Maps Firebase task data to Vibe Kanban `Execution` parameters.
*   Streams real-time output (stdout/stderr) from the agent back to a `logs` sub-collection in Firebase.

---

### 3. Data Flow: The "Task Lifecycle"

1.  **Definition**: User creates a task in the **Flutter App**.
    *   *Firebase State*: `{ status: 'PENDING', instructions: '...', repo: '...' }`
2.  **Trigger**: User marks the task as "Ready."
    *   *Firebase State*: `{ status: 'READY' }`
3.  **Pick-up**: The **Rust Builder** (listening via Firestore snapshots) detects the change.
    *   *Action*: Builder calls `WorktreeManager` to set up the environment.
    *   *Firebase State*: `{ status: 'PREPARING' }`
4.  **Execution**: Builder calls `CodingAgentExecutor` to start the LLM agent.
    *   *Action*: Logs are streamed to Firebase in real-time.
    *   *Firebase State*: `{ status: 'RUNNING', execution_id: '...' }`
5.  **Completion**: The agent finishes the task (commits or produces a diff).
    *   *Action*: Builder cleans up the worktree and pushes results to a PR/Branch.
    *   *Firebase State*: `{ status: 'COMPLETED', result_url: '...' }`

---

### 4. Technical Stack
*   **Frontend**: Flutter (Dart)
*   **Backend/Database**: Firebase Firestore, Firebase Auth (GitHub Provider)
*   **Execution Engine**: Rust (utilizing `tokio` for async and Vibe Kanban crates)
*   **Agent Communication**: Model Context Protocol (MCP) via `crates/mcp`
*   **Environment Manager**: Git (via `crates/worktree-manager`)

---

### 5. Future Considerations
*   **Preview Proxy**: Integrating `crates/preview-proxy` to allow the Flutter app to render a live web view of the agent's work-in-progress via a secure tunnel (e.g., Tailscale/Cloudflare).
*   **Multi-Builder Support**: Allowing a team to have multiple workstations (Builders) pulling from the same Firebase queue.

---

### 6. Pending Design Phases
*   **UI/UX Design**: Task boards, real-time log terminal in Flutter, and diff-viewer components.
*   **Frontend Implementation**: Flutter project structure and Firebase integration hooks.
