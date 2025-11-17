import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { JSONEditor } from '@/components/ui/json-editor';
import { Loader2 } from 'lucide-react';
import type { BaseCodingAgent, ExecutorConfig } from 'shared/types';
import { McpConfig } from 'shared/types';
import { useUserSystem } from '@/components/config-provider';
import { mcpServersApi } from '@/lib/api';
import { McpConfigStrategyGeneral } from '@/lib/mcp-strategies';

export function McpSettings() {
  const { t } = useTranslation('settings');
  const { config, profiles } = useUserSystem();
  const [mcpServers, setMcpServers] = useState('{}');
  const [mcpConfig, setMcpConfig] = useState<McpConfig | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<ExecutorConfig | null>(
    null
  );
  const [mcpApplying, setMcpApplying] = useState(false);
  const [mcpConfigPath, setMcpConfigPath] = useState<string>('');
  const [success, setSuccess] = useState(false);

  // Initialize selected profile when config loads
  useEffect(() => {
    if (config?.executor_profile && profiles && !selectedProfile) {
      // Find the current profile
      const currentProfile = profiles[config.executor_profile.executor];
      if (currentProfile) {
        setSelectedProfile(currentProfile);
      } else if (Object.keys(profiles).length > 0) {
        // Default to first profile if current profile not found
        setSelectedProfile(Object.values(profiles)[0]);
      }
    }
  }, [config?.executor_profile, profiles, selectedProfile]);

  // Load existing MCP configuration when selected profile changes
  useEffect(() => {
    const loadMcpServersForProfile = async (profile: ExecutorConfig) => {
      // Reset state when loading
      setMcpLoading(true);
      setMcpError(null);
      // Set default empty config based on agent type using strategy
      setMcpConfigPath('');

      try {
        // Load MCP servers for the selected profile/agent
        // Find the key for this profile
        const profileKey = profiles
          ? Object.keys(profiles).find((key) => profiles[key] === profile)
          : null;
        if (!profileKey) {
          throw new Error('Profile key not found');
        }

        const result = await mcpServersApi.load({
          executor: profileKey as BaseCodingAgent,
        });
        // Store the McpConfig from backend
        setMcpConfig(result.mcp_config);
        // Create the full configuration structure using the schema
        const fullConfig = McpConfigStrategyGeneral.createFullConfig(
          result.mcp_config
        );
        const configJson = JSON.stringify(fullConfig, null, 2);
        setMcpServers(configJson);
        setMcpConfigPath(result.config_path);
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

    // Load MCP servers for the selected profile
    if (selectedProfile) {
      loadMcpServersForProfile(selectedProfile);
    }
  }, [selectedProfile, profiles]);

  const handleMcpServersChange = (value: string) => {
    setMcpServers(value);
    setMcpError(null);

    // Validate JSON on change
    if (value.trim() && mcpConfig) {
      try {
        const parsedConfig = JSON.parse(value);
        // Validate using the schema path from backend
        McpConfigStrategyGeneral.validateFullConfig(mcpConfig, parsedConfig);
      } catch (err) {
        if (err instanceof SyntaxError) {
          setMcpError(t('settings.mcp.errors.invalidJson'));
        } else {
          setMcpError(
            err instanceof Error
              ? err.message
              : t('settings.mcp.errors.validationError')
          );
        }
      }
    }
  };

  const handleApplyMcpServers = async () => {
    if (!selectedProfile || !mcpConfig) return;

    setMcpApplying(true);
    setMcpError(null);

    try {
      // Validate and save MCP configuration
      if (mcpServers.trim()) {
        try {
          const fullConfig = JSON.parse(mcpServers);
          McpConfigStrategyGeneral.validateFullConfig(mcpConfig, fullConfig);
          const mcpServersConfig =
            McpConfigStrategyGeneral.extractServersForApi(
              mcpConfig,
              fullConfig
            );

          // Find the key for the selected profile
          const selectedProfileKey = profiles
            ? Object.keys(profiles).find(
                (key) => profiles[key] === selectedProfile
              )
            : null;
          if (!selectedProfileKey) {
            throw new Error('Selected profile key not found');
          }

          await mcpServersApi.save(
            {
              executor: selectedProfileKey as BaseCodingAgent,
            },
            { servers: mcpServersConfig }
          );

          // Show success feedback
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        } catch (mcpErr) {
          if (mcpErr instanceof SyntaxError) {
            setMcpError(t('settings.mcp.errors.invalidJson'));
          } else {
            setMcpError(
              mcpErr instanceof Error
                ? mcpErr.message
                : t('settings.mcp.errors.saveFailed')
            );
          }
        }
      }
    } catch (err) {
      setMcpError(t('settings.mcp.errors.applyFailed'));
      console.error('Error applying MCP servers:', err);
    } finally {
      setMcpApplying(false);
    }
  };

  const addServer = (key: string) => {
    try {
      const existing = mcpServers.trim() ? JSON.parse(mcpServers) : {};
      const updated = McpConfigStrategyGeneral.addPreconfiguredToConfig(
        mcpConfig!,
        existing,
        key
      );
      setMcpServers(JSON.stringify(updated, null, 2));
      setMcpError(null);
    } catch (err) {
      console.error(err);
      setMcpError(
        err instanceof Error
          ? err.message
          : t('settings.mcp.errors.addServerFailed')
      );
    }
  };

  const preconfigured = (mcpConfig?.preconfigured ?? {}) as Record<string, any>;
  const meta = (preconfigured.meta ?? {}) as Record<
    string,
    { name?: string; description?: string; url?: string; icon?: string }
  >;
  const servers = Object.fromEntries(
    Object.entries(preconfigured).filter(([k]) => k !== 'meta')
  ) as Record<string, any>;
  const getMetaFor = (key: string) => meta[key] || {};

  if (!config) {
    return (
      <div className="py-8">
        <Alert variant="destructive">
          <AlertDescription>
            {t('settings.mcp.errors.loadFailed')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mcpError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('settings.mcp.errors.mcpError', { error: mcpError })}
          </AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          <AlertDescription className="font-medium">
            {t('settings.mcp.save.successMessage')}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.mcp.title')}</CardTitle>
          <CardDescription>{t('settings.mcp.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mcp-executor">
              {t('settings.mcp.labels.agent')}
            </Label>
            <Select
              value={
                selectedProfile
                  ? Object.keys(profiles || {}).find(
                      (key) => profiles![key] === selectedProfile
                    ) || ''
                  : ''
              }
              onValueChange={(value: string) => {
                const profile = profiles?.[value];
                if (profile) setSelectedProfile(profile);
              }}
            >
              <SelectTrigger id="mcp-executor">
                <SelectValue
                  placeholder={t('settings.mcp.labels.agentPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {profiles &&
                  Object.entries(profiles)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([profileKey]) => (
                      <SelectItem key={profileKey} value={profileKey}>
                        {profileKey}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.mcp.labels.agentHelper')}
            </p>
          </div>

          {mcpError && mcpError.includes('does not support MCP') ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {t('settings.mcp.errors.notSupported')}
                  </h3>
                  <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                    <p>{mcpError}</p>
                    <p className="mt-1">
                      {t('settings.mcp.errors.supportMessage')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="mcp-servers">
                {t('settings.mcp.labels.serverConfig')}
              </Label>
              <JSONEditor
                id="mcp-servers"
                placeholder={
                  mcpLoading
                    ? t('settings.mcp.save.loading')
                    : '{\n  "server-name": {\n    "type": "stdio",\n    "command": "your-command",\n    "args": ["arg1", "arg2"]\n  }\n}'
                }
                value={
                  mcpLoading ? t('settings.mcp.loading.jsonEditor') : mcpServers
                }
                onChange={handleMcpServersChange}
                disabled={mcpLoading}
                minHeight={300}
              />
              {mcpError && !mcpError.includes('does not support MCP') && (
                <p className="text-sm text-destructive dark:text-red-400">
                  {mcpError}
                </p>
              )}
              <div className="text-sm text-muted-foreground">
                {mcpLoading ? (
                  t('settings.mcp.loading.configuration')
                ) : (
                  <span>
                    {t('settings.mcp.labels.saveLocation')}
                    {mcpConfigPath && (
                      <span className="ml-2 font-mono text-xs">
                        {mcpConfigPath}
                      </span>
                    )}
                  </span>
                )}
              </div>

              {mcpConfig?.preconfigured &&
                typeof mcpConfig.preconfigured === 'object' && (
                  <div className="pt-4">
                    <Label>{t('settings.mcp.labels.popularServers')}</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      {t('settings.mcp.labels.serverHelper')}
                    </p>

                    <div className="relative overflow-hidden rounded-xl border bg-background">
                      <Carousel className="w-full px-4 py-3">
                        <CarouselContent className="gap-3 justify-center">
                          {Object.entries(servers).map(([key]) => {
                            const metaObj = getMetaFor(key) as {
                              name?: string;
                              description?: string;
                              url?: string;
                              icon?: string;
                            };
                            const name = metaObj.name || key;
                            const description =
                              metaObj.description || 'No description';
                            const icon = metaObj.icon
                              ? `/${metaObj.icon}`
                              : null;

                            return (
                              <CarouselItem
                                key={name}
                                className="sm:basis-1/3 lg:basis-1/4"
                              >
                                <button
                                  type="button"
                                  onClick={() => addServer(key)}
                                  aria-label={`Add ${name} to config`}
                                  className="group w-full text-left outline-none"
                                >
                                  <Card className="h-32 rounded-xl border hover:shadow-md transition">
                                    <CardHeader className="pb-0">
                                      <div className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-lg border bg-muted grid place-items-center overflow-hidden">
                                          {icon ? (
                                            <img
                                              src={icon}
                                              alt=""
                                              className="w-full h-full object-cover"
                                            />
                                          ) : (
                                            <span className="font-semibold">
                                              {name.slice(0, 1).toUpperCase()}
                                            </span>
                                          )}
                                        </div>
                                        <CardTitle className="text-base font-medium truncate">
                                          {name}
                                        </CardTitle>
                                      </div>
                                    </CardHeader>

                                    <CardContent className="pt-2 px-4">
                                      <p className="text-sm text-muted-foreground line-clamp-3">
                                        {description}
                                      </p>
                                    </CardContent>
                                  </Card>
                                </button>
                              </CarouselItem>
                            );
                          })}
                        </CarouselContent>

                        <CarouselPrevious className="left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border bg-background/80 shadow-sm backdrop-blur hover:bg-background" />
                        <CarouselNext className="right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border bg-background/80 shadow-sm backdrop-blur hover:bg-background" />
                      </Carousel>
                    </div>
                  </div>
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky Save Button */}
      <div className="sticky bottom-0 z-10 bg-background/80 backdrop-blur-sm border-t py-4">
        <div className="flex justify-end">
          <Button
            onClick={handleApplyMcpServers}
            disabled={mcpApplying || mcpLoading || !!mcpError || success}
          >
            {mcpApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {success && <span className="mr-2">✓</span>}
            {success
              ? t('settings.mcp.save.success')
              : t('settings.mcp.save.button')}
          </Button>
        </div>
      </div>
    </div>
  );
}
