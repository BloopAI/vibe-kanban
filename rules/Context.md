# Project Context & Architecture

## Directory Structure

* **Root**: `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban`
* **Backend**: `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/vibe-backend` (Rust/Axum)
* **Frontend**: `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/vibe-frontend` (React/Vite)
  * *Note: User referred to this as `vibe-frontend`, but actual dir is `frontend`.*

## Infrastructure

* **Hosting**: Railway
*   **Backend Deployment**:
    *   Source: Docker Image (`rupeedev/vibe-kanban-backend:latest`)
    *   CI/CD: GitHub Actions (`deploy-backend.yml`) -> Docker Hub -> Railway
*   **Database**: SQLite (Local embedded in Backend on Railway)

## Local Development Context
*   **Frontend Port**: 3003 (as per user request)
*   **Backend Port**: 3003 (Note: Potential conflict if running simultaneously; Dockerfile defaults to 3000)


## Key Constraints

* **Backend Build**: Must be built on Linux (via GitLab CI or Docker) due to macOS linker issues.
* **Auth**: JWT & Clerk


## Dependencies & Build Performance
*   **Total Count**: ~702 (Transitive dependencies in `Cargo.lock`)
*   **Why so many?**:
    1.  **Axum/Hyper/Tokio Stack**: A standard modern web stack; just "Hello World" pulls ~150 crates.
    2.  **"Full" Features**: `tokio` and other crates are enabled with wide feature sets.
    3.  **Heavy Lifters**: `sqlx` (database macros), `openssl-sys` (C compilation), `serde` (serialization).
*   **Performance Impact**:
    *   **Compile Time**: High (~22m for initial clean build). **Solved** via Docker Layer Caching (`cargo-chef`) in the CI pipeline.
    *   **Runtime**: Negligible. Rust uses "Dead Code Elimination", so unused functions from these dependencies are NOT included in the final binary.


