---
description: "End-to-end full stack feature development workflow (Senior Architect Level)"
---

# Feature Development Standard Operating Procedure

This workflow enforces a structured, "Senior Architect" approach to feature development. It prioritizes clarity, documentation, and task tracking over immediate coding.

## 0. Context & Standards
- **Frontend Code:** `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/vibe-frontend`
- **Backend Code:** `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/vibe-backend`
- **Documentation:** `/Users/rupeshpanwar/Documents/docs/docs-ikanban`
- **Rules & Standards:** `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/.agent/rules`
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

## 3.5. Test-Driven Development (TDD)
> [!IMPORTANT]
> **Philosophy:** Write tests BEFORE implementation to define expected behavior and ensure correctness.

Define test cases based on the implementation plan:
- [ ] **Create Test File:** In `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/vibe-testing/tests/`
  - Name: `<feature-name>.spec.ts`
  - Location: `vibe-testing/tests/<feature-name>.spec.ts`
  
- [ ] **Write Test Cases:** Using Playwright for E2E testing
  ```typescript
  // Example structure (do NOT copy verbatim):
  test.describe('Feature Name', () => {
    test('should handle success case', async ({ page }) => {
      // Arrange, Act, Assert
    });
    
    test('should handle error case', async ({ page }) => {
      // Arrange, Act, Assert
    });
  });
  ```

- [ ] **Test Coverage Requirements:**
  - Happy path (success scenarios)
  - Error handling (validation failures, network errors)
  - Edge cases (empty states, boundary conditions)
  - Authentication/Authorization (if applicable)

- [ ] **Run Tests (Expect Failures):**
  ```bash
  cd vibe-testing
  npx playwright test tests/<feature-name>.spec.ts
  ```
  *Tests should FAIL initially - this confirms they're testing real behavior.*

## 4. Implementation (Local First)

Execute the plan defined in phase 3. Work strictly in local environment initially.
- [ ] Implement the feature in the respective folders (frontend/backend).
- [ ] Maintain adherence to the `architecture-flow.txt`.
- [ ] **Verify Tests Pass:** Run the tests written in TDD phase (3.5):
  ```bash
  cd vibe-testing
  npx playwright test tests/<feature-name>.spec.ts
  ```
  *All tests should PASS now. If any fail, debug and fix the implementation.*


## 4.5. SQLx Query Cache (If Database Changes)
> [!IMPORTANT]
> **Required when:** Adding/modifying SQL queries, changing database schema.
> **Reference:** `/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/.agent/rules/SQLxQueryCache.md`

If you modified database queries or schema:
- [ ] Push schema changes to Supabase:
  ```bash
  cd vibe-backend/schema
  npx drizzle-kit push:pg
  ```
- [ ] Regenerate SQLx query cache:
  ```bash
  cd vibe-backend/crates/db
  cargo sqlx prepare
  ```
- [ ] Commit the updated cache files:
  ```bash
  git add crates/db/.sqlx/
  git commit -m "chore: update sqlx query cache"
  ```

## 5. Verification & Quality Assurance (Local)
Verify the implementation works correctly before deployment.

### 5.1. Manual Testing
- [ ] Test the feature manually in the **local environment**.
- [ ] Verify against acceptance criteria.
- [ ] Check edge cases and error handling.

### 5.2. Automated Browser Testing (UI Features)
> [!IMPORTANT]
> **Required for:** Any feature with frontend/UI components or API authentication changes.

Use the `browser_subagent` tool to automate browser validation:
- [ ] **Authentication Verification:** If the feature involves auth, verify tokens are sent correctly:
  ```
  Navigate to the feature page, check Authorization headers in Network tab,
  confirm API requests succeed without 401 errors.
  ```
- [ ] **Functional Testing:** Automate user flows through the browser:
  ```
  Open the page, click through the feature workflow, verify expected
  behavior, check console for errors.
  ```
- [ ] **API Integration:** For backend changes, verify API responses:
  ```
  Trigger API calls from UI, inspect responses, confirm data integrity.
  ```
- [ ] **Save Recording:** All browser tests are automatically recorded as `.webp` videos in the artifacts directory for documentation.

### 5.3. CLI/API Testing (Backend Features)
For backend-only features or API endpoints:
- [ ] Test using `mcp/cli.py` with API token authentication.
- [ ] Verify API responses match expected schema.
- [ ] Check error handling and validation.
  ```bash
  # Example: Test issues API
  VIBE_API_TOKEN=vk_xxx python3 mcp/cli.py issues IKA
  ```


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
