const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runIntegrationsDemo() {
  console.log('🚀 Starting Integrations Page Demo with Playwright...');
  
  // Ensure screenshots directory exists
  const screenshotsDir = path.join(__dirname, 'integration-demo-assets');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ 
    headless: false, // Set to true for headless mode
    slowMo: 1000 // Slow down for demo purposes
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: screenshotsDir,
      size: { width: 1920, height: 1080 }
    }
  });
  
  const page = await context.newPage();

  try {
    console.log('📱 Navigating to the application...');
    
    // Navigate to the app - assuming it's running on localhost:3000
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-homepage.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Homepage captured');

    // Navigate to Integrations page
    console.log('🔗 Navigating to Integrations page...');
    await page.click('text=Integrations');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '02-integrations-page-empty.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Empty Integrations page captured');

    // Test adding a new integration
    console.log('➕ Testing Add Integration functionality...');
    await page.click('text=Add Integration');
    await page.waitForSelector('[role="dialog"]');
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '03-add-integration-dialog.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Add Integration dialog captured');

    // Fill out integration form
    console.log('📝 Filling out integration form...');
    await page.fill('input[id="name"]', 'Demo GitHub Integration');
    
    // Select category
    await page.click('[role="combobox"]:first-of-type');
    await page.click('text=Version Control');
    
    // Select provider
    await page.click('[role="combobox"]:last-of-type');
    await page.click('text=GitHub');
    
    // Add configuration
    const configTextarea = page.locator('textarea[id="config"]');
    await configTextarea.fill(`{
  "token": "demo_github_token",
  "organization": "demo-org",
  "repositories": ["repo1", "repo2"]
}`);

    // Enable the integration
    await page.click('input[id="enabled"]');
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '04-integration-form-filled.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Integration form filled');

    // Create the integration
    await page.click('text=Create Integration');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '05-integration-created.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Integration created');

    // Test filtering functionality
    console.log('🔍 Testing filter functionality...');
    
    // Add search term
    await page.fill('input[placeholder="Search integrations..."]', 'GitHub');
    await page.waitForTimeout(500);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '06-search-filter.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Search filter applied');

    // Clear search and test category filter
    await page.fill('input[placeholder="Search integrations..."]', '');
    await page.click('text=All Categories');
    await page.click('text=Version Control');
    await page.waitForTimeout(500);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '07-category-filter.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Category filter applied');

    // Test integration actions
    console.log('⚡ Testing integration actions...');
    
    // Test integration
    await page.click('text=Test');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '08-integration-test.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Integration test performed');

    // Open integration menu
    await page.click('[aria-label="More options"]');
    await page.waitForSelector('[role="menu"]');
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '09-integration-menu.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Integration menu opened');

    // Close menu
    await page.click('text=Configure');
    await page.waitForSelector('[role="dialog"]');
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '10-integration-configure.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Integration configuration dialog');

    // Cancel configuration
    await page.click('text=Cancel');
    await page.waitForTimeout(500);

    // Test adding different types of integrations
    console.log('🔄 Adding different integration types...');
    
    // Add AI Assistant integration
    await page.click('text=Add Integration');
    await page.waitForSelector('[role="dialog"]');
    
    await page.fill('input[id="name"]', 'Demo Claude Assistant');
    await page.click('[role="combobox"]:first-of-type');
    await page.click('text=AI Assistants');
    await page.click('[role="combobox"]:last-of-type');
    await page.click('text=Claude');
    
    const claudeConfig = page.locator('textarea[id="config"]');
    await claudeConfig.fill(`{
  "command": "claude",
  "args": ["--config", "/path/to/config.json"],
  "env": {
    "ANTHROPIC_API_KEY": "demo_api_key"
  }
}`);

    await page.click('input[id="enabled"]');
    await page.click('text=Create Integration');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '11-multiple-integrations.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Multiple integrations created');

    // Add Communication integration
    await page.click('text=Add Integration');
    await page.waitForSelector('[role="dialog"]');
    
    await page.fill('input[id="name"]', 'Demo Slack Integration');
    await page.click('[role="combobox"]:first-of-type');
    await page.click('text=Communication');
    await page.click('[role="combobox"]:last-of-type');
    await page.click('text=Slack');
    
    const slackConfig = page.locator('textarea[id="config"]');
    await slackConfig.fill(`{
  "workspace_id": "demo_workspace",
  "bot_token": "xoxb-demo-token",
  "channels": {
    "notifications": "#notifications",
    "task_updates": "#task-updates",
    "errors": "#errors"
  }
}`);

    await page.click('text=Create Integration');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '12-all-integration-types.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: All integration types demonstrated');

    // Show statistics and overview
    console.log('📊 Capturing statistics and overview...');
    
    // Clear any filters to show all integrations
    await page.click('text=Communication');
    await page.click('text=All Categories');
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '13-final-overview.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Final overview with statistics');

    console.log('🎥 Demo completed successfully!');
    console.log(`📁 All screenshots saved to: ${screenshotsDir}`);
    
    // List all created screenshots
    const screenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png'));
    console.log('\n📸 Screenshots created:');
    screenshots.forEach(screenshot => {
      console.log(`   - ${screenshot}`);
    });

  } catch (error) {
    console.error('❌ Error during demo:', error);
    
    // Take error screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'error-screenshot.png'),
      fullPage: true 
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

// Check if this script is being run directly
if (require.main === module) {
  runIntegrationsDemo().catch(console.error);
}

module.exports = { runIntegrationsDemo };