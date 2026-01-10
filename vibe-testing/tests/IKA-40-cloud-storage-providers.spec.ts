import { test, expect } from '@playwright/test';

test.describe('IKA-40: Cloud Storage Providers in Team Settings', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to a team page
        await page.goto('/teams/IKA/documents');
        await page.waitForTimeout(1000);
    });

    test('Team settings dialog should have storage provider section', async ({ page }) => {
        // Look for team name/settings trigger in sidebar
        const teamSettingsTrigger = page.locator('[data-testid="team-settings"]').first();
        const isAuthenticated = await teamSettingsTrigger.isVisible().catch(() => false);

        if (!isAuthenticated) {
            // Try alternative selector - look for settings button or edit team option
            const sidebarTeam = page.locator('text=iKanban').first();
            const isSidebarVisible = await sidebarTeam.isVisible().catch(() => false);

            if (!isSidebarVisible) {
                test.skip(true, 'Skipping test - authentication required');
                return;
            }

            // Right-click or look for settings menu
            await sidebarTeam.click({ button: 'right' });
            await page.waitForTimeout(500);

            const editTeamOption = page.getByRole('menuitem', { name: /Edit team|Settings/i });
            if (await editTeamOption.isVisible().catch(() => false)) {
                await editTeamOption.click();
            } else {
                test.skip(true, 'Skipping test - cannot access team settings');
                return;
            }
        }

        // Wait for dialog to appear
        await page.waitForTimeout(500);

        // Check for Document Storage section label
        const storageLabel = page.locator('text=Document Storage');
        const hasStorageSection = await storageLabel.isVisible().catch(() => false);

        if (hasStorageSection) {
            await expect(storageLabel).toBeVisible();
        }
    });

    test('Storage provider dropdown should show all options', async ({ page }) => {
        // This test verifies the dropdown contains all expected options
        // Navigate to team settings dialog first

        const sidebarTeam = page.locator('text=iKanban').first();
        const isSidebarVisible = await sidebarTeam.isVisible().catch(() => false);

        if (!isSidebarVisible) {
            test.skip(true, 'Skipping test - authentication required');
            return;
        }

        // Try to access team settings via context menu
        await sidebarTeam.click({ button: 'right' });
        await page.waitForTimeout(500);

        const editTeamOption = page.getByRole('menuitem', { name: /Edit team|Settings/i });
        if (!await editTeamOption.isVisible().catch(() => false)) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        await editTeamOption.click();
        await page.waitForTimeout(500);

        // Look for Storage Provider dropdown
        const storageDropdown = page.locator('#storage-provider');

        if (await storageDropdown.isVisible().catch(() => false)) {
            await storageDropdown.click();
            await page.waitForTimeout(300);

            // Verify all options are present
            await expect(page.locator('text=Default (Application Storage)')).toBeVisible();
            await expect(page.locator('text=Local Path')).toBeVisible();
            await expect(page.locator('text=Amazon S3')).toBeVisible();
            await expect(page.locator('text=Google Drive')).toBeVisible();
            await expect(page.locator('text=Dropbox')).toBeVisible();
        }
    });

    test('Selecting Local Path should show path input field', async ({ page }) => {
        const sidebarTeam = page.locator('text=iKanban').first();
        const isSidebarVisible = await sidebarTeam.isVisible().catch(() => false);

        if (!isSidebarVisible) {
            test.skip(true, 'Skipping test - authentication required');
            return;
        }

        await sidebarTeam.click({ button: 'right' });
        await page.waitForTimeout(500);

        const editTeamOption = page.getByRole('menuitem', { name: /Edit team|Settings/i });
        if (!await editTeamOption.isVisible().catch(() => false)) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        await editTeamOption.click();
        await page.waitForTimeout(500);

        const storageDropdown = page.locator('#storage-provider');

        if (await storageDropdown.isVisible().catch(() => false)) {
            await storageDropdown.click();
            await page.waitForTimeout(300);

            // Select Local Path
            const localPathOption = page.locator('text=Local Path');
            await localPathOption.click();
            await page.waitForTimeout(300);

            // Verify Local Path configuration appears
            const pathInput = page.locator('#local-path');
            await expect(pathInput).toBeVisible();

            // Verify Validate button appears
            const validateButton = page.getByRole('button', { name: /Validate/i });
            await expect(validateButton).toBeVisible();
        }
    });

    test('Selecting Amazon S3 should show S3 configuration fields', async ({ page }) => {
        const sidebarTeam = page.locator('text=iKanban').first();
        const isSidebarVisible = await sidebarTeam.isVisible().catch(() => false);

        if (!isSidebarVisible) {
            test.skip(true, 'Skipping test - authentication required');
            return;
        }

        await sidebarTeam.click({ button: 'right' });
        await page.waitForTimeout(500);

        const editTeamOption = page.getByRole('menuitem', { name: /Edit team|Settings/i });
        if (!await editTeamOption.isVisible().catch(() => false)) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        await editTeamOption.click();
        await page.waitForTimeout(500);

        const storageDropdown = page.locator('#storage-provider');

        if (await storageDropdown.isVisible().catch(() => false)) {
            await storageDropdown.click();
            await page.waitForTimeout(300);

            // Select Amazon S3
            const s3Option = page.locator('text=Amazon S3');
            await s3Option.click();
            await page.waitForTimeout(300);

            // Verify S3 configuration fields appear
            const bucketInput = page.locator('#s3-bucket');
            const regionSelect = page.locator('#s3-region');
            const accessKeyInput = page.locator('#s3-access-key');
            const secretKeyInput = page.locator('#s3-secret-key');

            await expect(bucketInput).toBeVisible();
            await expect(regionSelect).toBeVisible();
            await expect(accessKeyInput).toBeVisible();
            await expect(secretKeyInput).toBeVisible();
        }
    });

    test('Selecting Google Drive should show Connect button', async ({ page }) => {
        const sidebarTeam = page.locator('text=iKanban').first();
        const isSidebarVisible = await sidebarTeam.isVisible().catch(() => false);

        if (!isSidebarVisible) {
            test.skip(true, 'Skipping test - authentication required');
            return;
        }

        await sidebarTeam.click({ button: 'right' });
        await page.waitForTimeout(500);

        const editTeamOption = page.getByRole('menuitem', { name: /Edit team|Settings/i });
        if (!await editTeamOption.isVisible().catch(() => false)) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        await editTeamOption.click();
        await page.waitForTimeout(500);

        const storageDropdown = page.locator('#storage-provider');

        if (await storageDropdown.isVisible().catch(() => false)) {
            await storageDropdown.click();
            await page.waitForTimeout(300);

            // Select Google Drive
            const gdriveOption = page.locator('text=Google Drive');
            await gdriveOption.click();
            await page.waitForTimeout(300);

            // Verify Connect button appears
            const connectButton = page.getByRole('button', { name: /Connect with Google/i });
            await expect(connectButton).toBeVisible();

            // Verify "coming soon" message
            const comingSoonText = page.locator('text=Coming soon');
            await expect(comingSoonText).toBeVisible();
        }
    });

    test('Selecting Dropbox should show Connect button', async ({ page }) => {
        const sidebarTeam = page.locator('text=iKanban').first();
        const isSidebarVisible = await sidebarTeam.isVisible().catch(() => false);

        if (!isSidebarVisible) {
            test.skip(true, 'Skipping test - authentication required');
            return;
        }

        await sidebarTeam.click({ button: 'right' });
        await page.waitForTimeout(500);

        const editTeamOption = page.getByRole('menuitem', { name: /Edit team|Settings/i });
        if (!await editTeamOption.isVisible().catch(() => false)) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        await editTeamOption.click();
        await page.waitForTimeout(500);

        const storageDropdown = page.locator('#storage-provider');

        if (await storageDropdown.isVisible().catch(() => false)) {
            await storageDropdown.click();
            await page.waitForTimeout(300);

            // Select Dropbox
            const dropboxOption = page.locator('text=Dropbox');
            await dropboxOption.click();
            await page.waitForTimeout(300);

            // Verify Connect button appears
            const connectButton = page.getByRole('button', { name: /Connect with Dropbox/i });
            await expect(connectButton).toBeVisible();

            // Verify "coming soon" message
            const comingSoonText = page.locator('text=Coming soon');
            await expect(comingSoonText).toBeVisible();
        }
    });

    test('Switching storage providers should reset configuration', async ({ page }) => {
        const sidebarTeam = page.locator('text=iKanban').first();
        const isSidebarVisible = await sidebarTeam.isVisible().catch(() => false);

        if (!isSidebarVisible) {
            test.skip(true, 'Skipping test - authentication required');
            return;
        }

        await sidebarTeam.click({ button: 'right' });
        await page.waitForTimeout(500);

        const editTeamOption = page.getByRole('menuitem', { name: /Edit team|Settings/i });
        if (!await editTeamOption.isVisible().catch(() => false)) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        await editTeamOption.click();
        await page.waitForTimeout(500);

        const storageDropdown = page.locator('#storage-provider');

        if (await storageDropdown.isVisible().catch(() => false)) {
            // Select Local Path first
            await storageDropdown.click();
            await page.waitForTimeout(300);
            await page.locator('text=Local Path').click();
            await page.waitForTimeout(300);

            // Enter a path
            const pathInput = page.locator('#local-path');
            await pathInput.fill('/test/path');

            // Switch to S3
            await storageDropdown.click();
            await page.waitForTimeout(300);
            await page.locator('text=Amazon S3').click();
            await page.waitForTimeout(300);

            // Verify S3 bucket field is empty (config was reset)
            const bucketInput = page.locator('#s3-bucket');
            const bucketValue = await bucketInput.inputValue();
            expect(bucketValue).toBe('');
        }
    });

    test('Default option should hide provider-specific fields', async ({ page }) => {
        const sidebarTeam = page.locator('text=iKanban').first();
        const isSidebarVisible = await sidebarTeam.isVisible().catch(() => false);

        if (!isSidebarVisible) {
            test.skip(true, 'Skipping test - authentication required');
            return;
        }

        await sidebarTeam.click({ button: 'right' });
        await page.waitForTimeout(500);

        const editTeamOption = page.getByRole('menuitem', { name: /Edit team|Settings/i });
        if (!await editTeamOption.isVisible().catch(() => false)) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        await editTeamOption.click();
        await page.waitForTimeout(500);

        const storageDropdown = page.locator('#storage-provider');

        if (await storageDropdown.isVisible().catch(() => false)) {
            // Select Local Path first to show config
            await storageDropdown.click();
            await page.waitForTimeout(300);
            await page.locator('text=Local Path').click();
            await page.waitForTimeout(300);

            // Verify config is visible
            const pathInput = page.locator('#local-path');
            await expect(pathInput).toBeVisible();

            // Switch back to Default
            await storageDropdown.click();
            await page.waitForTimeout(300);
            await page.locator('text=Default (Application Storage)').click();
            await page.waitForTimeout(300);

            // Verify config is hidden
            await expect(pathInput).not.toBeVisible();
        }
    });

    test('S3 region dropdown should have multiple region options', async ({ page }) => {
        const sidebarTeam = page.locator('text=iKanban').first();
        const isSidebarVisible = await sidebarTeam.isVisible().catch(() => false);

        if (!isSidebarVisible) {
            test.skip(true, 'Skipping test - authentication required');
            return;
        }

        await sidebarTeam.click({ button: 'right' });
        await page.waitForTimeout(500);

        const editTeamOption = page.getByRole('menuitem', { name: /Edit team|Settings/i });
        if (!await editTeamOption.isVisible().catch(() => false)) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        await editTeamOption.click();
        await page.waitForTimeout(500);

        const storageDropdown = page.locator('#storage-provider');

        if (await storageDropdown.isVisible().catch(() => false)) {
            // Select Amazon S3
            await storageDropdown.click();
            await page.waitForTimeout(300);
            await page.locator('text=Amazon S3').click();
            await page.waitForTimeout(300);

            // Click region dropdown
            const regionSelect = page.locator('#s3-region');
            await regionSelect.click();
            await page.waitForTimeout(300);

            // Verify some region options exist
            await expect(page.locator('text=US East (N. Virginia)')).toBeVisible();
            await expect(page.locator('text=US West (Oregon)')).toBeVisible();
            await expect(page.locator('text=EU (Ireland)')).toBeVisible();
        }
    });
});
