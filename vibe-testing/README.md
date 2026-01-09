# Vibe Kanban Testing Suite

This directory contains the automated end-to-end and integration tests for Vibe Kanban, using [Playwright](https://playwright.dev/).

## Prerequisites

- Node.js (v18+)
- Local frontend server running (usually at http://localhost:3002 or http://localhost:5173)

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Install Browsers**:
    ```bash
    npx playwright install
    ```

## Running Tests

### 1. Start the Frontend
Ensure the Vibe Kanban frontend is running in a separate terminal:
```bash
cd ../vibe-frontend
pnpm dev
```
*Note the port it starts on (e.g., 3002). Update `playwright.config.ts` `baseURL` if usage differs.*

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
