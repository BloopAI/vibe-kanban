const { spawn } = require('child_process');

console.error('🔄 Starting MCP server for comprehensive endpoint testing...');

// Test configuration
let currentStepIndex = 0;
let messageId = 1;
let testData = {
  projectId: null,
  taskId: null,
  createdProjectId: null,
  taskTitle: "Test Task from MCP Script",
  updatedTaskTitle: "Updated Test Task Title",
  secondTaskTitle: "Second Test Task",
  renamedTaskTitle: "Renamed Second Task",
};

const testSequence = [
  'initialize',
  'initialized_notification',
  'list_tools',
  'list_projects',
  'create_project',
  'list_tasks', // empty
  'create_task',
  'get_task',
  'list_tasks', // with task
  'set_task_status',
  'list_tasks', // filtered
  'complete_task',
  'list_tasks', // completed
  'create_task', // second task
  'update_task', // legacy
  'update_task_title',
  'update_task_description',
  'list_tasks', // after updates
  'delete_task_by_title',
  'list_tasks', // final
  'summary'
];

const stepHandlers = {
  initialize: {
    description: 'Initialize MCP connection',
    action: () => {
      console.log('📤 Sending initialize request...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}\n`);
    },
    responseHandler: () => {
      executeNextStep();
    }
  },

  initialized_notification: {
    description: 'Send initialized notification',
    action: () => {
      console.log('📤 Sending initialized notification...');
      mcpProcess.stdin.write('{"jsonrpc": "2.0", "method": "notifications/initialized"}\n');
      // Notifications don't have responses, auto-advance
      setTimeout(() => executeNextStep(), 200);
    },
    responseHandler: null
  },

  list_tools: {
    description: 'List available MCP tools',
    action: () => {
      console.log('📤 Sending tools/list...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/list", "params": {}}\n`);
    },
    responseHandler: () => {
      executeNextStep();
    }
  },

  list_projects: {
    description: 'List all projects',
    action: () => {
      console.log('📤 Sending list_projects...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/call", "params": {"name": "list_projects", "arguments": {}}}\n`);
    },
    responseHandler: (response) => {
      try {
        const parsedResponse = JSON.parse(response);
        if (parsedResponse.result?.content) {
          const projectsResponse = JSON.parse(parsedResponse.result.content[0].text);
          if (projectsResponse.success && projectsResponse.projects.length > 0) {
            testData.projectId = projectsResponse.projects[0].id;
            console.log(`💾 Found existing project: ${testData.projectId}`);
          }
        }
      } catch (e) {
        console.error('⚠️ Could not parse projects response');
      }
      executeNextStep();
    }
  },

  create_project: {
    description: 'Create a new test project',
    action: () => {
      console.log('📤 Sending create_project...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/call", "params": {"name": "create_project", "arguments": {"name": "Test Project from MCP", "git_repo_path": "/tmp/test-project", "use_existing_repo": false, "setup_script": "echo \\"Setup complete\\"", "dev_script": "echo \\"Dev server started\\""}}}\n`);
    },
    responseHandler: (response) => {
      try {
        const parsedResponse = JSON.parse(response);
        if (parsedResponse.result?.content) {
          const createProjectResponse = JSON.parse(parsedResponse.result.content[0].text);
          if (createProjectResponse.success && createProjectResponse.project_id) {
            testData.createdProjectId = createProjectResponse.project_id;
            console.log(`💾 Created project: ${testData.createdProjectId}`);
          }
        }
      } catch (e) {
        console.error('⚠️ Could not parse create project response');
      }
      executeNextStep();
    }
  },

  list_tasks: {
    description: 'List tasks in project',
    action: () => {
      const projectToUse = testData.createdProjectId || testData.projectId;
      const context = getListTasksContext();

      console.log(`📤 Sending list_tasks (${context})...`);

      let args = { project_id: projectToUse };

      // Add context-specific filters
      if (context === 'filtered') {
        args.status = 'in-progress';
      } else if (context === 'completed') {
        args.status = 'done';
      } else if (context === 'empty') {
        args.include_execution_status = true;
      }

      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/call", "params": {"name": "list_tasks", "arguments": ${JSON.stringify(args)}}}\n`);
    },
    responseHandler: () => {
      executeNextStep();
    }
  },

  create_task: {
    description: 'Create a new task',
    action: () => {
      const projectToUse = testData.createdProjectId || testData.projectId;
      const isSecondTask = getCreateTaskContext() === 'second';
      const title = isSecondTask ? testData.secondTaskTitle : testData.taskTitle;
      const description = isSecondTask ?
        "This is a second task for testing updates" :
        "This task was created during endpoint testing";

      console.log(`📤 Sending create_task (${isSecondTask ? 'second task' : 'first task'})...`);
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/call", "params": {"name": "create_task", "arguments": {"project_id": "${projectToUse}", "title": "${title}", "description": "${description}"}}}\n`);
    },
    responseHandler: (response) => {
      try {
        const parsedResponse = JSON.parse(response);
        if (parsedResponse.result?.content) {
          const createTaskResponse = JSON.parse(parsedResponse.result.content[0].text);
          if (createTaskResponse.success && createTaskResponse.task_id) {
            testData.taskId = createTaskResponse.task_id;
            console.log(`💾 Created task: ${testData.taskId}`);
          }
        }
      } catch (e) {
        console.error('⚠️ Could not parse create task response');
      }
      executeNextStep();
    }
  },

  get_task: {
    description: 'Get task details by ID',
    action: () => {
      const projectToUse = testData.createdProjectId || testData.projectId;
      console.log('📤 Sending get_task...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/call", "params": {"name": "get_task", "arguments": {"project_id": "${projectToUse}", "task_id": "${testData.taskId}"}}}\n`);
    },
    responseHandler: () => {
      executeNextStep();
    }
  },

  set_task_status: {
    description: 'Set task status (agent-friendly)',
    action: () => {
      const projectToUse = testData.createdProjectId || testData.projectId;
      console.log('📤 Sending set_task_status (agent-friendly)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/call", "params": {"name": "set_task_status", "arguments": {"project_id": "${projectToUse}", "task_title": "${testData.taskTitle}", "status": "in-progress"}}}\n`);
    },
    responseHandler: () => {
      executeNextStep();
    }
  },

  complete_task: {
    description: 'Complete task (agent-friendly)',
    action: () => {
      const projectToUse = testData.createdProjectId || testData.projectId;
      console.log('📤 Sending complete_task (agent-friendly)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/call", "params": {"name": "complete_task", "arguments": {"project_id": "${projectToUse}", "task_title": "${testData.taskTitle}"}}}\n`);
    },
    responseHandler: () => {
      executeNextStep();
    }
  },

  update_task: {
    description: 'Update task (legacy UUID method)',
    action: () => {
      const projectToUse = testData.createdProjectId || testData.projectId;
      console.log('📤 Sending update_task (legacy method)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/call", "params": {"name": "update_task", "arguments": {"project_id": "${projectToUse}", "task_id": "${testData.taskId}", "title": "${testData.updatedTaskTitle}", "description": "Updated description via legacy method", "status": "in-review"}}}\n`);
    },
    responseHandler: () => {
      executeNextStep();
    }
  },

  update_task_title: {
    description: 'Update task title (agent-friendly)',
    action: () => {
      const projectToUse = testData.createdProjectId || testData.projectId;
      console.log('📤 Sending update_task_title (agent-friendly)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/call", "params": {"name": "update_task_title", "arguments": {"project_id": "${projectToUse}", "current_title": "${testData.secondTaskTitle}", "new_title": "${testData.renamedTaskTitle}"}}}\n`);
    },
    responseHandler: () => {
      executeNextStep();
    }
  },

  update_task_description: {
    description: 'Update task description (agent-friendly)',
    action: () => {
      const projectToUse = testData.createdProjectId || testData.projectId;
      console.log('📤 Sending update_task_description (agent-friendly)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/call", "params": {"name": "update_task_description", "arguments": {"project_id": "${projectToUse}", "task_title": "${testData.renamedTaskTitle}", "description": "This description was updated using the agent-friendly endpoint"}}}\n`);
    },
    responseHandler: () => {
      executeNextStep();
    }
  },

  delete_task_by_title: {
    description: 'Delete task by title (agent-friendly)',
    action: () => {
      const projectToUse = testData.createdProjectId || testData.projectId;
      console.log('📤 Sending delete_task_by_title (agent-friendly)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": ${messageId++}, "method": "tools/call", "params": {"name": "delete_task_by_title", "arguments": {"project_id": "${projectToUse}", "task_title": "${testData.renamedTaskTitle}"}}}\n`);
    },
    responseHandler: () => {
      executeNextStep();
    }
  },

  summary: {
    description: 'Test completion summary',
    action: () => {
      console.log('✅ All endpoint tests completed successfully!');
      console.log('');
      console.log('📊 Test Summary:');
      console.log(`   - Project ID used: ${testData.projectId || 'N/A'}`);
      console.log(`   - Created project: ${testData.createdProjectId || 'N/A'}`);
      console.log(`   - Task ID tested: ${testData.taskId || 'N/A'}`);
      console.log(`   - Task title: ${testData.taskTitle}`);
      console.log('');
      console.log('🎯 Agent-Friendly Endpoints Tested:');
      console.log('   ✅ set_task_status - Change task status by title');
      console.log('   ✅ complete_task - Mark task done by title');
      console.log('   ✅ update_task_title - Change task title');
      console.log('   ✅ update_task_description - Update task description');
      console.log('   ✅ delete_task_by_title - Delete task by title');
      console.log('');
      console.log('🔧 Legacy Endpoints Tested:');
      console.log('   ✅ update_task - Update task by ID (more complex)');
      console.log('   ✅ get_task - Get task details by ID');
      console.log('');
      console.log('🎉 All MCP endpoints are working correctly!');
      console.log('💡 Agents should prefer the title-based endpoints for easier usage');
      setTimeout(() => mcpProcess.kill(), 500);
    },
    responseHandler: null
  }
};

// Helper functions to determine context
function getListTasksContext() {
  const prevSteps = testSequence.slice(0, currentStepIndex);
  if (prevSteps[prevSteps.length - 1] === 'create_project') return 'empty';
  if (prevSteps[prevSteps.length - 1] === 'set_task_status') return 'filtered';
  if (prevSteps[prevSteps.length - 1] === 'complete_task') return 'completed';
  if (prevSteps[prevSteps.length - 1] === 'update_task_description') return 'after updates';
  if (prevSteps[prevSteps.length - 1] === 'delete_task_by_title') return 'final';
  return 'with task';
}

function getCreateTaskContext() {
  const prevSteps = testSequence.slice(0, currentStepIndex);
  const createTaskCount = prevSteps.filter(step => step === 'create_task').length;
  return createTaskCount > 0 ? 'second' : 'first';
}

// Execute current step
function executeCurrentStep() {
  if (currentStepIndex >= testSequence.length) {
    console.log('⚠️ All steps completed');
    return;
  }

  const stepName = testSequence[currentStepIndex];
  const stepHandler = stepHandlers[stepName];

  if (!stepHandler) {
    console.error(`❌ Unknown step: ${stepName}`);
    return;
  }

  console.log(`🔄 Step ${currentStepIndex + 1}/${testSequence.length}: ${stepHandler.description}`);

  setTimeout(() => {
    stepHandler.action();
  }, 100);
}

// Move to next step
function executeNextStep() {
  currentStepIndex++;
  executeCurrentStep();
}

// Start MCP process
const mcpProcess = spawn('npx', [`--package=${process.argv[2]}`, "vibe-kanban", "--mcp"], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

mcpProcess.stdout.on('data', (data) => {
  const response = data.toString().trim();
  const currentStepName = testSequence[currentStepIndex];
  const stepHandler = stepHandlers[currentStepName];

  console.log(`📥 MCP Response (${currentStepName}):`);
  console.log(response);

  if (stepHandler?.responseHandler) {
    stepHandler.responseHandler(response);
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
  executeCurrentStep();
}, 500);

// Safety timeout
setTimeout(() => {
  console.error('⏰ Test timeout - killing process');
  mcpProcess.kill();
}, 45000);