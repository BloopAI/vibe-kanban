---
description: "End-to-end full stack feature development workflow (Senior Architect Level)"
---

# Feature Development Standard Operating Procedure

This workflow enforces a structured, "Senior Architect" approach to feature development. It prioritizes clarity, documentation, and task tracking over immediate coding.

## 0. Context & Standards
- **Frontend Code:** `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/vibe-frontend`
- **Backend Code:** `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/vibe-backend`
- **Documentation:** `/Users/rupeshpanwar/Documents/docs/docs-ikanban`
- **Rules & Standards:** `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/rules`
- **Tech Stack Reference:** `/Users/rupeshpanwar/Documents/docs/docs-ikanban/architecture/tech-stack.md`

> [!CAUTION]
> **Credential Security:** NEVER hardcode passwords, API keys, or connection strings in code or documentation. Use environment variables defined in `.env` files. Ensure `.env` files are added to `.gitignore`. If a secret is accidentally committed or shared in conversation, rotate it immediately.


## 1. Task Initialization (Admin)
Before identifying the solution, establish the unit of work.
- [ ] Use the internal `vk` MCP tool to create a task in the iKanban system.
  - **Tool Location:** `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/mcp`
  - **Action:** Create task for the feature.
  - **Output:** Note the `<task-id>`.

## 2. Branching Strategy
- [ ] Create a local feature branch:
  ```bash
  git checkout -b feature/<task-id>-<task-name>
  ```

## 3. Architectural Design Phase (No Code)
Act as a Principal Engineer. Do not write implementation code yet. Focus on data flow, constraints, and edge cases.
- [ ] **Review Tech Stack:** Consult `/Users/rupeshpanwar/Documents/docs/docs-ikanban/architecture/tech-stack.md` to ensure alignment.
- [ ] **Create Documentation Directory:**
  - Path: `/Users/rupeshpanwar/Documents/docs/docs-ikanban/<feature-name>/`
- [ ] **Artifact 1: Architecture Flow**
  - File: `architecture-flow.txt`
  - Content: High-level ASCII art diagram showing usage flow, data traversal, and component interaction.
  - **Constraint:** NO CODE SNIPPETS.
- [ ] **Artifact 2: Implementation Plan**
  - File: `planning-phases.md`
  - Content: Detailed breakdown of execution phases (e.g., Database, API, Frontend, Integration). Discuss pros/cons of approaches.
  - **Constraint:** NO CODE SNIPPETS.

## 4. Implementation (Local First)
Execute the plan defined in phase 3. Work strictly in local environment initially.
- [ ] Implement the feature in the respective folders (frontend/backend).
- [ ] Maintain adherence to the `architecture-flow.txt`.

## 5. Verification & Quality Assurance (Local)
- [ ] Perform manual or automated testing in the **local environment**.
- [ ] Verify against acceptance criteria.

## 6. Deployment & Closure
- [ ] Merge feature branch into main locally:
  ```bash
  git checkout main
  git merge feature/<task-id>-<task-name>
  ```
- [ ] Push to remote to trigger deployment:
  ```bash
  git push origin main
  ```
- [ ] **Update Task Status:** Use the `vk` MCP tool to update the task status based on verification.
- [ ] **Close Task:** Close the task if successfully verified.
