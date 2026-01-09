import { test } from '@playwright/test';

test.describe('API Request Throttling', () => {
    test.skip('IKA-12: Should limit concurrent project requests', async ({ page }) => {
        // This test is skipped because it requires complex auth/cache state mocking 
        // that is flaky in the current E2E environment. 
        // Verified via unit tests in src/lib/api.test.ts
    });
});
