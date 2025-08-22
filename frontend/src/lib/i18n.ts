// Internationalization system - only translate settings-related text
export type Language = 'en' | 'zh-TW';

// Language labels
export const LANGUAGE_LABELS: Record<Language, string> = {
  'en': 'English',
  'zh-TW': '繁體中文',
};

// Translation dictionary
const translations = {
  en: {
    // Navigation
    nav: {
      projects: 'Projects',
      mcpServers: 'MCP Servers',
      settings: 'Settings',
      docs: 'Docs',
      support: 'Support',
    },
    
    // Settings page
    settings: {
      title: 'Settings',
      subtitle: 'Configure your preferences and application settings.',
      loading: 'Loading settings...',
      failed: 'Failed to load settings.',
      saved: '✓ Settings saved successfully!',
      save: 'Save Settings',
      saving: 'Settings Saved!',
      
      // Appearance settings
      appearance: {
        title: 'Appearance',
        subtitle: 'Customize how the application looks and feels.',
        theme: 'Theme',
        themePlaceholder: 'Select theme',
        themeDescription: 'Choose your preferred color scheme.',
        themes: {
          light: 'Light',
          dark: 'Dark',
          system: 'System',
          purple: 'Purple',
          green: 'Green',
          blue: 'Blue',
          orange: 'Orange',
          red: 'Red',
        },
      },
      
      // Language settings
      language: {
        title: 'Language',
        subtitle: 'Select your preferred language for the interface.',
        language: 'Interface Language',
        languagePlaceholder: 'Select language',
        languageDescription: 'Choose your preferred language for the user interface.',
      },
      
      // Task execution settings
      taskExecution: {
        title: 'Task Execution',
        subtitle: 'Configure how tasks are executed and processed.',
        executor: 'Default Executor',
        executorPlaceholder: 'Select executor',
        executorDescription: 'Choose the default executor for running tasks.',
      },
      
      // Editor settings
      editor: {
        title: 'Editor',
        subtitle: 'Configure which editor to open when viewing task attempts.',
        editor: 'Preferred Editor',
        editorPlaceholder: 'Select editor',
        editorDescription: 'Choose your preferred code editor for opening task attempts.',
        customCommand: 'Custom Command',
        customCommandPlaceholder: 'e.g., code, subl, vim',
        customCommandDescription: 'Enter the command to run your custom editor. Use spaces for arguments (e.g., "code --wait").',
      },
      
      // GitHub integration
      github: {
        title: 'GitHub Integration',
        subtitle: 'Configure GitHub settings for creating pull requests from task attempts.',
        token: 'Personal Access Token',
        tokenPlaceholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
        tokenDescription: 'GitHub Personal Access Token with \'repo\' permissions. Required for creating pull requests.',
        createToken: 'Create token here',
        signedInAs: 'Signed in as',
        logOut: 'Log out',
        signIn: 'Sign in with GitHub',
        defaultPrBase: 'Default PR Base Branch',
        defaultPrBasePlaceholder: 'main',
        defaultPrBaseDescription: 'Default base branch for pull requests. Defaults to \'main\' if not specified.',
      },
      
      // Notification settings
      notifications: {
        title: 'Notifications',
        subtitle: 'Configure how you receive notifications about task completion.',
        soundAlerts: 'Sound Alerts',
        soundAlertsDescription: 'Play a sound when task attempts finish running.',
        sound: 'Sound',
        soundPlaceholder: 'Select sound',
        soundDescription: 'Choose the sound to play when tasks complete. Click the volume button to preview.',
        pushNotifications: 'Push Notifications',
        pushNotificationsDescription: 'Show system notifications when task attempts finish running.',
      },
      
      // Privacy settings
      privacy: {
        title: 'Privacy',
        subtitle: 'Help improve Vibe-Kanban by sharing anonymous usage data.',
        enableTelemetry: 'Enable Usage Analytics',
        telemetryDescription: 'Enables anonymous usage events tracking to help improve the application. No prompts or project information are collected.',
      },
      
      // Task templates
      taskTemplates: {
        title: 'Task Templates',
        subtitle: 'Manage global task templates that can be used across all projects.',
      },
      
      // Security and disclaimer
      safety: {
        title: 'Safety & Disclaimers',
        subtitle: 'Manage safety warnings and acknowledgments.',
        disclaimerStatus: 'Disclaimer Status',
        disclaimerAcknowledged: 'You have acknowledged the safety disclaimer.',
        disclaimerNotAcknowledged: 'The safety disclaimer has not been acknowledged.',
        resetDisclaimer: 'Reset Disclaimer',
        resetDisclaimerDescription: 'Resetting the disclaimer will require you to acknowledge the safety warning again.',
        onboardingStatus: 'Onboarding Status',
        onboardingCompleted: 'You have completed the onboarding process.',
        onboardingNotCompleted: 'The onboarding process has not been completed.',
        resetOnboarding: 'Reset Onboarding',
        resetOnboardingDescription: 'Resetting the onboarding will show the setup screen again.',
        telemetryAcknowledgment: 'Usage Analytics Acknowledgment',
        telemetryAcknowledged: 'You have acknowledged the usage analytics notice.',
        telemetryNotAcknowledged: 'The usage analytics notice has not been acknowledged.',
        resetAcknowledgment: 'Reset Acknowledgment',
        resetAcknowledgmentDescription: 'Resetting the acknowledgment will require you to acknowledge the usage analytics notice again.',
      },
    },
    
    // Project management
    projects: {
      title: 'Projects',
      subtitle: 'Manage your projects and track their progress',
      create: 'Create Project',
      createFirst: 'Create your first project',
      noProjects: 'No projects yet',
      noProjectsDescription: 'Get started by creating your first project.',
      loading: 'Loading projects...',
      failed: 'Failed to fetch projects',
      
      // Project form
      form: {
        title: 'Create Project',
        editTitle: 'Edit Project',
        name: 'Project Name',
        namePlaceholder: 'Enter project name',
        gitRepo: 'Git Repository',
        gitRepoPlaceholder: '/path/to/your/project',
        useExisting: 'Use existing repository',
        setupScript: 'Setup Script',
        setupScriptPlaceholder: 'npm install',
        devScript: 'Development Script',
        devScriptPlaceholder: 'npm run dev',
        cleanupScript: 'Cleanup Script',
        cleanupScriptPlaceholder: 'npm run clean',
        cancel: 'Cancel',
        create: 'Create Project',
        update: 'Update Project',
        creating: 'Creating...',
        updating: 'Updating...',
        saving: 'Saving...',
        saveChanges: 'Save Changes',
        editDescription: 'Make changes to your project here. Click save when you\'re done.',
      },
      
      // Project card
      card: {
        edit: 'Edit',
        delete: 'Delete',
        confirmDelete: 'Are you sure you want to delete this project? This action cannot be undone.',
        tasks: 'tasks',
        viewTasks: 'View Tasks',
        openInIDE: 'Open in IDE',
        created: 'Created',
        active: 'Active',
      },
    },
    
    // Task management
    tasks: {
      title: 'Tasks',
      subtitle: 'Manage and track your project tasks',
      create: 'Create Task',
      createFirst: 'Create your first task',
      noTasks: 'No tasks yet',
      noTasksDescription: 'Get started by creating your first task.',
      loading: 'Loading tasks...',
      failed: 'Failed to fetch tasks',
      
      // Task page
      addTask: 'Add Task',
      searchTasks: 'Search tasks...',
      openInIDE: 'Open in IDE',
      projectSettings: 'Project Settings',
      manageTemplates: 'Manage Templates',
      projectTemplates: 'Project Templates',
      globalTemplates: 'Global Templates',
      noTasksFound: 'No tasks found for this project.',
      createFirstTask: 'Create First Task',
      done: 'Done',
      
      // Error messages
      failedCreateTask: 'Failed to create task',
      failedCreateAndStartTask: 'Failed to create and start task',
      failedUpdateTask: 'Failed to update task',
      failedDeleteTask: 'Failed to delete task',
      failedUpdateStatus: 'Failed to update task status',
      failedOpenIDE: 'Failed to open project in IDE',
      failedLoadProject: 'Failed to load project',
      failedLoadTasks: 'Failed to load tasks',
      
      // Task status
      status: {
        todo: 'To Do',
        inprogress: 'In Progress',
        inreview: 'In Review',
        done: 'Done',
        cancelled: 'Cancelled',
      },
      
      // Task form
      form: {
        title: 'Create Task',
        editTitle: 'Edit Task',
        taskTitle: 'Task Title',
        titlePlaceholder: 'Enter task title',
        description: 'Description',
        descriptionPlaceholder: 'Enter task description...',
        executor: 'Executor',
        executorPlaceholder: 'Select executor',
        status: 'Status',
        statusPlaceholder: 'Select status',
        cancel: 'Cancel',
        create: 'Create Task',
        update: 'Update Task',
        createAndStart: 'Create & Start',
        creating: 'Creating...',
        updating: 'Updating...',
        starting: 'Starting...',
        
        // Task form dialog
        createNewTask: 'Create New Task',
        editTask: 'Edit Task',
        titleLabel: 'Title',
        titlePlaceholderForm: 'What needs to be done?',
        descriptionLabel: 'Description',
        descriptionPlaceholderForm: 'Add more details (optional). Type @ to search files.',
        statusLabel: 'Status',
        useTemplate: 'Use a template',
        templateHelp: 'Templates help you quickly create tasks with predefined content.',
        chooseTemplate: 'Choose a template to prefill this form',
        noTemplate: 'No template',
        
        // Plan related
        planRequired: 'Plan Required',
        planRequiredMessage: 'No plan was generated in the last execution attempt. Task creation is disabled until a plan is available. Please generate a plan first.',
        planRequiredTooltip: 'Plan required before creating task',
        planRequiredStartTooltip: 'Plan required before creating and starting task',
        
        // Button text
        updateTask: 'Update Task',
        createTask: 'Create Task',
        createAndStartTask: 'Create & Start',
        creatingTask: 'Creating...',
        updatingTask: 'Updating...',
        creatingAndStarting: 'Creating & Starting...',
      },
      
      // Task operations
      actions: {
        start: 'Start',
        edit: 'Edit',
        delete: 'Delete',
        viewDetails: 'View Details',
        createPR: 'Create PR',
        openEditor: 'Open in Editor',
        confirmDelete: 'Are you sure you want to delete this task? This action cannot be undone.',
      },
    },
    
    // Common UI
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
      update: 'Update',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      confirm: 'Confirm',
      close: 'Close',
      back: 'Back',
      next: 'Next',
      previous: 'Previous',
      search: 'Search',
      filter: 'Filter',
      sort: 'Sort',
      refresh: 'Refresh',
      yes: 'Yes',
      no: 'No',
      general: 'General',
    },
    
    // Privacy choice dialog
    privacyOptIn: {
      title: 'Feedback Opt-In',
      description: 'Help us improve Vibe Kanban by sharing usage data and allowing us to contact you if needed.',
      whatDataCollect: 'What data do we collect?',
      githubProfile: 'GitHub profile information',
      githubProfileDesc: 'Username and email address to send you only very important updates about the project. We promise not to abuse this',
      usageMetrics: 'High-level usage metrics',
      usageMetricsDesc: 'Number of tasks created, projects managed, feature usage',
      performanceData: 'Performance and error data',
      performanceDataDesc: 'Application crashes, response times, technical issues',
      doNotCollect: 'We do NOT collect',
      doNotCollectDesc: 'Task contents, code snippets, project names, or other personal data',
      settingsNote: 'This helps us prioritize improvements. You can change this preference anytime in Settings.',
      noThanks: 'No thanks',
      yesHelp: 'Yes, help improve Vibe Kanban',
    },
    
    // Task details
    taskDetails: {
      title: 'Task Details',
      editTask: 'Edit task',
      deleteTask: 'Delete task',
      closePanel: 'Close panel',
      showMore: 'Show more',
      showLess: 'Show less',
      noDescription: 'No description provided',
      tabs: {
        logs: 'Logs',
        plans: 'Plans',
        diffs: 'Diffs',
        relatedTasks: 'Related Tasks',
        processes: 'Processes',
      },
      processes: {
        noProcesses: 'No execution processes found for this attempt.',
        args: 'Args',
        exit: 'Exit',
        started: 'Started',
        completed: 'Completed',
        workingDirectory: 'Working directory',
        processDetails: 'Process Details',
        backToList: 'Back to list',
        processInfo: 'Process Info',
        type: 'Type',
        status: 'Status',
        executor: 'Executor',
        exitCode: 'Exit Code',
        timing: 'Timing',
        command: 'Command',
        stdout: 'Stdout',
        stderr: 'Stderr',
        loadingDetails: 'Loading process details...',
        failedToLoad: 'Failed to load process details. Please try again.',
      },
    },
    
    // Security warning dialog
    disclaimer: {
      title: 'Important Safety Warning',
      pleaseRead: 'Please read and acknowledge the following before proceeding:',
      fullAccess: 'Coding agents have full access to your computer',
      executeCommands: 'and can execute any terminal commands, including:',
      risks: {
        software: 'Installing, modifying, or deleting software',
        files: 'Accessing, creating, or removing files and directories',
        network: 'Making network requests and connections',
        system: 'Running system-level commands with your permissions',
      },
      experimental: 'This software is experimental and may cause catastrophic damage',
      acknowledgeUsage: 'to your system, data, or projects. By using this software, you acknowledge that:',
      acknowledgeItems: {
        ownRisk: 'You use this software entirely at your own risk',
        noResponsibility: 'The developers are not responsible for any damage, data loss, or security issues',
        backups: 'You should have proper backups of important data before using this software',
        consequences: 'You understand the potential consequences of granting unrestricted system access',
      },
      checkboxLabel: 'I understand and acknowledge the risks described above. I am aware that coding agents have full access to my computer and may cause catastrophic damage.',
      acceptButton: 'I Accept the Risks and Want to Proceed',
    },
    
    // Welcome setup dialog
    onboarding: {
      title: 'Welcome to Vibe Kanban',
      description: "Let's set up your coding preferences. You can always change these later in Settings.",
      codingAgent: {
        title: 'Choose Your Coding Agent',
        label: 'Default Executor',
        placeholder: 'Select your preferred coding agent',
        descriptions: {
          claude: 'Claude Code from Anthropic',
          amp: 'From Sourcegraph',
          gemini: 'Google Gemini from Bloop',
          charmOpencode: 'Charm/Opencode AI assistant',
          claudeCodeRouter: 'Claude Code Router',
          echo: 'This is just for debugging vibe-kanban itself',
        },
      },
      codeEditor: {
        title: 'Choose Your Code Editor',
        label: 'Preferred Editor',
        placeholder: 'Select your preferred editor',
        description: 'This editor will be used to open task attempts and project files.',
        customCommand: 'Custom Command',
        customPlaceholder: 'e.g., code, subl, vim',
        customDescription: 'Enter the command to run your custom editor. Use spaces for arguments (e.g., "code --wait").',
      },
      continueButton: 'Continue',
    },
    
    // Task template manager
    templateManager: {
      title: 'Task Templates',
      globalTemplates: 'Global Task Templates',
      projectTemplates: 'Project Task Templates',
      addTemplate: 'Add Template',
      noTemplates: 'No templates yet. Create your first template to get started.',
      editTemplate: 'Edit Template',
      createTemplate: 'Create Template',
      deleteTemplate: 'Delete template',
      confirmDelete: 'Are you sure you want to delete the template "{templateName}"?',
      table: {
        templateName: 'Template Name',
        title: 'Title',
        description: 'Description',
        actions: 'Actions',
      },
      form: {
        templateName: 'Template Name',
        templateNamePlaceholder: 'e.g., Bug Fix, Feature Request',
        defaultTitle: 'Default Title',
        defaultTitlePlaceholder: 'e.g., Fix bug in...',
        defaultDescription: 'Default Description',
        defaultDescriptionPlaceholder: 'Enter a default description for tasks created with this template',
      },
      errors: {
        nameAndTitleRequired: 'Template name and title are required',
        failedToSave: 'Failed to save template',
      },
    },
    
    // MCP server configuration
    mcpServers: {
      title: 'MCP Servers',
      subtitle: 'Configure MCP servers to extend executor capabilities.',
      successMessage: '✓ MCP configuration saved successfully!',
      
      configuration: {
        title: 'Configuration',
        description: 'Configure MCP servers for different executors to extend their capabilities with custom tools and resources.',
        label: 'MCP Server Configuration',
        placeholder: '{\n  "server-name": {\n    "type": "stdio",\n    "command": "your-command",\n    "args": ["arg1", "arg2"]\n  }\n}',
        loadingPlaceholder: 'Loading current configuration...',
        loading: 'Loading...',
        loadingText: 'Loading current MCP server configuration...',
        saveLocation: 'Changes will be saved to:',
      },
      
      executor: {
        label: 'Executor',
        placeholder: 'Select executor',
        description: 'Choose which executor to configure MCP servers for.',
      },
      
      notSupported: {
        title: 'MCP Not Supported',
        description: 'To use MCP servers, please select a different executor (Claude, Amp, or Gemini) above.',
      },
      
      addVibeKanban: {
        button: 'Add Vibe-Kanban MCP',
        description: 'Automatically adds the Vibe-Kanban MCP server.',
      },
      
      saveButton: {
        save: 'Save Settings',
        saved: 'Settings Saved!',
      },
      
      errors: {
        failedToLoadConfiguration: 'Failed to load configuration.',
        configurationError: 'MCP Configuration Error: {error}',
        ampConfiguration: 'AMP configuration must contain an "amp.mcpServers" object',
        mcpConfiguration: 'Configuration must contain an "mcp" object',
        mcpServersConfiguration: 'Configuration must contain an "mcpServers" object',
        invalidJson: 'Invalid JSON format',
        failedToConfigure: 'Failed to configure vibe-kanban MCP server',
        failedToSave: 'Failed to save MCP servers',
        failedToApply: 'Failed to apply MCP server configuration',
      },
    },
    
    // Task attempts and execution
    taskAttempt: {
      started: 'Started',
      agent: 'Agent',
      echo: 'Echo',
      baseBranch: 'Base Branch',
      main: 'main',
      mergeStatus: 'Merge Status',
      notMerged: 'Not merged',
      worktreePath: 'Worktree Path',
      openInVSCode: 'Open in Visual Studio Code',
      devServer: 'Dev Server',
      createPR: 'Create PR',
      merge: 'Merge',
      newAttempt: 'New Attempt',
      createAttempt: 'Create Attempt',
      attemptDescription: 'Each time you start an attempt, a new session is initiated with your selected coding agent, and a git worktree and corresponding task branch are created.',
      codingAgent: 'Coding agent',
      start: 'Start',
    },
    
    // Create attempt related translations
    createAttempt: {
      started: 'Started',
      agent: 'Agent',
      baseBranch: 'Base Branch',
      changeBaseBranch: 'Change base branch',
      planStatus: 'Plan Status',
      mergeStatus: 'Merge Status',
      taskCreated: 'Task Created',
      draft: 'Draft',
      merged: 'Merged',
      notMerged: 'Not merged',
      worktreePath: 'Worktree Path',
      openInEditor: 'Open in {editor}',
      copied: 'Copied!',
      clickToCopyPath: 'Click to copy worktree path',
      stopDev: 'Stop Dev',
      devServer: 'Dev Server',
      addDevScriptToEnable: 'Add a dev server script in project settings to enable this feature',
      devServerLogs: 'Dev Server Logs (Last 10 lines):',
      stopRunningDevServer: 'Stop the running dev server',
      startDevServer: 'Start the dev server',
      history: 'History',
      viewAttemptHistory: 'View attempt history',
      rebasing: 'Rebasing...',
      rebase: 'Rebase',
      approving: 'Approving...',
      createTask: 'Create Task',
      openPR: 'Open PR',
      creating: 'Creating...',
      createPR: 'Create PR',
      merging: 'Merging...',
      merge: 'Merge',
      stopping: 'Stopping...',
      stopAttempt: 'Stop Attempt',
      newAttempt: 'New Attempt',
      rebaseTaskAttempt: 'Rebase Task Attempt',
      chooseNewBaseBranch: 'Choose a new base branch to rebase this task attempt onto.',
      selectBaseBranch: 'Select a base branch',
      stopCurrentAttempt: 'Stop Current Attempt?',
      confirmStopExecution: 'Are you sure you want to stop the current execution? This action cannot be undone.',
      stop: 'Stop',
    },
    
    // Project creation
    projectCreation: {
      createProject: 'Create Project',
      chooseRepoType: 'Choose whether to use an existing git repository or create a new one.',
      repositoryType: 'Repository Type',
      useExistingRepo: 'Use existing repository',
      createNewRepo: 'Create new repository',
      gitRepoPath: 'Git Repository Path',
      gitRepoPathPlaceholder: '/path/to/your/existing/repo',
      selectFolderDescription: 'Select a folder that already contains a git repository',
      parentDirectory: 'Parent Directory',
      parentDirectoryPlaceholder: '/path/to/parent/directory',
      chooseParentDescription: 'Choose where to create the new repository',
      repositoryFolderName: 'Repository Folder Name',
      folderNamePlaceholder: 'my-awesome-project',
      folderNameDescription: 'The project name will be auto-populated from this folder name',
      projectName: 'Project Name',
      projectNamePlaceholder: 'Enter project name',
      setupScript: 'Setup Script (Optional)',
      setupScriptDescription: 'This script will run after creating the worktree and before the executor starts. Use it for setup tasks like installing dependencies or preparing the environment.',
      devServerScript: 'Dev Server Script (Optional)',
      devServerScriptDescription: 'This script can be run from task attempts to start a development server. Use it to quickly start your project\'s dev server for testing changes.',
      cleanupScript: 'Cleanup Script (Optional)',
      cleanupScriptDescription: 'This script will run after coding agent execution is complete. Use it for quality assurance tasks like running linters, formatters, tests, or other validation steps.',
      cancel: 'Cancel',
      createProjectButton: 'Create Project',
      close: 'Close',
    },
    
    // Git repository selection
    gitRepoSelection: {
      title: 'Select Git Repository',
      subtitle: 'Choose an existing git repository',
      navigation: 'Click folder names to navigate • Use action buttons to select',
      enterPathManually: 'Enter path manually:',
      pathPlaceholder: '/path/to/your/project',
      go: 'Go',
      searchCurrentDirectory: 'Search current directory:',
      searchPlaceholder: 'Filter folders and files...',
      selectCurrent: 'Select Current',
      cancel: 'Cancel',
      selectPath: 'Select Path',
      backToProjects: 'Back to Projects',
    },
    
    // Project details
    projectDetails: {
      projectDetailsAndSettings: 'Project details and settings',
      viewTasks: 'View Tasks',
      edit: 'Edit',
      delete: 'Delete',
      projectInformation: 'Project Information',
      status: 'Status',
      active: 'Active',
      created: 'Created:',
      lastUpdated: 'Last Updated:',
      projectDetailsSection: 'Project Details',
      technicalInformation: 'Technical information about this project',
      projectId: 'Project ID',
      createdAt: 'Created At',
      lastModified: 'Last Modified',
    },
    
    // Coding agents
    codingAgent: {
      starting: 'Coding Agent Starting',
      initializingConversation: 'Initializing conversation...',
      noChangesDetected: 'No changes detected',
      noRelatedTasksFound: 'No related tasks found.',
      noParentSubtasks: 'This task doesn\'t have any parent task or subtasks.',
      continueWorking: 'Continue working on this task...',
      typeAtToSearch: 'Type @ to search files.',
      send: 'Send',
    },

    // Create Attempt Component
    createAttemptComponent: {
      title: 'Create Attempt',
      description: 'Each time you start an attempt, a new session is initiated with your selected coding agent, and a git worktree and corresponding task branch are created.',
      baseBranch: 'Base branch',
      codingAgent: 'Coding agent',
      selectAgent: 'Select agent',
      default: 'Default',
      start: 'Start',
      current: 'current',
      planRequired: 'Plan Required',
      cannotStartAttempt: 'Cannot start attempt - no plan was generated in the last execution. Please generate a plan first.',
      planRequiredTooltip: 'Plan required before starting attempt',
      startNewAttemptTitle: 'Start New Attempt?',
      startNewAttemptDescription: 'Are you sure you want to start a new attempt for this task? This will create a new session and branch.',
      cancel: 'Cancel',
    },

    // GitHub Login Dialog
    githubLogin: {
      title: 'Sign in with GitHub',
      description: 'Connect your GitHub account to create and manage pull requests directly from Vibe Kanban.',
      loading: 'Loading…',
      successfullyConnected: 'Successfully connected!',
      signedInAs: 'You are signed in as',
      completeAuthorization: 'Complete GitHub Authorization',
      goToGitHub: 'Go to GitHub Device Authorization',
      enterCode: 'Enter this code:',
      codeWaitingMessage: 'Waiting for you to authorize this application on GitHub...',
      codeCopiedMessage: 'Code copied to clipboard! Complete the authorization on GitHub.',
      deviceCodeExpired: 'Device code expired. Please try again.',
      loginFailed: 'Login failed.',
      networkError: 'Network error',
      whyNeedAccess: 'Why do you need GitHub access?',
      createPullRequests: 'Create pull requests',
      createPullRequestsDesc: 'Generate PRs directly from your task attempts',
      manageRepositories: 'Manage repositories',
      manageRepositoriesDesc: 'Access your repos to push changes and create branches',
      streamlineWorkflow: 'Streamline workflow',
      streamlineWorkflowDesc: 'Skip manual PR creation and focus on coding',
      signInWithGitHub: 'Sign in with GitHub',
      starting: 'Starting…',
    },
  },
  
  'zh-TW': {
    // Navigation
    nav: {
      projects: '專案',
      mcpServers: 'MCP 伺服器',
      settings: '設定',
      docs: '文檔',
      support: '支援',
    },
    
    // Settings page
    settings: {
      title: '設定',
      subtitle: '配置您的偏好設定和應用程式設定。',
      loading: '載入設定中...',
      failed: '載入設定失敗。',
      saved: '✓ 設定儲存成功！',
      save: '儲存設定',
      saving: '設定已儲存！',
      
      // Appearance settings
      appearance: {
        title: '外觀',
        subtitle: '自訂應用程式的外觀和感覺。',
        theme: '主題',
        themePlaceholder: '選擇主題',
        themeDescription: '選擇您偏好的色彩方案。',
        themes: {
          light: '淺色',
          dark: '深色',
          system: '系統',
          purple: '紫色',
          green: '綠色',
          blue: '藍色',
          orange: '橙色',
          red: '紅色',
        },
      },
      
      // Language settings
      language: {
        title: '語言',
        subtitle: '選擇您偏好的介面語言。',
        language: '介面語言',
        languagePlaceholder: '選擇語言',
        languageDescription: '選擇您偏好的使用者介面語言。',
      },
      
      // Task execution settings
      taskExecution: {
        title: '任務執行',
        subtitle: '配置任務如何執行和處理。',
        executor: '預設執行器',
        executorPlaceholder: '選擇執行器',
        executorDescription: '選擇執行任務的預設執行器。',
      },
      
      // Editor settings
      editor: {
        title: '編輯器',
        subtitle: '配置查看任務嘗試時要開啟的編輯器。',
        editor: '偏好編輯器',
        editorPlaceholder: '選擇編輯器',
        editorDescription: '選擇您偏好的程式碼編輯器來開啟任務嘗試。',
        customCommand: '自訂指令',
        customCommandPlaceholder: '例如：code, subl, vim',
        customCommandDescription: '輸入執行自訂編輯器的指令。使用空格分隔參數（例如："code --wait"）。',
      },
      
      // GitHub integration
      github: {
        title: 'GitHub 整合',
        subtitle: '配置 GitHub 設定以從任務嘗試建立拉取請求。',
        token: '個人存取權杖',
        tokenPlaceholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
        tokenDescription: '具有 \'repo\' 權限的 GitHub 個人存取權杖。建立拉取請求時必需。',
        createToken: '在此建立權杖',
        signedInAs: '登入身分',
        logOut: '登出',
        signIn: '使用 GitHub 登入',
        defaultPrBase: '預設 PR 基底分支',
        defaultPrBasePlaceholder: 'main',
        defaultPrBaseDescription: '拉取請求的預設基底分支。如果未指定，預設為 \'main\'。',
      },
      
      // Notification settings
      notifications: {
        title: '通知',
        subtitle: '配置您如何接收有關任務完成的通知。',
        soundAlerts: '聲音提醒',
        soundAlertsDescription: '任務嘗試完成執行時播放聲音。',
        sound: '聲音',
        soundPlaceholder: '選擇聲音',
        soundDescription: '選擇任務完成時播放的聲音。點擊音量按鈕可預覽。',
        pushNotifications: '推播通知',
        pushNotificationsDescription: '任務嘗試完成執行時顯示系統通知。',
      },
      
      // Privacy settings
      privacy: {
        title: '隱私',
        subtitle: '透過分享匿名使用資料幫助改善 Vibe-Kanban。',
        enableTelemetry: '啟用使用統計',
        telemetryDescription: '啟用匿名使用事件追蹤以幫助改善應用程式。不會收集提示或專案資訊。',
      },
      
      // Task templates
      taskTemplates: {
        title: '任務模板',
        subtitle: '管理可在所有專案中使用的全域任務模板。',
      },
      
      // Security and disclaimer
      safety: {
        title: '安全性與免責聲明',
        subtitle: '管理安全警告和確認。',
        disclaimerStatus: '免責聲明狀態',
        disclaimerAcknowledged: '您已確認安全免責聲明。',
        disclaimerNotAcknowledged: '尚未確認安全免責聲明。',
        resetDisclaimer: '重設免責聲明',
        resetDisclaimerDescription: '重設免責聲明將要求您再次確認安全警告。',
        onboardingStatus: '新手引導狀態',
        onboardingCompleted: '您已完成新手引導流程。',
        onboardingNotCompleted: '尚未完成新手引導流程。',
        resetOnboarding: '重設新手引導',
        resetOnboardingDescription: '重設新手引導將再次顯示設定畫面。',
        telemetryAcknowledgment: '使用統計確認',
        telemetryAcknowledged: '您已確認使用統計通知。',
        telemetryNotAcknowledged: '尚未確認使用統計通知。',
        resetAcknowledgment: '重設確認',
        resetAcknowledgmentDescription: '重設確認將要求您再次確認使用統計通知。',
      },
    },
    
    // Project management
    projects: {
      title: '專案',
      subtitle: '管理您的專案並追蹤進度',
      create: '建立專案',
      createFirst: '建立您的第一個專案',
      noProjects: '尚無專案',
      noProjectsDescription: '開始建立您的第一個專案吧。',
      loading: '載入專案中...',
      failed: '載入專案失敗',
      
      // Project form
      form: {
        title: '建立專案',
        editTitle: '編輯專案',
        name: '專案名稱',
        namePlaceholder: '輸入專案名稱',
        gitRepo: 'Git 存放庫',
        gitRepoPlaceholder: '/path/to/your/project',
        useExisting: '使用現有存放庫',
        setupScript: '設定指令',
        setupScriptPlaceholder: 'npm install',
        devScript: '開發指令',
        devScriptPlaceholder: 'npm run dev',
        cleanupScript: '清理指令',
        cleanupScriptPlaceholder: 'npm run clean',
        cancel: '取消',
        create: '建立專案',
        update: '更新專案',
        creating: '建立中...',
        updating: '更新中...',
        saving: '儲存中...',
        saveChanges: '儲存變更',
        editDescription: '在這裡修改您的專案設定。完成後點擊儲存。',
      },
      
      // Project card
      card: {
        edit: '編輯',
        delete: '刪除',
        confirmDelete: '您確定要刪除此專案嗎？此操作無法復原。',
        tasks: '個任務',
        viewTasks: '查看任務',
        openInIDE: '在編輯器中開啟',
        created: '建立於',
        active: '啟用中',
      },
    },
    
    // Task management
    tasks: {
      title: '任務',
      subtitle: '管理和追蹤您的專案任務',
      create: '建立任務',
      createFirst: '建立您的第一個任務',
      noTasks: '尚無任務',
      noTasksDescription: '開始建立您的第一個任務吧。',
      loading: '載入任務中...',
      failed: '載入任務失敗',
      
      // Task page
      addTask: '新增任務',
      searchTasks: '搜尋任務...',
      openInIDE: '在編輯器中開啟',
      projectSettings: '專案設定',
      manageTemplates: '管理模板',
      projectTemplates: '專案模板',
      globalTemplates: '全域模板',
      noTasksFound: '找不到此專案的任務。',
      createFirstTask: '建立第一個任務',
      done: '完成',
      
      // Error messages
      failedCreateTask: '建立任務失敗',
      failedCreateAndStartTask: '建立並啟動任務失敗',
      failedUpdateTask: '更新任務失敗',
      failedDeleteTask: '刪除任務失敗',
      failedUpdateStatus: '更新任務狀態失敗',
      failedOpenIDE: '在編輯器中開啟專案失敗',
      failedLoadProject: '載入專案失敗',
      failedLoadTasks: '載入任務失敗',
      
      // Task status
      status: {
        todo: '待辦',
        inprogress: '進行中',
        inreview: '審查中',
        done: '已完成',
        cancelled: '已取消',
      },
      
      // Task form
      form: {
        title: '建立任務',
        editTitle: '編輯任務',
        taskTitle: '任務標題',
        titlePlaceholder: '輸入任務標題',
        description: '描述',
        descriptionPlaceholder: '輸入任務描述...',
        executor: '執行器',
        executorPlaceholder: '選擇執行器',
        status: '狀態',
        statusPlaceholder: '選擇狀態',
        cancel: '取消',
        create: '建立任務',
        update: '更新任務',
        createAndStart: '建立並開始',
        creating: '建立中...',
        updating: '更新中...',
        starting: '啟動中...',
        
        // Task form dialog
        createNewTask: '建立新任務',
        editTask: '編輯任務',
        titleLabel: '標題',
        titlePlaceholderForm: '需要完成什麼？',
        descriptionLabel: '描述',
        descriptionPlaceholderForm: '添加更多詳情（選填）。輸入 @ 搜尋檔案。',
        statusLabel: '狀態',
        useTemplate: '使用模板',
        templateHelp: '模板可幫助您快速建立具有預定義內容的任務。',
        chooseTemplate: '選擇模板來預填此表單',
        noTemplate: '無模板',
        
        // Plan related
        planRequired: '需要計劃',
        planRequiredMessage: '上次執行嘗試中未生成計劃。在有計劃可用之前，任務建立功能已停用。請先生成計劃。',
        planRequiredTooltip: '建立任務前需要計劃',
        planRequiredStartTooltip: '建立並啟動任務前需要計劃',
        
        // Button text
        updateTask: '更新任務',
        createTask: '建立任務',
        createAndStartTask: '建立並開始',
        creatingTask: '建立中...',
        updatingTask: '更新中...',
        creatingAndStarting: '建立並啟動中...',
      },
      
      // Task operations
      actions: {
        start: '開始',
        edit: '編輯',
        delete: '刪除',
        viewDetails: '查看詳情',
        createPR: '建立 PR',
        openEditor: '在編輯器中開啟',
        confirmDelete: '您確定要刪除此任務嗎？此操作無法復原。',
      },
    },
    
    
    
    // Common UI
    common: {
      save: '儲存',
      cancel: '取消',
      delete: '刪除',
      edit: '編輯',
      create: '建立',
      update: '更新',
      loading: '載入中...',
      error: '錯誤',
      success: '成功',
      confirm: '確認',
      close: '關閉',
      back: '返回',
      next: '下一個',
      previous: '上一個',
      search: '搜尋',
      filter: '篩選',
      sort: '排序',
      refresh: '重新整理',
      yes: '是',
      no: '否',
      general: '一般',
    },
    
    // Privacy choice dialog
    privacyOptIn: {
      title: '意見回饋選擇',
      description: '透過分享使用資料並允許我們在需要時聯繫您，幫助我們改善 Vibe Kanban。',
      whatDataCollect: '我們收集哪些資料？',
      githubProfile: 'GitHub 個人資料資訊',
      githubProfileDesc: '使用者名稱和電子郵件地址，僅用於發送專案的重要更新。我們承諾不會濫用此資訊',
      usageMetrics: '高階使用統計',
      usageMetricsDesc: '建立的任務數量、管理的專案數量、功能使用情況',
      performanceData: '效能和錯誤資料',
      performanceDataDesc: '應用程式崩潰、回應時間、技術問題',
      doNotCollect: '我們不會收集',
      doNotCollectDesc: '任務內容、程式碼片段、專案名稱或其他個人資料',
      settingsNote: '這有助於我們優先安排改進項目。您可以隨時在設定中變更此偏好設定。',
      noThanks: '不用了，謝謝',
      yesHelp: '是的，幫助改善 Vibe Kanban',
    },
    
    // Task details
    taskDetails: {
      title: '任務詳情',
      editTask: '編輯任務',
      deleteTask: '刪除任務',
      closePanel: '關閉面板',
      showMore: '顯示更多',
      showLess: '顯示較少',
      noDescription: '未提供描述',
      tabs: {
        logs: '記錄',
        plans: '計劃',
        diffs: '差異',
        relatedTasks: '相關任務',
        processes: '流程',
      },
      processes: {
        noProcesses: '此次嘗試未找到執行流程。',
        args: '參數',
        exit: '退出',
        started: '開始時間',
        completed: '完成時間',
        workingDirectory: '工作目錄',
        processDetails: '流程詳情',
        backToList: '返回列表',
        processInfo: '流程資訊',
        type: '類型',
        status: '狀態',
        executor: '執行器',
        exitCode: '退出代碼',
        timing: '時間記錄',
        command: '指令',
        stdout: '標準輸出',
        stderr: '錯誤輸出',
        loadingDetails: '載入流程詳情中...',
        failedToLoad: '載入流程詳情失敗。請重試。',
      },
    },
    
    // Security warning dialog
    disclaimer: {
      title: '重要安全警告',
      pleaseRead: '請在繼續之前閱讀並確認以下內容：',
      fullAccess: '程式碼代理擁有您電腦的完整存取權限',
      executeCommands: '並可執行任何終端指令，包括：',
      risks: {
        software: '安裝、修改或刪除軟體',
        files: '存取、建立或移除檔案和目錄',
        network: '發出網路請求和連接',
        system: '以您的權限執行系統級指令',
      },
      experimental: '此軟體為實驗性質，可能造成災難性損害',
      acknowledgeUsage: '您的系統、資料或專案。使用此軟體即表示您確認：',
      acknowledgeItems: {
        ownRisk: '您完全自行承擔使用此軟體的風險',
        noResponsibility: '開發者不對任何損害、資料遺失或安全問題負責',
        backups: '使用此軟體前，您應妥善備份重要資料',
        consequences: '您了解授予無限制系統存取權限的潛在後果',
      },
      checkboxLabel: '我理解並確認上述描述的風險。我知道程式碼代理擁有我電腦的完整存取權限，可能造成災難性損害。',
      acceptButton: '我接受風險並希望繼續',
    },
    
    // Welcome setup dialog
    onboarding: {
      title: '歡迎使用 Vibe Kanban',
      description: '讓我們設定您的程式開發偏好。您隨時可以在設定中變更這些選項。',
      codingAgent: {
        title: '選擇您的程式碼代理',
        label: '預設執行器',
        placeholder: '選擇您偏好的程式碼代理',
        descriptions: {
          claude: 'Anthropic 的 Claude Code',
          amp: '來自 Sourcegraph',
          gemini: 'Bloop 的 Google Gemini',
          charmOpencode: 'Charm/Opencode AI 助手',
          claudeCodeRouter: 'Claude Code Router',
          echo: '這僅用於除錯 vibe-kanban 本身',
        },
      },
      codeEditor: {
        title: '選擇您的程式碼編輯器',
        label: '偏好編輯器',
        placeholder: '選擇您偏好的編輯器',
        description: '此編輯器將用於開啟任務嘗試和專案檔案。',
        customCommand: '自訂指令',
        customPlaceholder: '例如：code, subl, vim',
        customDescription: '輸入執行自訂編輯器的指令。使用空格分隔參數（例如："code --wait"）。',
      },
      continueButton: '繼續',
    },
    
    // Task template manager
    templateManager: {
      title: '任務模板',
      globalTemplates: '全域任務模板',
      projectTemplates: '專案任務模板',
      addTemplate: '新增模板',
      noTemplates: '尚無模板。建立您的第一個模板以開始使用。',
      editTemplate: '編輯模板',
      createTemplate: '建立模板',
      deleteTemplate: '刪除模板',
      confirmDelete: '您確定要刪除模板「{templateName}」嗎？',
      table: {
        templateName: '模板名稱',
        title: '標題',
        description: '描述',
        actions: '操作',
      },
      form: {
        templateName: '模板名稱',
        templateNamePlaceholder: '例如：錯誤修復、功能請求',
        defaultTitle: '預設標題',
        defaultTitlePlaceholder: '例如：修復...中的錯誤',
        defaultDescription: '預設描述',
        defaultDescriptionPlaceholder: '輸入使用此模板建立的任務的預設描述',
      },
      errors: {
        nameAndTitleRequired: '模板名稱和標題為必填項目',
        failedToSave: '儲存模板失敗',
      },
    },
    
    // MCP server configuration
    mcpServers: {
      title: 'MCP 伺服器',
      subtitle: '配置 MCP 伺服器以擴展執行器功能。',
      successMessage: '✓ MCP 配置儲存成功！',
      
      configuration: {
        title: '配置',
        description: '為不同的執行器配置 MCP 伺服器，以透過自訂工具和資源擴展其功能。',
        label: 'MCP 伺服器配置',
        placeholder: '{\n  "server-name": {\n    "type": "stdio",\n    "command": "your-command",\n    "args": ["arg1", "arg2"]\n  }\n}',
        loadingPlaceholder: '載入當前配置中...',
        loading: '載入中...',
        loadingText: '載入當前 MCP 伺服器配置中...',
        saveLocation: '變更將儲存至：',
      },
      
      executor: {
        label: '執行器',
        placeholder: '選擇執行器',
        description: '選擇要為其配置 MCP 伺服器的執行器。',
      },
      
      notSupported: {
        title: '不支援 MCP',
        description: '要使用 MCP 伺服器，請選擇上方的不同執行器（Claude、Amp 或 Gemini）。',
      },
      
      addVibeKanban: {
        button: '新增 Vibe-Kanban MCP',
        description: '自動新增 Vibe-Kanban MCP 伺服器。',
      },
      
      saveButton: {
        save: '儲存設定',
        saved: '設定已儲存！',
      },
      
      errors: {
        failedToLoadConfiguration: '載入配置失敗。',
        configurationError: 'MCP 配置錯誤：{error}',
        ampConfiguration: 'AMP 配置必須包含 "amp.mcpServers" 物件',
        mcpConfiguration: '配置必須包含 "mcp" 物件',
        mcpServersConfiguration: '配置必須包含 "mcpServers" 物件',
        invalidJson: '無效的 JSON 格式',
        failedToConfigure: '配置 vibe-kanban MCP 伺服器失敗',
        failedToSave: '儲存 MCP 伺服器失敗',
        failedToApply: '應用 MCP 伺服器配置失敗',
      },
    },
    
    // Task attempts and execution
    taskAttempt: {
      started: '已開始',
      agent: '代理',
      echo: 'Echo',
      baseBranch: '基底分支',
      main: 'main',
      mergeStatus: '合併狀態',
      notMerged: '未合併',
      worktreePath: 'Worktree 路徑',
      openInVSCode: '在 Visual Studio Code 中開啟',
      devServer: '開發伺服器',
      createPR: '建立 PR',
      merge: '合併',
      newAttempt: '新嘗試',
      createAttempt: '建立嘗試',
      attemptDescription: '每次開始嘗試時，都會啟動一個新的會話與您選擇的程式碼代理，並建立一個 git worktree 和對應的任務分支。',
      codingAgent: '程式碼代理',
      start: '開始',
    },
    
    // Create attempt related translations
    createAttempt: {
      started: '已開始',
      agent: '代理',
      baseBranch: '基底分支',
      changeBaseBranch: '變更基底分支',
      planStatus: '計劃狀態',
      mergeStatus: '合併狀態',
      taskCreated: '任務已建立',
      draft: '草稿',
      merged: '已合併',
      notMerged: '未合併',
      worktreePath: 'Worktree 路徑',
      openInEditor: '在 {editor} 中開啟',
      copied: '已複製！',
      clickToCopyPath: '點擊複製 worktree 路徑',
      stopDev: '停止開發',
      devServer: '開發伺服器',
      addDevScriptToEnable: '在專案設定中新增開發伺服器指令以啟用此功能',
      devServerLogs: '開發伺服器日誌（最後 10 行）：',
      stopRunningDevServer: '停止正在執行的開發伺服器',
      startDevServer: '啟動開發伺服器',
      history: '歷史記錄',
      viewAttemptHistory: '檢視嘗試歷史記錄',
      rebasing: 'Rebasing 中...',
      rebase: 'Rebase',
      approving: '核准中...',
      createTask: '建立任務',
      openPR: '開啟 PR',
      creating: '建立中...',
      createPR: '建立 PR',
      merging: '合併中...',
      merge: '合併',
      stopping: '停止中...',
      stopAttempt: '停止嘗試',
      newAttempt: '新嘗試',
      rebaseTaskAttempt: 'Rebase 任務嘗試',
      chooseNewBaseBranch: '選擇要將此任務嘗試 rebase 到的新基底分支。',
      selectBaseBranch: '選擇基底分支',
      stopCurrentAttempt: '停止目前嘗試？',
      confirmStopExecution: '您確定要停止目前的執行嗎？此動作無法復原。',
      stop: '停止',
    },
    
    // Project creation
    projectCreation: {
      createProject: '建立專案',
      chooseRepoType: '選擇使用現有的 git 存放庫或建立新的存放庫。',
      repositoryType: '存放庫類型',
      useExistingRepo: '使用現有存放庫',
      createNewRepo: '建立新存放庫',
      gitRepoPath: 'Git 存放庫路徑',
      gitRepoPathPlaceholder: '/path/to/your/existing/repo',
      selectFolderDescription: '選擇已包含 git 存放庫的資料夾',
      parentDirectory: '上層目錄',
      parentDirectoryPlaceholder: '/path/to/parent/directory',
      chooseParentDescription: '選擇建立新存放庫的位置',
      repositoryFolderName: '存放庫資料夾名稱',
      folderNamePlaceholder: 'my-awesome-project',
      folderNameDescription: '專案名稱將根據此資料夾名稱自動填入',
      projectName: '專案名稱',
      projectNamePlaceholder: '輸入專案名稱',
      setupScript: '設定腳本（選填）',
      setupScriptDescription: '此腳本將在建立 worktree 之後和執行器啟動之前執行。用於設定任務，如安裝依賴或準備環境。',
      devServerScript: '開發伺服器腳本（選填）',
      devServerScriptDescription: '此腳本可從任務嘗試中執行以啟動開發伺服器。用於快速啟動專案的開發伺服器以測試變更。',
      cleanupScript: '清理腳本（選填）',
      cleanupScriptDescription: '此腳本將在程式碼代理執行完成後執行。用於品質保證任務，如執行檢查器、格式化器、測試或其他驗證步驟。',
      cancel: '取消',
      createProjectButton: '建立專案',
      close: '關閉',
    },
    
    // Git repository selection
    gitRepoSelection: {
      title: '選擇 Git 存放庫',
      subtitle: '選擇現有的 git 存放庫',
      navigation: '點擊資料夾名稱進行導航 • 使用操作按鈕進行選擇',
      enterPathManually: '手動輸入路徑：',
      pathPlaceholder: '/path/to/your/project',
      go: '前往',
      searchCurrentDirectory: '搜尋目前目錄：',
      searchPlaceholder: '篩選資料夾和檔案...',
      selectCurrent: '選擇目前',
      cancel: '取消',
      selectPath: '選擇路徑',
      backToProjects: '返回專案',
    },
    
    // Project details
    projectDetails: {
      projectDetailsAndSettings: '專案詳情和設定',
      viewTasks: '查看任務',
      edit: '編輯',
      delete: '刪除',
      projectInformation: '專案資訊',
      status: '狀態',
      active: '啟用中',
      created: '建立於：',
      lastUpdated: '最後更新：',
      projectDetailsSection: '專案詳情',
      technicalInformation: '此專案的技術資訊',
      projectId: '專案 ID',
      createdAt: '建立時間',
      lastModified: '最後修改',
    },
    
    // Coding agent related
    codingAgent: {
      starting: 'Coding Agent 啟動中',
      initializing: '初始化對話中...',
      failed: 'Coding Agent 失敗',
      stopped: 'Coding Agent 已停止',
      failedMessage: 'Coding Agent 遇到錯誤。',
      stoppedMessage: 'Coding Agent 已被停止。',
    },
    
    // Diff related
    diff: {
      noChangesDetected: '未偵測到變更',
    },
    
    // Related tasks
    relatedTasks: {
      noRelatedTasksFound: '未找到相關任務。',
      noParentOrSubtasks: '此任務沒有任何父任務或子任務。',
    },
    
    // Task follow-up
    taskFollowUp: {
      placeholder: '繼續處理此任務... 輸入 @ 搜尋檔案。',
      send: '發送',
    },

    // Create Attempt Component
    createAttemptComponent: {
      title: '建立嘗試',
      description: '每次開始嘗試時，都會啟動一個新的會話與您選擇的程式碼代理，並建立一個 git worktree 和對應的任務分支。',
      baseBranch: '基底分支',
      codingAgent: '程式碼代理',
      selectAgent: '選擇代理',
      default: '（預設）',
      start: '開始',
      current: 'current',
      planRequired: '需要計劃',
      cannotStartAttempt: '無法開始嘗試 - 上次執行中未產生計劃。請先產生計劃。',
      planRequiredTooltip: '開始嘗試前需要計劃',
      startNewAttemptTitle: '開始新嘗試？',
      startNewAttemptDescription: '您確定要為此任務開始新嘗試嗎？這將建立新的會話和分支。',
      cancel: '取消',
    },

    // GitHub Login Dialog
    githubLogin: {
      title: '使用 GitHub 登入',
      description: '連接您的 GitHub 帳戶，直接從 Vibe Kanban 建立和管理拉取請求。',
      loading: '載入中…',
      successfullyConnected: '連接成功！',
      signedInAs: '您已登入為',
      completeAuthorization: '完成 GitHub 授權',
      goToGitHub: '前往 GitHub 裝置授權',
      enterCode: '輸入此代碼：',
      codeWaitingMessage: '等待您在 GitHub 上授權此應用程式...',
      codeCopiedMessage: '代碼已複製到剪貼簿！請在 GitHub 上完成授權。',
      deviceCodeExpired: '設備代碼已過期。請重試。',
      loginFailed: '登入失敗。',
      networkError: '網路錯誤',
      whyNeedAccess: '為什麼需要 GitHub 存取權限？',
      createPullRequests: '建立拉取請求',
      createPullRequestsDesc: '直接從您的任務嘗試產生 PR',
      manageRepositories: '管理存放庫',
      manageRepositoriesDesc: '存取您的存放庫以推送變更和建立分支',
      streamlineWorkflow: '簡化工作流程',
      streamlineWorkflowDesc: '跳過手動 PR 建立，專注於程式開發',
      signInWithGitHub: '使用 GitHub 登入',
      starting: '啟動中…',
    },
  },
} as const;

