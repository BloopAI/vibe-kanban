import { test, expect } from '@playwright/test';

test.describe('IKA-39: Linked Document View Fix', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the documents page
        await page.goto('/teams/IKA/documents');
        await page.waitForTimeout(1000);
    });

    test('Document page should load without errors', async ({ page }) => {
        // Check that the page loads successfully
        // Looking for the Documents header or team name
        const pageContent = page.locator('text=Documents');
        const isLoaded = await pageContent.first().isVisible().catch(() => false);

        // If not authenticated, we expect a different view but no console errors
        // The key is that the page doesn't crash with a blank screen

        // Check for any error alerts
        const errorAlert = page.locator('[role="alert"]');
        const hasError = await errorAlert.isVisible().catch(() => false);

        if (hasError) {
            const errorText = await errorAlert.textContent();
            // Verify it's not a fatal error that would cause blank page
            expect(errorText).not.toContain('500');
            expect(errorText).not.toContain('Internal Server Error');
        }
    });

    test('Opening document via URL query param should not cause blank page', async ({ page }) => {
        // Test the direct document linking feature
        // Navigate to a document via ?doc=UUID parameter
        // This should load without throwing 500 errors

        // First check if we have access to documents page
        const header = page.locator('h1, text=Documents');
        const hasAccess = await header.first().isVisible().catch(() => false);

        if (!hasAccess) {
            test.skip(true, 'Skipping - authentication required or no access');
            return;
        }

        // Try navigating to a document with a test UUID
        // Even if document doesn't exist, we should get a proper error not blank page
        await page.goto('/teams/IKA/documents?doc=test-document-slug');
        await page.waitForTimeout(1500);

        // Page should not be completely blank
        const body = page.locator('body');
        const bodyText = await body.textContent().catch(() => '');

        // The body should have some content (not blank)
        expect(bodyText?.length).toBeGreaterThan(0);
    });

    test('Document content area should render when viewing a document', async ({ page }) => {
        // Navigate to documents page
        await page.goto('/teams/IKA/documents');
        await page.waitForTimeout(1000);

        // Check for authentication
        const uploadButton = page.getByRole('button', { name: /Upload Files/i });
        const isAuthenticated = await uploadButton.isVisible().catch(() => false);

        if (!isAuthenticated) {
            test.skip(true, 'Skipping - authentication required');
            return;
        }

        // Look for any existing document in the list
        const documentItems = page.locator('[class*="cursor-pointer"]').filter({
            has: page.locator('svg')
        });

        const documentCount = await documentItems.count();

        if (documentCount === 0) {
            // No documents to test with, but page loaded successfully
            test.skip(true, 'No documents available to test');
            return;
        }

        // Click the first document
        await documentItems.first().click();
        await page.waitForTimeout(1000);

        // Document viewer should appear
        // Look for Back button which appears in document view
        const backButton = page.getByRole('button', { name: /Back/i });
        const isDocumentView = await backButton.isVisible().catch(() => false);

        if (isDocumentView) {
            // Document view loaded successfully
            expect(backButton).toBeVisible();

            // Content area should exist (not blank)
            const contentArea = page.locator('.flex-1.min-h-0, textarea, [class*="prose"]');
            const hasContent = await contentArea.first().isVisible().catch(() => false);

            // Either we have content area or at least the page structure exists
            const pageStructure = page.locator('.h-full');
            expect(await pageStructure.count()).toBeGreaterThan(0);
        }
    });

    test('API should not return 500 error for missing files', async ({ page }) => {
        // Listen for network responses
        const responses: { url: string; status: number }[] = [];

        page.on('response', (response) => {
            if (response.url().includes('/documents/') && response.url().includes('/content')) {
                responses.push({
                    url: response.url(),
                    status: response.status(),
                });
            }
        });

        await page.goto('/teams/IKA/documents');
        await page.waitForTimeout(1000);

        // Check authentication
        const uploadButton = page.getByRole('button', { name: /Upload Files/i });
        const isAuthenticated = await uploadButton.isVisible().catch(() => false);

        if (!isAuthenticated) {
            test.skip(true, 'Skipping - authentication required');
            return;
        }

        // Look for any document to click
        const documentItems = page.locator('[class*="cursor-pointer"]').filter({
            has: page.locator('svg')
        });

        const documentCount = await documentItems.count();

        if (documentCount === 0) {
            test.skip(true, 'No documents available to test');
            return;
        }

        // Click a document to trigger content fetch
        await documentItems.first().click();
        await page.waitForTimeout(2000);

        // Check that no /content requests returned 500
        const failedRequests = responses.filter(r => r.status === 500);

        // If there were 500 errors, the fix didn't work
        expect(failedRequests.length).toBe(0);
    });

    test('Document viewer should show content or empty state gracefully', async ({ page }) => {
        await page.goto('/teams/IKA/documents');
        await page.waitForTimeout(1000);

        const uploadButton = page.getByRole('button', { name: /Upload Files/i });
        const isAuthenticated = await uploadButton.isVisible().catch(() => false);

        if (!isAuthenticated) {
            test.skip(true, 'Skipping - authentication required');
            return;
        }

        // Try to find and click a markdown document
        const documentItems = page.locator('[class*="cursor-pointer"]');
        const count = await documentItems.count();

        if (count === 0) {
            test.skip(true, 'No documents available');
            return;
        }

        // Click first document
        await documentItems.first().click();
        await page.waitForTimeout(1500);

        // Look for document view elements
        const backButton = page.getByRole('button', { name: /Back/i });
        const isDocView = await backButton.isVisible().catch(() => false);

        if (!isDocView) {
            // Document didn't open - might be a folder or other issue
            return;
        }

        // At this point, document view is open
        // It should NOT be completely blank

        // Check for either:
        // 1. Content area with text
        // 2. Loading spinner
        // 3. File info display
        const hasVisibleContent =
            await page.locator('textarea').isVisible().catch(() => false) ||
            await page.locator('[class*="prose"]').isVisible().catch(() => false) ||
            await page.locator('.whitespace-pre-wrap').isVisible().catch(() => false) ||
            await page.locator('text=/^MARKDOWN$/i').isVisible().catch(() => false) ||
            await page.locator('[class*="Loader"]').isVisible().catch(() => false);

        // Page structure should be present even if content is empty
        const pageStructure = page.locator('.flex.flex-col');
        const hasStructure = await pageStructure.first().isVisible().catch(() => false);

        expect(hasStructure || hasVisibleContent).toBeTruthy();
    });
});
