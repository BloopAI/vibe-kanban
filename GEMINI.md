# Vibe Kanban (yukika) — Project Context & Guidelines

Vibe Kanban is a comprehensive platform designed to accelerate the planning and review cycle for software engineers using coding agents (Claude Code, Gemini CLI, etc.). It provides a Kanban-based issue tracker, integrated AI workspaces (on dedicated git branches), real-time diff reviews, and application previews.

## Project Overview

- **Product Name:** Vibe Kanban
- **Core Goal:** Get 10X more out of coding agents by speeding up the plan/execute/review loop.
- **Main Technologies:**
    - **Backend:** Rust (Axum, Tokio, SQLx, Git2, Tauri)
    - **Frontend:** React (TypeScript, Vite, Tailwind CSS)
    - **Mobile:** Flutter (Dart, GoRouter, Provider, Firebase)
    - **Real-time Sync:** ElectricSQL (for Remote/Cloud version)
    - **Package Management:** `pnpm` (Node/Web), `cargo` (Rust)

## Architecture & Modules

The project is organized as a monorepo:

### Backend (Rust Crates) — `crates/`
- `server/`: Main local API and binary entry point.
- `api-types/`: Shared Rust structs for API requests/responses, exported to TypeScript.
- `db/`: SQLx models and migrations (SQLite locally, PostgreSQL for remote).
- `worktree-manager/`: Handles git worktree creation and lifecycle for AI workspaces.
- `workspace-manager/`: Manages agent execution environments.
- `mcp/`: Model Context Protocol implementation for agent interactions.
- `remote/`: Cloud/Hosted version of the server (PostgreSQL + ElectricSQL).
- `tauri-app/`: Desktop application wrapper.

### Frontend (TypeScript Packages) — `packages/`
- `local-web/`: The local web application (Vite + React).
- `remote-web/`: The remote/cloud web application.
- `web-core/`: Shared React components and logic used by both local and remote frontends.
- `ui/`: Core UI components library.

### Mobile (Flutter) — `yukika/app/`
- A Flutter-based mobile application for managing Kanban boards and issues.

### Shared & CLI
- `shared/`: Generated TypeScript types (`shared/types.ts`) and agent tool schemas. **Do not edit generated types directly.**
- `npx-cli/`: The CLI wrapper for `npx vibe-kanban`.
- `scripts/`: Development utility scripts (port management, DB seeding).

## Development Workflow

### Prerequisites
- **Rust:** Latest stable.
- **Node.js:** >= 20.
- **pnpm:** >= 8.
- **Flutter:** (Optional) For mobile development.

### Setup
1.  Install dependencies: `pnpm i`
2.  Prepare local database: `pnpm run prepare-db`

### Running the Application
- **Full Dev Environment:** `pnpm run dev` (Starts backend + local web).
- **Backend Only (Watch):** `pnpm run backend:dev:watch`
- **Local Web Only:** `pnpm run local-web:dev`
- **Tauri App:** `pnpm run tauri:dev`
- **Mobile App:** `cd yukika/app && flutter run`

### Type Synchronization
Vibe Kanban uses `ts-rs` to sync types between Rust and TypeScript.
- **Local App Types:** `pnpm run generate-types`
- **Remote App Types:** `pnpm run remote:generate-types`
- **Source of Truth:** Edit Rust structs in `crates/api-types` or `crates/server/src/bin/generate_types.rs`.

## Mobile App Development (Flutter)

The mobile app is located in `yukika/app/`.

### Setup
1.  Navigate to the directory: `cd yukika/app`
2.  Install dependencies: `flutter pub get`

### Running the App
-   Debug mode: `flutter run`
-   Release mode: `flutter run --release`

### Releasing to Firebase App Distribution (Android)
To release a new version of the Android app to Firebase App Distribution:

1.  **Boost Version Number:**
    Increment the `version` in `yukika/app/pubspec.yaml` (e.g., `1.0.1+2`).

2.  **Build the Release APK:**
    ```bash
    cd yukika/app
    flutter build apk --release
    ```

3.  **Deploy to Firebase:**
    ```bash
    # Ensure you are logged in: firebase login
    firebase appdistribution:distribute build/app/outputs/flutter-apk/app-release.apk \
      --app <APP_ID> \
      --release-notes "Your release notes here" \
      --groups "dev"
    ```
    -   The **App ID** for Android can be found in `yukika/app/lib/firebase_options.dart` (or `yukika/app/firebase.json`).
    -   Current Android App ID: `1:425794703726:android:0281b9b9410b2c3246717f`
    -   Target Tester Group: `dev`

## Key Commands Reference

| Command | Description |
| :--- | :--- |
| `pnpm run dev` | Start local backend and frontend dev servers. |
| `pnpm run check` | Run all type checks (Rust + TS). |
| `pnpm run format` | Format all code (Rust, TS, Prettier). |
| `pnpm run lint` | Run all linter checks (Clippy, ESLint). |
| `cargo test --workspace` | Run all Rust unit and integration tests. |
| `pnpm run generate-types` | Regenerate TypeScript types from Rust models. |
| `pnpm run prepare-db` | Seed and prepare the local SQLite database. |

## Coding Standards & Conventions

- **Rust:** Follow `rustfmt` (see `rustfmt.toml`). Group imports by crate. Use `anyhow` for errors and `tracing` for logging.
- **TypeScript/React:** 
    - Use Functional Components with Hooks.
    - **Styling:** Tailwind CSS using custom tokens (see `packages/local-web/AGENTS.md`).
    - **Naming:** PascalCase for components/files in `ui-new/`, camelCase for variables/functions.
- **Git:** Workspaces operate on dedicated branches. The `worktree-manager` handles branch lifecycle.

## Guidelines for AI Agents

- **Surgical Edits:** When modifying Rust types, always remember to run `pnpm run generate-types` to update the frontend.
- **CSS Guidelines:** Prefer custom spacing (`p-base`, `m-half`) and text tokens (`text-high`, `text-low`) defined in the new design system. Avoid standard `text-gray-*` classes.
- **Testing:** New backend logic must be accompanied by unit tests in a `#[cfg(test)]` block.
- **State Management:** 
    - **Web:** Uses a container/view pattern. Containers manage state, views are stateless.
    - **Mobile:** Uses `provider` and `go_router`.
- **Database:** All schema changes must be done via migrations in `crates/db/migrations/`.