// Get current language
export function getCurrentLanguage(): Language {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('language');
    if (stored && ['en', 'zh-TW'].includes(stored)) {
      return stored as Language;
    }
  }
  return 'en'; // Default to English
}

// Set language
export function setLanguage(language: Language) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('language', language);
    // Trigger custom event to notify language change
    window.dispatchEvent(new CustomEvent('languageChange', { detail: language }));
  }
}

// Get translation
export function useTranslation() {
  const [currentLanguage, setCurrentLanguage] = useState<Language>(getCurrentLanguage());
  
  useEffect(() => {
    const handleLanguageChange = (event: CustomEvent<Language>) => {
      setCurrentLanguage(event.detail);
    };
    
    window.addEventListener('languageChange', handleLanguageChange as EventListener);
    return () => {
      window.removeEventListener('languageChange', handleLanguageChange as EventListener);
    };
  }, []);
  
  const t = useCallback((key: string, params?: Record<string, string>) => {
    const keys = key.split('.');
    let value: any = translations[currentLanguage];
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // If translation not found, fallback to English
        value = translations.en;
        for (const fallbackK of keys) {
          if (value && typeof value === 'object' && fallbackK in value) {
            value = value[fallbackK];
          } else {
            return key; // If English translation doesn't exist either, return key
          }
        }
        break;
      }
    }
    
    let result = typeof value === 'string' ? value : key;
    
    // Handle parameter substitution
    if (params && typeof result === 'string') {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(new RegExp(`{${paramKey}}`, 'g'), paramValue);
      });
    }
    
    return result;
  }, [currentLanguage]);
  
  return { t, currentLanguage, setLanguage: (lang: Language) => {
    setLanguage(lang);
    setCurrentLanguage(lang);
  }};
}

// React Hook
import { useState, useEffect, useCallback } from 'react';