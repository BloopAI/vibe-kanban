import { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';
import { EXECUTOR_TYPES, EXECUTOR_LABELS } from 'shared/types';
import { useConfig } from '@/components/config-provider';
import { mcpServersApi } from '../lib/api';

export function McpServers() {
  const { config } = useConfig();
  const [mcpServers, setMcpServers] = useState('{}');
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [selectedMcpExecutor, setSelectedMcpExecutor] = useState<string>('');
  const [mcpApplying, setMcpApplying] = useState(false);
  const [mcpConfigPath, setMcpConfigPath] = useState<string>('');
  const [success, setSuccess] = useState(false);

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
          : executorType === 'sst-opencode'
            ? '{\n  "mcp": {\n  }, "$schema": "https://opencode.ai/config.json"\n}'
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
        } else if (executorType === 'sst-opencode') {
          fullConfig = {
            mcp: servers,
            $schema: 'https://opencode.ai/config.json',
          };
        } else {
          // For other executors, use the standard mcpServers structure
          fullConfig = { mcpServers: servers };
        }

        const configJson = JSON.stringify(fullConfig, null, 2);
        setMcpServers(configJson);
        setMcpConfigPath(configPath);
      } catch (err: any) {
        if (err?.message && err.message.includes('does not support MCP')) {
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
        } else if (selectedMcpExecutor === 'sst-opencode') {
          if (!config.mcp || typeof config.mcp !== 'object') {
            setMcpError('Configuration must contain an "mcp" object');
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

  const handleConfigureVibeKanban = async () => {
    if (!selectedMcpExecutor) return;

    try {
      // Parse existing configuration
      const existingConfig = mcpServers.trim() ? JSON.parse(mcpServers) : {};

      // Always use production MCP installation instructions
      const vibeKanbanConfig =
        selectedMcpExecutor === 'sst-opencode'
          ? {
              type: 'local',
              command: ['npx', '-y', 'vibe-kanban', '--mcp'],
              enabled: true,
            }
          : {
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
      } else if (selectedMcpExecutor === 'sst-opencode') {
        updatedConfig = {
          ...existingConfig,
          mcp: {
            ...(existingConfig.mcp || {}),
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
          } else if (selectedMcpExecutor === 'sst-opencode') {
            if (!fullConfig.mcp || typeof fullConfig.mcp !== 'object') {
              throw new Error('Configuration must contain an "mcp" object');
            }
            // Extract just the mcp part for the API
            mcpServersConfig = fullConfig.mcp;
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
              <div className="space-y-2">
                <Label htmlFor="mcp-servers">MCP Server Configuration</Label>
                <Textarea
                  id="mcp-servers"
                  placeholder={
                    mcpLoading
                      ? 'Loading current configuration...'
                      : '{\n  "server-name": {\n    "type": "stdio",\n    "command": "your-command",\n    "args": ["arg1", "arg2"]\n  }\n}'
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
