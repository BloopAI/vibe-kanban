import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Plus, Trash2, Edit3, Code, List, Eye, EyeOff } from 'lucide-react';
import { EXECUTOR_TYPES, EXECUTOR_LABELS } from 'shared/types';
import { useConfig } from '@/components/config-provider';
import { mcpServersApi } from '../lib/api';

interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  command: string;
  args: string[];
  env?: Record<string, string>;
  description?: string;
}

interface ParsedMcpConfig {
  servers: McpServerConfig[];
  originalConfig: Record<string, unknown>;
}

export function McpServers() {
  const { config } = useConfig();
  const [mcpServers, setMcpServers] = useState('{}');
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [selectedMcpExecutor, setSelectedMcpExecutor] = useState<string>('');
  const [mcpApplying, setMcpApplying] = useState(false);
  const [mcpConfigPath, setMcpConfigPath] = useState<string>('');
  const [success, setSuccess] = useState(false);
  
  // Enhanced UI state
  const [viewMode, setViewMode] = useState<'list' | 'json'>('list');
  const [parsedConfig, setParsedConfig] = useState<ParsedMcpConfig>({ servers: [], originalConfig: {} });
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [newServerName, setNewServerName] = useState('');
  const [newServerCommand, setNewServerCommand] = useState('');
  const [newServerArgs, setNewServerArgs] = useState('');
  const [newServerEnv, setNewServerEnv] = useState('');
  const [newServerDescription, setNewServerDescription] = useState('');

  // Initialize selected MCP executor when config loads
  useEffect(() => {
    if (config?.executor?.type && !selectedMcpExecutor) {
      setSelectedMcpExecutor(config.executor.type);
    }
  }, [config?.executor?.type, selectedMcpExecutor]);

  // Load existing MCP configuration when selected executor changes
  useEffect(() => {
    const loadMcpServersForExecutor = async (executorType: string) => {
      // Reset state when loading
      setMcpLoading(true);
      setMcpError(null);

      // Set default empty config based on executor type
      const defaultConfig =
        executorType === 'amp'
          ? '{\n  "amp.mcpServers": {\n  }\n}'
          : '{\n  "mcpServers": {\n  }\n}';
      setMcpServers(defaultConfig);
      setMcpConfigPath('');

      try {
        // Load MCP servers for the selected executor
        const result = await mcpServersApi.load(executorType);
        // Handle new response format with servers and config_path
        const data = result || {};
        const servers = data.servers || {};
        const configPath = data.config_path || '';

        // Create the full configuration structure based on executor type
        let fullConfig;
        if (executorType === 'amp') {
          // For AMP, use the amp.mcpServers structure
          fullConfig = { 'amp.mcpServers': servers };
        } else {
          // For other executors, use the standard mcpServers structure
          fullConfig = { mcpServers: servers };
        }

        const configJson = JSON.stringify(fullConfig, null, 2);
        setMcpServers(configJson);
        setMcpConfigPath(configPath);
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('does not support MCP')) {
          setMcpError(err.message);
        } else {
          console.error('Error loading MCP servers:', err);
        }
      } finally {
        setMcpLoading(false);
      }
    };

    // Load MCP servers for the selected MCP executor
    if (selectedMcpExecutor) {
      loadMcpServersForExecutor(selectedMcpExecutor);
    }
  }, [selectedMcpExecutor]);

  // Parse JSON config to structured list
  const parseConfigToList = useCallback((jsonConfig: string): ParsedMcpConfig => {
    try {
      const config = JSON.parse(jsonConfig);
      const serversKey = selectedMcpExecutor === 'amp' ? 'amp.mcpServers' : 'mcpServers';
      const servers = config[serversKey] || {};
      
      const serverList: McpServerConfig[] = Object.entries(servers as Record<string, Record<string, unknown>>).map(([name, serverConfig]) => ({
        id: name,
        name,
        enabled: true, // Default to enabled for existing servers
        command: (serverConfig.command as string) || '',
        args: (serverConfig.args as string[]) || [],
        env: (serverConfig.env as Record<string, string>) || {},
        description: (serverConfig.description as string) || ''
      }));

      return { servers: serverList, originalConfig: config };
    } catch (error) {
      return { servers: [], originalConfig: {} };
    }
  }, [selectedMcpExecutor]);

  // Convert structured list back to JSON
  const listConfigToJson = (servers: McpServerConfig[]): string => {
    const serversKey = selectedMcpExecutor === 'amp' ? 'amp.mcpServers' : 'mcpServers';
    const enabledServers = servers.filter(server => server.enabled);
    
    const serversConfig = enabledServers.reduce((acc, server) => {
      const serverConfig: Record<string, unknown> = {
        command: server.command,
        args: server.args
      };
      
      if (server.env && Object.keys(server.env).length > 0) {
        serverConfig.env = server.env;
      }
      
      if (server.description) {
        serverConfig.description = server.description;
      }
      
      acc[server.name] = serverConfig;
      return acc;
    }, {} as Record<string, Record<string, unknown>>);

    const fullConfig = {
      ...parsedConfig.originalConfig,
      [serversKey]: serversConfig
    };

    return JSON.stringify(fullConfig, null, 2);
  };

  // Sync list changes to JSON
  const syncListToJson = (updatedServers: McpServerConfig[]) => {
    const newJsonConfig = listConfigToJson(updatedServers);
    setMcpServers(newJsonConfig);
    setParsedConfig(prev => ({ ...prev, servers: updatedServers }));
  };

  // Parse JSON when it changes (for bidirectional sync)
  useEffect(() => {
    if (mcpServers && mcpServers.trim()) {
      const parsed = parseConfigToList(mcpServers);
      setParsedConfig(parsed);
    }
  }, [mcpServers, selectedMcpExecutor, parseConfigToList]);

  const handleMcpServersChange = (value: string) => {
    setMcpServers(value);
    setMcpError(null);

    // Validate JSON on change
    if (value.trim()) {
      try {
        const config = JSON.parse(value);
        // Validate that the config has the expected structure based on executor type
        if (selectedMcpExecutor === 'amp') {
          if (
            !config['amp.mcpServers'] ||
            typeof config['amp.mcpServers'] !== 'object'
          ) {
            setMcpError(
              'AMP configuration must contain an "amp.mcpServers" object'
            );
          }
        } else {
          if (!config.mcpServers || typeof config.mcpServers !== 'object') {
            setMcpError('Configuration must contain an "mcpServers" object');
          }
        }
      } catch (err) {
        setMcpError('Invalid JSON format');
      }
    }
  };

  // List view handlers
  const handleToggleServer = (serverId: string) => {
    const updatedServers = parsedConfig.servers.map(server =>
      server.id === serverId ? { ...server, enabled: !server.enabled } : server
    );
    syncListToJson(updatedServers);
  };

  const handleDeleteServer = (serverId: string) => {
    const updatedServers = parsedConfig.servers.filter(server => server.id !== serverId);
    syncListToJson(updatedServers);
  };

  const handleAddServer = () => {
    if (!newServerName.trim() || !newServerCommand.trim()) {
      setMcpError('Server name and command are required');
      return;
    }

    // Check if server name already exists
    if (parsedConfig.servers.some(server => server.name === newServerName.trim())) {
      setMcpError('Server name already exists');
      return;
    }

    const newServer: McpServerConfig = {
      id: newServerName.trim(),
      name: newServerName.trim(),
      enabled: true,
      command: newServerCommand.trim(),
      args: newServerArgs.trim() ? newServerArgs.split(',').map(arg => arg.trim()) : [],
      env: newServerEnv.trim() ? JSON.parse(newServerEnv) : {},
      description: newServerDescription.trim()
    };

    try {
      const updatedServers = [...parsedConfig.servers, newServer];
      syncListToJson(updatedServers);
      
      // Reset form
      setNewServerName('');
      setNewServerCommand('');
      setNewServerArgs('');
      setNewServerEnv('');
      setNewServerDescription('');
      setMcpError(null);
    } catch (error) {
      setMcpError('Invalid environment variables JSON');
    }
  };

  const handleEditServer = (serverId: string, updates: Partial<McpServerConfig>) => {
    const updatedServers = parsedConfig.servers.map(server =>
      server.id === serverId ? { ...server, ...updates } : server
    );
    syncListToJson(updatedServers);
  };

  const handleConfigureVibeKanban = async () => {
    if (!selectedMcpExecutor) return;

    try {
      // Parse existing configuration
      const existingConfig = mcpServers.trim() ? JSON.parse(mcpServers) : {};

      // Always use production MCP installation instructions
      const vibeKanbanConfig = {
        command: 'npx',
        args: ['-y', 'vibe-kanban', '--mcp'],
      };

      // Add vibe_kanban to the existing configuration
      let updatedConfig;
      if (selectedMcpExecutor === 'amp') {
        updatedConfig = {
          ...existingConfig,
          'amp.mcpServers': {
            ...(existingConfig['amp.mcpServers'] || {}),
            vibe_kanban: vibeKanbanConfig,
          },
        };
      } else {
        updatedConfig = {
          ...existingConfig,
          mcpServers: {
            ...(existingConfig.mcpServers || {}),
            vibe_kanban: vibeKanbanConfig,
          },
        };
      }

      // Update the textarea with the new configuration
      const configJson = JSON.stringify(updatedConfig, null, 2);
      setMcpServers(configJson);
      setMcpError(null);
    } catch (err) {
      setMcpError('Failed to configure vibe-kanban MCP server');
      console.error('Error configuring vibe-kanban:', err);
    }
  };

  const handleApplyMcpServers = async () => {
    if (!selectedMcpExecutor) return;

    setMcpApplying(true);
    setMcpError(null);

    try {
      // Validate and save MCP configuration
      if (mcpServers.trim()) {
        try {
          const fullConfig = JSON.parse(mcpServers);

          // Validate that the config has the expected structure based on executor type
          let mcpServersConfig;
          if (selectedMcpExecutor === 'amp') {
            if (
              !fullConfig['amp.mcpServers'] ||
              typeof fullConfig['amp.mcpServers'] !== 'object'
            ) {
              throw new Error(
                'AMP configuration must contain an "amp.mcpServers" object'
              );
            }
            // Extract just the inner servers object for the API - backend will handle nesting
            mcpServersConfig = fullConfig['amp.mcpServers'];
          } else {
            if (
              !fullConfig.mcpServers ||
              typeof fullConfig.mcpServers !== 'object'
            ) {
              throw new Error(
                'Configuration must contain an "mcpServers" object'
              );
            }
            // Extract just the mcpServers part for the API
            mcpServersConfig = fullConfig.mcpServers;
          }

          await mcpServersApi.save(selectedMcpExecutor, mcpServersConfig);

          // Show success feedback
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        } catch (mcpErr) {
          if (mcpErr instanceof SyntaxError) {
            setMcpError('Invalid JSON format');
          } else {
            setMcpError(
              mcpErr instanceof Error
                ? mcpErr.message
                : 'Failed to save MCP servers'
            );
          }
        }
      }
    } catch (err) {
      setMcpError('Failed to apply MCP server configuration');
      console.error('Error applying MCP servers:', err);
    } finally {
      setMcpApplying(false);
    }
  };

  if (!config) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>Failed to load configuration.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">MCP Servers</h1>
          <p className="text-muted-foreground">
            Configure MCP servers to extend executor capabilities.
          </p>
        </div>

        {mcpError && (
          <Alert variant="destructive">
            <AlertDescription>
              MCP Configuration Error: {mcpError}
            </AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <AlertDescription className="font-medium">
              ✓ MCP configuration saved successfully!
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              Configure MCP servers for different executors to extend their
              capabilities with custom tools and resources.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mcp-executor">Executor</Label>
              <Select
                value={selectedMcpExecutor}
                onValueChange={(value: string) => setSelectedMcpExecutor(value)}
              >
                <SelectTrigger id="mcp-executor">
                  <SelectValue placeholder="Select executor" />
                </SelectTrigger>
                <SelectContent>
                  {EXECUTOR_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {EXECUTOR_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Choose which executor to configure MCP servers for.
              </p>
            </div>

            {mcpError && mcpError.includes('does not support MCP') ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      MCP Not Supported
                    </h3>
                    <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                      <p>{mcpError}</p>
                      <p className="mt-1">
                        To use MCP servers, please select a different executor
                        (Claude, Amp, or Gemini) above.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* View Toggle */}
                <div className="flex items-center gap-2">
                  <Label>View Mode:</Label>
                  <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="h-8"
                    >
                      <List className="w-4 h-4 mr-1" />
                      List
                    </Button>
                    <Button
                      variant={viewMode === 'json' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('json')}
                      className="h-8"
                    >
                      <Code className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </div>
                </div>

                {viewMode === 'list' ? (
                  <div className="space-y-4">
                    {/* Server List */}
                    <div className="space-y-2">
                      <Label>MCP Servers</Label>
                      {mcpLoading ? (
                        <div className="flex items-center justify-center p-8">
                          <Loader2 className="w-6 h-6 animate-spin" />
                          <span className="ml-2">Loading servers...</span>
                        </div>
                      ) : parsedConfig.servers.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">
                          No MCP servers configured. Add one below to get started.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {parsedConfig.servers.map((server) => (
                            <Card key={server.id} className="p-4">
                              <div className="flex items-start gap-4">
                                <div className="flex items-center">
                                  <Checkbox
                                    checked={server.enabled}
                                    onCheckedChange={() => handleToggleServer(server.id)}
                                    className="mr-3"
                                  />
                                  {server.enabled ? (
                                    <Eye className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <EyeOff className="w-4 h-4 text-gray-400" />
                                  )}
                                </div>
                                
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium">{server.name}</h4>
                                    <Badge variant={server.enabled ? 'default' : 'secondary'}>
                                      {server.enabled ? 'Enabled' : 'Disabled'}
                                    </Badge>
                                  </div>
                                  
                                  <div className="space-y-1 text-sm text-muted-foreground">
                                    <div>
                                      <strong>Command:</strong> {server.command}
                                    </div>
                                    {server.args.length > 0 && (
                                      <div>
                                        <strong>Args:</strong> {server.args.join(', ')}
                                      </div>
                                    )}
                                    {server.description && (
                                      <div>
                                        <strong>Description:</strong> {server.description}
                                      </div>
                                    )}
                                    {server.env && Object.keys(server.env).length > 0 && (
                                      <div>
                                        <strong>Environment:</strong> {Object.keys(server.env).length} variables
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingServer(editingServer === server.id ? null : server.id)}
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteServer(server.id)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                              
                              {editingServer === server.id && (
                                <div className="mt-4 pt-4 border-t space-y-3">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label htmlFor={`edit-command-${server.id}`}>Command</Label>
                                      <Input
                                        id={`edit-command-${server.id}`}
                                        value={server.command}
                                        onChange={(e) => handleEditServer(server.id, { command: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`edit-args-${server.id}`}>Arguments (comma-separated)</Label>
                                      <Input
                                        id={`edit-args-${server.id}`}
                                        value={server.args.join(', ')}
                                        onChange={(e) => handleEditServer(server.id, { args: e.target.value.split(',').map(arg => arg.trim()) })}
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <Label htmlFor={`edit-description-${server.id}`}>Description</Label>
                                    <Input
                                      id={`edit-description-${server.id}`}
                                      value={server.description || ''}
                                      onChange={(e) => handleEditServer(server.id, { description: e.target.value })}
                                      placeholder="Optional description"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor={`edit-env-${server.id}`}>Environment Variables (JSON)</Label>
                                    <Textarea
                                      id={`edit-env-${server.id}`}
                                      value={JSON.stringify(server.env || {}, null, 2)}
                                      onChange={(e) => {
                                        try {
                                          const env = JSON.parse(e.target.value);
                                          handleEditServer(server.id, { env });
                                        } catch (error) {
                                          // Invalid JSON, ignore for now
                                        }
                                      }}
                                      className="font-mono text-sm"
                                      rows={3}
                                    />
                                  </div>
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Add New Server Form */}
                    <Separator />
                    <div className="space-y-3">
                      <Label>Add New Server</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="new-server-name">Server Name</Label>
                          <Input
                            id="new-server-name"
                            value={newServerName}
                            onChange={(e) => setNewServerName(e.target.value)}
                            placeholder="e.g., my-server"
                          />
                        </div>
                        <div>
                          <Label htmlFor="new-server-command">Command</Label>
                          <Input
                            id="new-server-command"
                            value={newServerCommand}
                            onChange={(e) => setNewServerCommand(e.target.value)}
                            placeholder="e.g., npx, node, python"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="new-server-args">Arguments (comma-separated)</Label>
                        <Input
                          id="new-server-args"
                          value={newServerArgs}
                          onChange={(e) => setNewServerArgs(e.target.value)}
                          placeholder="e.g., -y, package-name, --flag"
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-server-description">Description</Label>
                        <Input
                          id="new-server-description"
                          value={newServerDescription}
                          onChange={(e) => setNewServerDescription(e.target.value)}
                          placeholder="Optional description"
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-server-env">Environment Variables (JSON)</Label>
                        <Textarea
                          id="new-server-env"
                          value={newServerEnv}
                          onChange={(e) => setNewServerEnv(e.target.value)}
                          placeholder='{"KEY": "value"}'
                          className="font-mono text-sm"
                          rows={3}
                        />
                      </div>
                      <Button onClick={handleAddServer} className="w-full">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Server
                      </Button>
                    </div>

                    <div className="pt-4">
                      <Button
                        onClick={handleConfigureVibeKanban}
                        disabled={mcpApplying || mcpLoading || !selectedMcpExecutor}
                        variant="outline"
                        className="w-64"
                      >
                        Add Vibe-Kanban MCP
                      </Button>
                      <p className="text-sm text-muted-foreground mt-2">
                        Automatically adds the Vibe-Kanban MCP server.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="mcp-servers">MCP Server Configuration (JSON)</Label>
                    <Textarea
                      id="mcp-servers"
                      placeholder={
                        mcpLoading
                          ? 'Loading current configuration...'
                          : '{\n  "server-name": {\n    "command": "your-command",\n    "args": ["arg1", "arg2"]\n  }\n}'
                      }
                      value={mcpLoading ? 'Loading...' : mcpServers}
                      onChange={(e) => handleMcpServersChange(e.target.value)}
                      disabled={mcpLoading}
                      className="font-mono text-sm min-h-[300px]"
                    />
                    {mcpError && !mcpError.includes('does not support MCP') && (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {mcpError}
                      </p>
                    )}
                    <div className="text-sm text-muted-foreground">
                      {mcpLoading ? (
                        'Loading current MCP server configuration...'
                      ) : (
                        <span>
                          Changes will be saved to:
                          {mcpConfigPath && (
                            <span className="ml-2 font-mono text-xs">
                              {mcpConfigPath}
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="pt-4">
                      <Button
                        onClick={handleConfigureVibeKanban}
                        disabled={mcpApplying || mcpLoading || !selectedMcpExecutor}
                        variant="outline"
                        className="w-64"
                      >
                        Add Vibe-Kanban MCP
                      </Button>
                      <p className="text-sm text-muted-foreground mt-2">
                        Automatically adds the Vibe-Kanban MCP server.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sticky save button */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t p-4 z-10">
          <div className="container mx-auto max-w-4xl flex justify-end">
            <Button
              onClick={handleApplyMcpServers}
              disabled={mcpApplying || mcpLoading || !!mcpError || success}
              className={success ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {mcpApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {success && <span className="mr-2">✓</span>}
              {success ? 'Settings Saved!' : 'Save Settings'}
            </Button>
          </div>
        </div>

        {/* Spacer to prevent content from being hidden behind sticky button */}
        <div className="h-20"></div>
      </div>
    </div>
  );
}
