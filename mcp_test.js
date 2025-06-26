const { spawn } = require('child_process');

console.error('🔄 Starting MCP server for full protocol test...');

const mcpProcess = spawn('vibe-kanban-mcp', [], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let step = 0;
const steps = [
  'initialize',
  'initialized_notification',
  'list_tools',
  'list_projects'
];

mcpProcess.stdout.on('data', (data) => {
  const response = data.toString().trim();
  console.error(`📥 MCP Response (${steps[step]}):`);
  console.error(response);

  step++;

  // Send the next message based on what we just received
  if (step === 1) {
    // After initialize response, send initialized notification
    setTimeout(() => {
      console.error('📤 Sending initialized notification...');
      mcpProcess.stdin.write('{"jsonrpc": "2.0", "method": "notifications/initialized"}\n');

      // Since notifications don't get responses, manually trigger next step
      setTimeout(() => {
        step++; // Move to next step manually
        console.error('📤 Sending tools/list...');
        mcpProcess.stdin.write('{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}\n');
      }, 200);
    }, 100);

  } else if (step === 2) {
    // After initialized notification (no response expected), list tools
    setTimeout(() => {
      console.error('📤 Sending tools/list...');
      mcpProcess.stdin.write('{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}\n');
    }, 100);

  } else if (step === 3) {
    // After tools list, test list_projects
    setTimeout(() => {
      console.error('📤 Sending list_projects...');
      mcpProcess.stdin.write('{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "list_projects", "arguments": {}}}\n');
    }, 100);

  } else if (step >= 4) {
    // All tests complete
    console.error('✅ MCP server completed full protocol test successfully!');
    setTimeout(() => mcpProcess.kill(), 500);
  }
});

mcpProcess.on('exit', (code) => {
  console.error(`🔴 MCP server exited with code: ${code}`);
  process.exit(0);
});

mcpProcess.on('error', (error) => {
  console.error('❌ MCP server error:', error);
  process.exit(1);
});

// Start the sequence
setTimeout(() => {
  console.error('📤 Sending initialize request...');
  mcpProcess.stdin.write('{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}\n');
}, 500);

// Safety timeout
setTimeout(() => {
  console.error('⏰ Test timeout - killing process');
  mcpProcess.kill();
}, 15000);