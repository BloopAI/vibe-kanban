import { test, expect } from '@playwright/test';

/**
 * IKA-15: Auth Error Suppression Tests
 *
 * Tests that 401 errors are not shown when user is not authenticated.
 * The app should gracefully handle unauthenticated state without flooding
 * the console with errors.
 */
test.describe('IKA-15: Auth Error Suppression', () => {
    test('should not make API calls when not authenticated', async ({ page }) => {
        // Track network requests
        const apiCalls: string[] = [];
        const authErrors: { url: string; status: number }[] = [];

        page.on('request', (request) => {
            const url = request.url();
            if (url.includes('/api/')) {
                apiCalls.push(url);
            }
        });

        page.on('response', (response) => {
            const url = response.url();
            const status = response.status();
            if (url.includes('/api/') && (status === 401 || status === 400)) {
                authErrors.push({ url, status });
            }
        });

        // Navigate to app without authentication
        await page.goto('/projects');

        // Wait a bit for any async requests
        await page.waitForTimeout(3000);

        // Should not have auth-related errors
        const authTokenErrors = authErrors.filter(
            (e) => e.url.includes('/auth/token') || e.url.includes('/api/projects')
        );

        // In unauthenticated state, we should have minimal or zero auth errors
        // The app should check auth status BEFORE making API calls
        expect(
            authTokenErrors.length,
            `Found ${authTokenErrors.length} auth errors: ${JSON.stringify(authTokenErrors)}`
        ).toBeLessThanOrEqual(1); // Allow at most 1 for initial auth check
    });

    test('should not spam console with 401 errors', async ({ page }) => {
        // Track console errors
        const consoleErrors: string[] = [];

        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        // Navigate to a project page (which triggers task loading)
        await page.goto('/projects/integration/tasks');

        // Wait for potential error spam
        await page.waitForTimeout(5000);

        // Count 401-related console errors
        const authRelatedErrors = consoleErrors.filter(
            (error) =>
                error.includes('401') ||
                error.includes('Unauthorized') ||
                error.includes('auth/token')
        );

        // Should not have excessive auth errors
        expect(
            authRelatedErrors.length,
            `Found ${authRelatedErrors.length} auth-related console errors`
        ).toBeLessThanOrEqual(2);
    });

    test('useProjects should not fetch when user is not signed in', async ({ page }) => {
        // Track /api/projects calls
        const projectsCalls: { url: string; status: number }[] = [];

        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('/api/projects') && !url.includes('/stream')) {
                projectsCalls.push({ url, status: response.status() });
            }
        });

        // Navigate to projects page without auth
        await page.goto('/projects');
        await page.waitForTimeout(3000);

        // Filter for 401 errors specifically
        const unauthorizedCalls = projectsCalls.filter((c) => c.status === 401);

        // Should have zero 401 errors on /api/projects when not signed in
        // The hook should check isSignedIn before making the request
        expect(
            unauthorizedCalls.length,
            `Got ${unauthorizedCalls.length} unauthorized project API calls`
        ).toBe(0);
    });

    test('WebSocket should not attempt connection when not authenticated', async ({ page }) => {
        // Track WebSocket connection attempts
        const wsAttempts: string[] = [];

        page.on('websocket', (ws) => {
            wsAttempts.push(ws.url());
        });

        // Navigate to a project tasks page
        await page.goto('/projects/integration/tasks');
        await page.waitForTimeout(3000);

        // Should not have WebSocket attempts to task streams when not authed
        const taskStreamAttempts = wsAttempts.filter((url) =>
            url.includes('/api/tasks/stream/ws')
        );

        expect(
            taskStreamAttempts.length,
            `Got ${taskStreamAttempts.length} WebSocket attempts when not authenticated`
        ).toBe(0);
    });
});
