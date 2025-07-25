/**
 * Strategy pattern implementation for MCP server configuration handling
 * across different executors (Claude, Amp, Gemini, SST Opencode, etc.)
 */

export interface McpConfigStrategy {
  /**
   * Get the default empty configuration structure for this executor
   */
  getDefaultConfig(): string;

  /**
   * Create the full configuration structure from servers data
   */
  createFullConfig(servers: Record<string, any>): Record<string, any>;

  /**
   * Validate the full configuration structure
   */
  validateFullConfig(config: Record<string, any>): void;

  /**
   * Extract the servers object from the full configuration for API calls
   */
  extractServersForApi(fullConfig: Record<string, any>): Record<string, any>;

  /**
   * Create the vibe-kanban MCP server configuration for this executor
   */
  createVibeKanbanConfig(): Record<string, any>;

  /**
   * Add vibe-kanban configuration to existing config
   */
  addVibeKanbanToConfig(
    existingConfig: Record<string, any>,
    vibeKanbanConfig: Record<string, any>
  ): Record<string, any>;
}

/**
 * Standard MCP configuration strategy for Claude, Gemini, Charm Opencode, etc.
 */
export class StandardMcpStrategy implements McpConfigStrategy {
  getDefaultConfig(): string {
    return '{\n  "mcpServers": {\n  }\n}';
  }

  createFullConfig(servers: Record<string, any>): Record<string, any> {
    return { mcpServers: servers };
  }

  validateFullConfig(config: Record<string, any>): void {
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      throw new Error('Configuration must contain an "mcpServers" object');
    }
  }

  extractServersForApi(fullConfig: Record<string, any>): Record<string, any> {
    return fullConfig.mcpServers;
  }

  createVibeKanbanConfig(): Record<string, any> {
    return {
      command: 'npx',
      args: ['-y', 'vibe-kanban', '--mcp'],
    };
  }

  addVibeKanbanToConfig(
    existingConfig: Record<string, any>,
    vibeKanbanConfig: Record<string, any>
  ): Record<string, any> {
    return {
      ...existingConfig,
      mcpServers: {
        ...(existingConfig.mcpServers || {}),
        vibe_kanban: vibeKanbanConfig,
      },
    };
  }
}

/**
 * AMP-specific MCP configuration strategy
 */
export class AmpMcpStrategy implements McpConfigStrategy {
  getDefaultConfig(): string {
    return '{\n  "amp.mcpServers": {\n  }\n}';
  }

  createFullConfig(servers: Record<string, any>): Record<string, any> {
    return { 'amp.mcpServers': servers };
  }

  validateFullConfig(config: Record<string, any>): void {
    if (
      !config['amp.mcpServers'] ||
      typeof config['amp.mcpServers'] !== 'object'
    ) {
      throw new Error(
        'AMP configuration must contain an "amp.mcpServers" object'
      );
    }
  }

  extractServersForApi(fullConfig: Record<string, any>): Record<string, any> {
    return fullConfig['amp.mcpServers'];
  }

  createVibeKanbanConfig(): Record<string, any> {
    return {
      command: 'npx',
      args: ['-y', 'vibe-kanban', '--mcp'],
    };
  }

  addVibeKanbanToConfig(
    existingConfig: Record<string, any>,
    vibeKanbanConfig: Record<string, any>
  ): Record<string, any> {
    return {
      ...existingConfig,
      'amp.mcpServers': {
        ...(existingConfig['amp.mcpServers'] || {}),
        vibe_kanban: vibeKanbanConfig,
      },
    };
  }
}

/**
 * SST Opencode-specific MCP configuration strategy
 */
export class SstOpencodeMcpStrategy implements McpConfigStrategy {
  getDefaultConfig(): string {
    return '{\n  "mcp": {\n  }, "$schema": "https://opencode.ai/config.json"\n}';
  }

  createFullConfig(servers: Record<string, any>): Record<string, any> {
    return {
      mcp: servers,
      $schema: 'https://opencode.ai/config.json',
    };
  }

  validateFullConfig(config: Record<string, any>): void {
    if (!config.mcp || typeof config.mcp !== 'object') {
      throw new Error('Configuration must contain an "mcp" object');
    }
  }

  extractServersForApi(fullConfig: Record<string, any>): Record<string, any> {
    return fullConfig.mcp;
  }

  createVibeKanbanConfig(): Record<string, any> {
    return {
      type: 'local',
      command: ['npx', '-y', 'vibe-kanban', '--mcp'],
      enabled: true,
    };
  }

  addVibeKanbanToConfig(
    existingConfig: Record<string, any>,
    vibeKanbanConfig: Record<string, any>
  ): Record<string, any> {
    return {
      ...existingConfig,
      mcp: {
        ...(existingConfig.mcp || {}),
        vibe_kanban: vibeKanbanConfig,
      },
    };
  }
}

/**
 * Codex-specific MCP configuration strategy
 * Uses TOML format with mcp_servers key instead of JSON
 */
export class CodexMcpStrategy implements McpConfigStrategy {
  getDefaultConfig(): string {
    // For TOML format, we still return JSON for the frontend display
    // The backend will handle TOML conversion
    return '{\n  "mcp_servers": {\n  }\n}';
  }

  createFullConfig(servers: Record<string, any>): Record<string, any> {
    return { mcp_servers: servers };
  }

  validateFullConfig(config: Record<string, any>): void {
    if (!config.mcp_servers || typeof config.mcp_servers !== 'object') {
      throw new Error('Configuration must contain an "mcp_servers" object');
    }
  }

  extractServersForApi(fullConfig: Record<string, any>): Record<string, any> {
    return fullConfig.mcp_servers;
  }

  createVibeKanbanConfig(): Record<string, any> {
    return {
      command: 'npx',
      args: ['-y', 'vibe-kanban', '--mcp'],
    };
  }

  addVibeKanbanToConfig(
    existingConfig: Record<string, any>,
    vibeKanbanConfig: Record<string, any>
  ): Record<string, any> {
    return {
      ...existingConfig,
      mcp_servers: {
        ...(existingConfig.mcp_servers || {}),
        vibe_kanban: vibeKanbanConfig,
      },
    };
  }
}

/**
 * Factory function to get the appropriate MCP strategy for an executor
 */
export function getMcpStrategy(executorType: string): McpConfigStrategy {
  switch (executorType) {
    case 'amp':
      return new AmpMcpStrategy();
    case 'sst-opencode':
      return new SstOpencodeMcpStrategy();
    case 'codex':
      return new CodexMcpStrategy();
    case 'claude':
    case 'claude-plan':
    case 'claude-code-router':
    case 'gemini':
    case 'charm-opencode':
    default:
      return new StandardMcpStrategy();
  }
}
