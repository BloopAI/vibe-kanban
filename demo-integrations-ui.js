const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function createIntegrationsDemo() {
  console.log('🚀 Creating Integrations Page UI Demo...');
  
  // Ensure screenshots directory exists
  const screenshotsDir = path.join(__dirname, 'integrations-demo-assets');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();

  try {
    console.log('📱 Creating demo HTML page...');
    
    // Create a demo HTML page that showcases the integrations UI
    const demoHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vibe Kanban - Integrations Page Demo</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .integration-card {
            transition: all 0.2s ease-in-out;
        }
        .integration-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        .health-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        .health-healthy { background-color: #10b981; }
        .health-error { background-color: #ef4444; }
        .health-warning { background-color: #f59e0b; }
        .health-unknown { background-color: #6b7280; }
    </style>
</head>
<body class="bg-gray-50">
    <!-- Navigation Bar -->
    <div class="border-b bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex items-center justify-between h-16">
                <div class="flex items-center space-x-6">
                    <div class="font-bold text-xl text-blue-600">Vibe Kanban</div>
                    <div class="flex items-center space-x-1">
                        <button class="px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">Projects</button>
                        <button class="px-3 py-2 rounded-md text-sm font-medium bg-blue-600 text-white">Integrations</button>
                        <button class="px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">MCP Servers</button>
                        <button class="px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">Settings</button>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <button class="px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">Docs</button>
                    <button class="px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">Support</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
            <div>
                <h1 class="text-2xl font-bold text-gray-900">Integrations</h1>
                <p class="text-gray-600 mt-1">Connect your favorite tools and services to enhance your workflow.</p>
            </div>
            <div class="flex items-center space-x-2">
                <button class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                    🔄 Refresh
                </button>
                <button class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
                    ➕ Add Integration
                </button>
            </div>
        </div>

        <!-- Filters -->
        <div class="bg-white p-4 rounded-lg border mb-6">
            <div class="flex items-center space-x-4">
                <div class="flex-1">
                    <div class="relative">
                        <input type="text" placeholder="Search integrations..." class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center">🔍</div>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="text-gray-500">🔽</span>
                    <select class="border border-gray-300 rounded-md px-3 py-2 text-sm">
                        <option>All Categories</option>
                        <option>AI Assistants</option>
                        <option>Version Control</option>
                        <option>Communication</option>
                        <option>Project Management</option>
                        <option>Development Tools</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Statistics -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div class="bg-white p-4 rounded-lg border">
                <div class="text-2xl font-bold text-gray-900">12</div>
                <div class="text-sm text-gray-600">Total Integrations</div>
            </div>
            <div class="bg-white p-4 rounded-lg border">
                <div class="text-2xl font-bold text-green-600">8</div>
                <div class="text-sm text-gray-600">Active</div>
            </div>
            <div class="bg-white p-4 rounded-lg border">
                <div class="text-2xl font-bold text-green-600">7</div>
                <div class="text-sm text-gray-600">Healthy</div>
            </div>
            <div class="bg-white p-4 rounded-lg border">
                <div class="text-2xl font-bold text-red-600">1</div>
                <div class="text-sm text-gray-600">Errors</div>
            </div>
        </div>

        <!-- AI Assistants Category -->
        <div class="mb-8">
            <div class="flex items-center space-x-2 mb-4">
                <h2 class="text-lg font-semibold text-gray-900">AI Assistants</h2>
                <span class="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">4</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <!-- Claude Integration -->
                <div class="integration-card bg-white p-4 rounded-lg border hover:shadow-lg">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="text-2xl">🤖</div>
                            <div>
                                <h3 class="font-semibold text-sm">Claude Assistant</h3>
                                <p class="text-xs text-gray-600">Claude</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="health-indicator health-healthy"></div>
                            <div class="w-8 h-4 bg-blue-600 rounded-full relative">
                                <div class="absolute top-0.5 right-0.5 w-3 h-3 bg-white rounded-full"></div>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between">
                            <span class="text-gray-500">Status</span>
                            <span class="bg-green-100 text-green-800 px-2 py-0.5 rounded">Active</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Health</span>
                            <span class="text-green-600">Healthy</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Last Check</span>
                            <span class="text-gray-500">2 minutes ago</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 mt-4">
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🧪 Test</button>
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🔄 Sync</button>
                        <button class="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">⋯</button>
                    </div>
                </div>

                <!-- Amp Integration -->
                <div class="integration-card bg-white p-4 rounded-lg border hover:shadow-lg">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="text-2xl">⚡</div>
                            <div>
                                <h3 class="font-semibold text-sm">Amp Assistant</h3>
                                <p class="text-xs text-gray-600">Amp</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="health-indicator health-healthy"></div>
                            <div class="w-8 h-4 bg-blue-600 rounded-full relative">
                                <div class="absolute top-0.5 right-0.5 w-3 h-3 bg-white rounded-full"></div>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between">
                            <span class="text-gray-500">Status</span>
                            <span class="bg-green-100 text-green-800 px-2 py-0.5 rounded">Active</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Health</span>
                            <span class="text-green-600">Healthy</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Last Check</span>
                            <span class="text-gray-500">5 minutes ago</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 mt-4">
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🧪 Test</button>
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🔄 Sync</button>
                        <button class="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">⋯</button>
                    </div>
                </div>

                <!-- Gemini Integration -->
                <div class="integration-card bg-white p-4 rounded-lg border hover:shadow-lg">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="text-2xl">♊</div>
                            <div>
                                <h3 class="font-semibold text-sm">Gemini Assistant</h3>
                                <p class="text-xs text-gray-600">Gemini</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="health-indicator health-warning"></div>
                            <div class="w-8 h-4 bg-gray-300 rounded-full relative">
                                <div class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full"></div>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between">
                            <span class="text-gray-500">Status</span>
                            <span class="bg-gray-100 text-gray-800 px-2 py-0.5 rounded">Inactive</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Health</span>
                            <span class="text-yellow-600">Warning</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Last Check</span>
                            <span class="text-gray-500">1 hour ago</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 mt-4">
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🧪 Test</button>
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🔄 Sync</button>
                        <button class="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">⋯</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Version Control Category -->
        <div class="mb-8">
            <div class="flex items-center space-x-2 mb-4">
                <h2 class="text-lg font-semibold text-gray-900">Version Control</h2>
                <span class="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">2</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <!-- GitHub Integration -->
                <div class="integration-card bg-white p-4 rounded-lg border hover:shadow-lg">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="text-2xl">🐙</div>
                            <div>
                                <h3 class="font-semibold text-sm">GitHub Integration</h3>
                                <p class="text-xs text-gray-600">GitHub</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="health-indicator health-healthy"></div>
                            <div class="w-8 h-4 bg-blue-600 rounded-full relative">
                                <div class="absolute top-0.5 right-0.5 w-3 h-3 bg-white rounded-full"></div>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between">
                            <span class="text-gray-500">Status</span>
                            <span class="bg-green-100 text-green-800 px-2 py-0.5 rounded">Active</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Health</span>
                            <span class="text-green-600">Healthy</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Last Sync</span>
                            <span class="text-gray-500">10 minutes ago</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 mt-4">
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🧪 Test</button>
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🔄 Sync</button>
                        <button class="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">⋯</button>
                    </div>
                </div>

                <!-- GitLab Integration -->
                <div class="integration-card bg-white p-4 rounded-lg border hover:shadow-lg">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="text-2xl">🦊</div>
                            <div>
                                <h3 class="font-semibold text-sm">GitLab Integration</h3>
                                <p class="text-xs text-gray-600">GitLab</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="health-indicator health-error"></div>
                            <div class="w-8 h-4 bg-gray-300 rounded-full relative">
                                <div class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full"></div>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between">
                            <span class="text-gray-500">Status</span>
                            <span class="bg-gray-100 text-gray-800 px-2 py-0.5 rounded">Inactive</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Health</span>
                            <span class="text-red-600">Error</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Last Check</span>
                            <span class="text-gray-500">2 hours ago</span>
                        </div>
                    </div>
                    <div class="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800 mb-2">
                        Authentication failed: Invalid API token
                    </div>
                    <div class="flex items-center space-x-2 mt-4">
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🧪 Test</button>
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🔄 Sync</button>
                        <button class="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">⋯</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Communication Category -->
        <div class="mb-8">
            <div class="flex items-center space-x-2 mb-4">
                <h2 class="text-lg font-semibold text-gray-900">Communication</h2>
                <span class="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">3</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <!-- Slack Integration -->
                <div class="integration-card bg-white p-4 rounded-lg border hover:shadow-lg">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="text-2xl">💬</div>
                            <div>
                                <h3 class="font-semibold text-sm">Slack Workspace</h3>
                                <p class="text-xs text-gray-600">Slack</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="health-indicator health-healthy"></div>
                            <div class="w-8 h-4 bg-blue-600 rounded-full relative">
                                <div class="absolute top-0.5 right-0.5 w-3 h-3 bg-white rounded-full"></div>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between">
                            <span class="text-gray-500">Status</span>
                            <span class="bg-green-100 text-green-800 px-2 py-0.5 rounded">Active</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Health</span>
                            <span class="text-green-600">Healthy</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Last Sync</span>
                            <span class="text-gray-500">1 minute ago</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 mt-4">
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🧪 Test</button>
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🔄 Sync</button>
                        <button class="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">⋯</button>
                    </div>
                </div>

                <!-- Discord Integration -->
                <div class="integration-card bg-white p-4 rounded-lg border hover:shadow-lg">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="text-2xl">🎮</div>
                            <div>
                                <h3 class="font-semibold text-sm">Discord Server</h3>
                                <p class="text-xs text-gray-600">Discord</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="health-indicator health-healthy"></div>
                            <div class="w-8 h-4 bg-blue-600 rounded-full relative">
                                <div class="absolute top-0.5 right-0.5 w-3 h-3 bg-white rounded-full"></div>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between">
                            <span class="text-gray-500">Status</span>
                            <span class="bg-green-100 text-green-800 px-2 py-0.5 rounded">Active</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Health</span>
                            <span class="text-green-600">Healthy</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Last Check</span>
                            <span class="text-gray-500">30 seconds ago</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 mt-4">
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🧪 Test</button>
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🔄 Sync</button>
                        <button class="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">⋯</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Project Management Category -->
        <div class="mb-8">
            <div class="flex items-center space-x-2 mb-4">
                <h2 class="text-lg font-semibold text-gray-900">Project Management</h2>
                <span class="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">3</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <!-- Jira Integration -->
                <div class="integration-card bg-white p-4 rounded-lg border hover:shadow-lg">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="text-2xl">📋</div>
                            <div>
                                <h3 class="font-semibold text-sm">Jira Cloud</h3>
                                <p class="text-xs text-gray-600">Jira</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="health-indicator health-healthy"></div>
                            <div class="w-8 h-4 bg-blue-600 rounded-full relative">
                                <div class="absolute top-0.5 right-0.5 w-3 h-3 bg-white rounded-full"></div>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between">
                            <span class="text-gray-500">Status</span>
                            <span class="bg-green-100 text-green-800 px-2 py-0.5 rounded">Active</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Health</span>
                            <span class="text-green-600">Healthy</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Last Sync</span>
                            <span class="text-gray-500">15 minutes ago</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 mt-4">
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🧪 Test</button>
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🔄 Sync</button>
                        <button class="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">⋯</button>
                    </div>
                </div>

                <!-- Linear Integration -->
                <div class="integration-card bg-white p-4 rounded-lg border hover:shadow-lg">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="text-2xl">📐</div>
                            <div>
                                <h3 class="font-semibold text-sm">Linear Workspace</h3>
                                <p class="text-xs text-gray-600">Linear</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="health-indicator health-healthy"></div>
                            <div class="w-8 h-4 bg-blue-600 rounded-full relative">
                                <div class="absolute top-0.5 right-0.5 w-3 h-3 bg-white rounded-full"></div>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between">
                            <span class="text-gray-500">Status</span>
                            <span class="bg-green-100 text-green-800 px-2 py-0.5 rounded">Active</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Health</span>
                            <span class="text-green-600">Healthy</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Last Sync</span>
                            <span class="text-gray-500">3 minutes ago</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 mt-4">
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🧪 Test</button>
                        <button class="flex-1 px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">🔄 Sync</button>
                        <button class="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">⋯</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;

    // Write the demo HTML to a temporary file
    const demoPath = path.join(screenshotsDir, 'integrations-demo.html');
    fs.writeFileSync(demoPath, demoHTML);

    console.log('📄 Loading demo page...');
    await page.goto(`file://${demoPath}`);
    await page.waitForTimeout(1000);

    // Take full page screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-integrations-overview.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Full integrations overview');

    // Take header section screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '02-integrations-header.png'),
      clip: { x: 0, y: 0, width: 1920, height: 300 }
    });
    console.log('✅ Screenshot: Header section');

    // Take statistics section screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '03-statistics-cards.png'),
      clip: { x: 0, y: 300, width: 1920, height: 200 }
    });
    console.log('✅ Screenshot: Statistics cards');

    // Take AI assistants section screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '04-ai-assistants.png'),
      clip: { x: 0, y: 500, width: 1920, height: 400 }
    });
    console.log('✅ Screenshot: AI assistants section');

    // Hover over Claude card to show interaction
    await page.hover('.integration-card:first-of-type');
    await page.waitForTimeout(300);
    await page.screenshot({ 
      path: path.join(screenshotsDir, '05-integration-card-hover.png'),
      clip: { x: 0, y: 500, width: 650, height: 300 }
    });
    console.log('✅ Screenshot: Integration card hover effect');

    // Take version control section screenshot  
    await page.screenshot({ 
      path: path.join(screenshotsDir, '06-version-control.png'),
      clip: { x: 0, y: 900, width: 1920, height: 400 }
    });
    console.log('✅ Screenshot: Version control section');

    // Take communication section screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '07-communication.png'),
      clip: { x: 0, y: 1300, width: 1920, height: 400 }
    });
    console.log('✅ Screenshot: Communication section');

    // Take project management section screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '08-project-management.png'),
      clip: { x: 0, y: 1700, width: 1920, height: 400 }
    });
    console.log('✅ Screenshot: Project management section');

    // Create a mobile view
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({ 
      path: path.join(screenshotsDir, '09-mobile-view.png'),
      fullPage: true 
    });
    console.log('✅ Screenshot: Mobile responsive view');

    console.log('🎉 Demo screenshots completed successfully!');
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
  createIntegrationsDemo().catch(console.error);
}

module.exports = { createIntegrationsDemo };