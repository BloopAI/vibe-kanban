# Vibe Kanban Testing Suite

This directory contains the automated end-to-end and integration tests for Vibe Kanban, using [Playwright](https://playwright.dev/).

## Prerequisites

- Node.js (v18+)
- Local frontend server running (http://localhost:3000)
- Local backend server running (http://localhost:3001)

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Install Browsers**:
    ```bash
    npx playwright install
    ```

## Authentication for Tests

Tests require access to authenticated routes. There are two options:

### Option 1: Disable Authentication (Recommended for E2E tests)

**Backend** - In project root `.env`:
```bash
ENABLE_API_AUTH=false
```

**Frontend** - In `vibe-frontend/.env.local`, do NOT set:
```bash
# VITE_CLERK_PUBLISHABLE_KEY=...  (leave unset or remove)
```

With auth disabled:
- Backend accepts all API requests without Clerk JWT
- Frontend's ProtectedRoute allows access without login
- Tests can access all pages and features directly

### Option 2: Authenticated Testing (Production-like)

Keep `ENABLE_API_AUTH=true` and Clerk configured, then:
1. Create a Playwright storage state with authenticated session
2. Use `test.use({ storageState: 'path/to/auth.json' })`

## Running Tests

### 1. Start Backend (with auth disabled for testing)
```bash
cd ../vibe-backend
ENABLE_API_AUTH=false cargo run --bin server
```

### 2. Start Frontend (without Clerk for testing)
```bash
cd ../vibe-frontend
# Ensure VITE_CLERK_PUBLISHABLE_KEY is NOT set in .env.local
pnpm dev
```
*Frontend runs on http://localhost:3000, backend on http://localhost:3001*

### 2. Run All Tests
```bash
npx playwright test
```

### 3. Run Specific Test File
```bash
npx playwright test tests/resilience.spec.ts
```

### 4. Run with UI Mode (Interactive)
```bash
npx playwright test --ui
```

### 5. View Report
After a run, view the HTML report:
```bash
npx playwright show-report
```

## Test Structure

-   `tests/resilience.spec.ts`: Verifies system resilience.
    -   **Rate Limits (IKA-10)**: Mocks 429 responses to ensure the client does NOT retry immediately.
    -   **Offline Mode (IKA-11)**: Simulates network offline state to verify the "You're offline" indicator and cache fallback.
