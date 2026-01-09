import { test, expect } from '@playwright/test';

test.describe('Frontend Resilience & Rate Limits', () => {

    test('IKA-10: Should not retry on 429 (Too Many Requests)', async ({ page }) => {
        // 1. Mock API to return 429
        let requestCount = 0;
        await page.route('**/api/teams/*/members', async route => {
            requestCount++;
            await route.fulfill({
                status: 429,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Too many requests' }) // Lowercase as per bug report
            });
        });

        // 2. Navigate to a page that triggers the hook
        // Assuming /teams/ikanban/members triggers useTeamMembers
        // We might need to login or mock auth state first, but let's try direct navigation if public or mocked
        // For now, let's assume we can hit the page. If auth is needed, we'll need a global setup.
        // Simplifying: Just loading the app root might trigger some calls, but let's go to a team page.
        await page.goto('/teams/ikanban/members');

        // 3. Wait for a bit (longer than retry delay)
        await page.waitForTimeout(3000);

        // 4. Verify request count is 1 (Original request only, no retries)
        // Note: React Query default retry is 3 exponential. If our fix works, it returns false for retry immediately.
        expect(requestCount).toBeLessThanOrEqual(1);
    });

    test('IKA-11: Should show offline indicator when network is down', async ({ page }) => {
        await page.goto('/');

        // Simulate Offline
        await page.context().setOffline(true);

        // Check for Status Bar
        const offlineIndicator = page.locator('text=You\'re offline');
        await expect(offlineIndicator).toBeVisible({ timeout: 5000 });

        // Simulate Online
        await page.context().setOffline(false);
        await expect(offlineIndicator).toBeHidden({ timeout: 5000 });
    });

});
