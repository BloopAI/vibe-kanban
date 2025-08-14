import { McpConfig } from 'shared/types';

export class McpConfigStrategyGeneral {
  static createFullConfig(cfg: McpConfig): Record<string, any> {
    // create a template with servers filled in at cfg.servers
    const fullConfig = JSON.parse(JSON.stringify(cfg.template));
    let current = fullConfig;
    for (let i = 0; i < cfg.servers_path.length - 1; i++) {
      const key = cfg.servers_path[i];
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }
    if (cfg.servers_path.length > 0) {
      const lastKey = cfg.servers_path[cfg.servers_path.length - 1];
      current[lastKey] = cfg.servers;
    }
    return fullConfig;
  }
  static validateFullConfig(
    mcp_config: McpConfig,
    full_config: Record<string, any>
  ): void {
    // Validate using the schema path
    let current = full_config;
    for (const key of mcp_config.servers_path) {
      current = current?.[key];
      if (current === undefined) {
        throw new Error(
          `Missing required field at path: ${mcp_config.servers_path.join('.')}`
        );
      }
    }
    if (typeof current !== 'object') {
      throw new Error('Servers configuration must be an object');
    }
  }
  static extractServersForApi(
    mcp_config: McpConfig,
    full_config: Record<string, any>
  ): Record<string, any> {
    // Extract the servers object based on the path
    let current = full_config;
    for (const key of mcp_config.servers_path) {
      current = current?.[key];
      if (current === undefined) {
        throw new Error(
          `Missing required field at path: ${mcp_config.servers_path.join('.')}`
        );
      }
    }
    return current;
  }

  static addVibeKanbanToConfig(
    mcp_config: McpConfig,
    existingConfig: Record<string, any>
  ): Record<string, any> {
    // Clone the existing config to avoid mutations
    const updatedConfig = JSON.parse(JSON.stringify(existingConfig));
    let current = updatedConfig;

    // Navigate to the correct location for servers (all except the last element)
    for (let i = 0; i < mcp_config.servers_path.length - 1; i++) {
      const key = mcp_config.servers_path[i];
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }

    // Get or create the servers object at the final path element
    const lastKey = mcp_config.servers_path[mcp_config.servers_path.length - 1];
    if (!current[lastKey]) {
      current[lastKey] = {};
    }

    // Add vibe_kanban server with the config from the schema
    current[lastKey]['vibe_kanban'] = mcp_config.vibe_kanban;

    return updatedConfig;
  }
}
