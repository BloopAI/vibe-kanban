import { useCallback, useState, useEffect } from 'react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { JSONEditor } from '@/components/ui/json-editor';
import { ChevronDown, Key, Loader2, Volume2 } from 'lucide-react';
import { ThemeMode, EditorType, SoundFile } from 'shared/types';
import type { ExecutorProfileId } from 'shared/types';

import { toPrettyCase } from '@/utils/string';
import { useTheme } from '@/components/theme-provider';
import { useUserSystem } from '@/components/config-provider';
import { GitHubLoginDialog } from '@/components/GitHubLoginDialog';
import { TaskTemplateManager } from '@/components/TaskTemplateManager';
import { profilesApi } from '@/lib/api';

export function Settings() {
  const {
    config,
    updateConfig,
    saveConfig,
    loading,
    updateAndSaveConfig,
    profiles,
    reloadSystem,
  } = useUserSystem();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { setTheme } = useTheme();
  const [showGitHubLogin, setShowGitHubLogin] = useState(false);

  // Profiles editor state
  const [profilesContent, setProfilesContent] = useState('');
  const [profilesPath, setProfilesPath] = useState('');
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesSaving, setProfilesSaving] = useState(false);
  const [profilesSuccess, setProfilesSuccess] = useState(false);

  // Load profiles content on mount
  useEffect(() => {
    const loadProfiles = async () => {
      setProfilesLoading(true);
      try {
        const result = await profilesApi.load();
        setProfilesContent(result.content);
        setProfilesPath(result.path);
      } catch (err) {
        console.error('Failed to load profiles:', err);
        setProfilesError('Failed to load profiles');
      } finally {
        setProfilesLoading(false);
      }
    };
    loadProfiles();
  }, []);

  const playSound = async (soundFile: SoundFile) => {
    const audio = new Audio(`/api/sounds/${soundFile}`);
    try {
      await audio.play();
    } catch (err) {
      console.error('Failed to play sound:', err);
    }
  };

  const handleProfilesChange = (value: string) => {
    setProfilesContent(value);
    setProfilesError(null);

    // Validate JSON on change
    if (value.trim()) {
      try {
        const parsed = JSON.parse(value);
        // Basic structure validation
        if (!parsed.executors) {
          setProfilesError('Invalid structure: must have a "executors" object');
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          setProfilesError('Invalid JSON format');
        } else {
          setProfilesError('Validation error');
        }
      }
    }
  };

  const handleSaveProfiles = async () => {
    setProfilesSaving(true);
    setProfilesError(null);
    setProfilesSuccess(false);

    try {
      await profilesApi.save(profilesContent);
      // Reload the system to get the updated profiles
      await reloadSystem();
      setProfilesSuccess(true);
      setTimeout(() => setProfilesSuccess(false), 3000);
    } catch (err: any) {
      setProfilesError(err.message || 'Failed to save profiles');
    } finally {
      setProfilesSaving(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Save the main configuration
      const success = await saveConfig();

      if (success) {
        setSuccess(true);
        // Update theme provider to reflect the saved theme
        setTheme(config.theme);

        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError('Failed to save configuration');
      }
    } catch (err) {
      setError('Failed to save configuration');
      console.error('Error saving config:', err);
    } finally {
      setSaving(false);
    }
  };

  const resetDisclaimer = async () => {
    if (!config) return;

    updateConfig({ disclaimer_acknowledged: false });
  };

  const resetOnboarding = async () => {
    if (!config) return;

    updateConfig({ onboarding_acknowledged: false });
  };

  const isAuthenticated = !!(
    config?.github?.username && config?.github?.oauth_token
  );

  const handleLogout = useCallback(async () => {
    if (!config) return;
    updateAndSaveConfig({
      github: {
        ...config.github,
        oauth_token: null,
        username: null,
        primary_email: null,
      },
    });
  }, [config, updateAndSaveConfig]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading settings...</span>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>Failed to load settings. {error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Configure your preferences and application settings.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <AlertDescription className="font-medium">
              ✓ Settings saved successfully!
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize how the application looks and feels.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="theme">Theme</Label>
                <Select
                  value={config.theme}
                  onValueChange={(value: ThemeMode) => {
                    updateConfig({ theme: value });
                    setTheme(value);
                  }}
                >
                  <SelectTrigger id="theme">
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ThemeMode).map((theme) => (
                      <SelectItem key={theme} value={theme}>
                        {toPrettyCase(theme)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Choose your preferred color scheme.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Task Execution</CardTitle>
              <CardDescription>
                Configure how tasks are executed and processed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="executor">Default Executor Profile</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={config.executor_profile?.executor ?? ''}
                    onValueChange={(value: string) => {
                      const newProfile: ExecutorProfileId = {
                        executor: value,
                        variant: null,
                      };
                      updateConfig({
                        executor_profile: newProfile,
                      });
                    }}
                  >
                    <SelectTrigger id="executor">
                      <SelectValue placeholder="Select profile" />
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

                  {/* Show variant selector if selected profile has variants */}
                  {(() => {
                    const currentProfileVariant = config.executor_profile;
                    const selectedProfile =
                      profiles?.[currentProfileVariant?.executor || ''];
                    const hasVariants =
                      selectedProfile &&
                      Object.keys(selectedProfile).length > 0;

                    if (hasVariants) {
                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full h-10 px-2 flex items-center justify-between"
                            >
                              <span className="text-sm truncate flex-1 text-left">
                                {currentProfileVariant?.variant || 'DEFAULT'}
                              </span>
                              <ChevronDown className="h-4 w-4 ml-1 flex-shrink-0" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {Object.entries(selectedProfile).map(
                              ([variantLabel]) => (
                                <DropdownMenuItem
                                  key={variantLabel}
                                  onClick={() => {
                                    const newProfile: ExecutorProfileId = {
                                      executor:
                                        currentProfileVariant?.executor || '',
                                      variant: variantLabel,
                                    };
                                    updateConfig({
                                      executor_profile: newProfile,
                                    });
                                  }}
                                  className={
                                    currentProfileVariant?.variant ===
                                    variantLabel
                                      ? 'bg-accent'
                                      : ''
                                  }
                                >
                                  {variantLabel}
                                </DropdownMenuItem>
                              )
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    } else if (selectedProfile) {
                      // Show disabled button when profile exists but has no variants
                      return (
                        <Button
                          variant="outline"
                          className="w-full h-10 px-2 flex items-center justify-between"
                          disabled
                        >
                          <span className="text-sm truncate flex-1 text-left">
                            Default
                          </span>
                        </Button>
                      );
                    }
                    return null;
                  })()}
                </div>
                <p className="text-sm text-muted-foreground">
                  Choose the default executor profile to use when creating a
                  task attempt.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Editor</CardTitle>
              <CardDescription>
                Configure which editor to open when viewing task attempts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editor">Preferred Editor</Label>
                <Select
                  value={config.editor.editor_type}
                  onValueChange={(value: EditorType) =>
                    updateConfig({
                      editor: {
                        ...config.editor,
                        editor_type: value,
                        custom_command:
                          value === EditorType.CUSTOM
                            ? config.editor.custom_command
                            : null,
                      },
                    })
                  }
                >
                  <SelectTrigger id="editor">
                    <SelectValue placeholder="Select editor" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(EditorType).map((type) => (
                      <SelectItem key={type} value={type}>
                        {toPrettyCase(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Choose your preferred code editor for opening task attempts.
                </p>
              </div>

              {config.editor.editor_type === EditorType.CUSTOM && (
                <div className="space-y-2">
                  <Label htmlFor="custom-command">Custom Command</Label>
                  <Input
                    id="custom-command"
                    placeholder="e.g., code, subl, vim"
                    value={config.editor.custom_command || ''}
                    onChange={(e) =>
                      updateConfig({
                        editor: {
                          ...config.editor,
                          custom_command: e.target.value || null,
                        },
                      })
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the command to run your custom editor. Use spaces for
                    arguments (e.g., "code --wait").
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                GitHub Integration
              </CardTitle>
              <CardDescription>
                Configure GitHub settings for creating pull requests from task
                attempts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="github-token">Personal Access Token</Label>
                <Input
                  id="github-token"
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={config.github.pat || ''}
                  onChange={(e) =>
                    updateConfig({
                      github: {
                        ...config.github,
                        pat: e.target.value || null,
                      },
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  GitHub Personal Access Token with 'repo' permissions. Required
                  for creating pull requests.{' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Create token here
                  </a>
                </p>
              </div>
              {config && isAuthenticated ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Signed in as</Label>
                    <div className="text-lg font-mono">
                      {config.github.username}
                    </div>
                  </div>
                  <Button variant="outline" onClick={handleLogout}>
                    Log out
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setShowGitHubLogin(true)}>
                  Sign in with GitHub
                </Button>
              )}
              <GitHubLoginDialog
                open={showGitHubLogin}
                onOpenChange={setShowGitHubLogin}
              />
              <div className="space-y-2 pt-4">
                <Label htmlFor="default-pr-base">Default PR Base Branch</Label>
                <Input
                  id="default-pr-base"
                  placeholder="main"
                  value={config.github.default_pr_base || ''}
                  onChange={(e) =>
                    updateConfig({
                      github: {
                        ...config.github,
                        default_pr_base: e.target.value || null,
                      },
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Default base branch for pull requests. Defaults to 'main' if
                  not specified.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Configure how you receive notifications about task completion.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sound-alerts"
                  checked={config.notifications.sound_enabled}
                  onCheckedChange={(checked: boolean) =>
                    updateConfig({
                      notifications: {
                        ...config.notifications,
                        sound_enabled: checked,
                      },
                    })
                  }
                />
                <div className="space-y-0.5">
                  <Label htmlFor="sound-alerts" className="cursor-pointer">
                    Sound Alerts
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Play a sound when task attempts finish running.
                  </p>
                </div>
              </div>

              {config.notifications.sound_enabled && (
                <div className="space-y-2 ml-6">
                  <Label htmlFor="sound-file">Sound</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={config.notifications.sound_file}
                      onValueChange={(value: SoundFile) =>
                        updateConfig({
                          notifications: {
                            ...config.notifications,
                            sound_file: value,
                          },
                        })
                      }
                    >
                      <SelectTrigger id="sound-file" className="flex-1">
                        <SelectValue placeholder="Select sound" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(SoundFile).map((soundFile) => (
                          <SelectItem key={soundFile} value={soundFile}>
                            {toPrettyCase(soundFile)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => playSound(config.notifications.sound_file)}
                      className="px-3"
                    >
                      <Volume2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Choose the sound to play when tasks complete. Click the
                    volume button to preview.
                  </p>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="push-notifications"
                  checked={config.notifications.push_enabled}
                  onCheckedChange={(checked: boolean) =>
                    updateConfig({
                      notifications: {
                        ...config.notifications,
                        push_enabled: checked,
                      },
                    })
                  }
                />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="push-notifications"
                    className="cursor-pointer"
                  >
                    Push Notifications
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Show system notifications when task attempts finish running.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Privacy</CardTitle>
              <CardDescription>
                Help improve Vibe-Kanban by sharing anonymous usage data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="analytics-enabled"
                  checked={config.analytics_enabled ?? false}
                  onCheckedChange={(checked: boolean) =>
                    updateConfig({ analytics_enabled: checked })
                  }
                />
                <div className="space-y-0.5">
                  <Label htmlFor="analytics-enabled" className="cursor-pointer">
                    Enable Telemetry
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Enables anonymous usage events tracking to help improve the
                    application. No prompts or project information are
                    collected.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Task Templates</CardTitle>
              <CardDescription>
                Manage global task templates that can be used across all
                projects.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TaskTemplateManager isGlobal={true} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Agent Profiles
              </CardTitle>
              <CardDescription>
                Configure coding agent profiles with specific command-line
                parameters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profilesError && (
                <Alert variant="destructive">
                  <AlertDescription>{profilesError}</AlertDescription>
                </Alert>
              )}

              {profilesSuccess && (
                <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                  <AlertDescription className="font-medium">
                    ✓ Profiles saved successfully!
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profiles-editor">
                    Profiles Configuration
                  </Label>
                  <JSONEditor
                    id="profiles-editor"
                    placeholder={
                      profilesLoading
                        ? 'Loading profiles...'
                        : '{\n  "profiles": [\n    {\n      "label": "my-custom-profile",\n      "agent": "ClaudeCode",\n      "command": {...}\n    }\n  ]\n}'
                    }
                    value={profilesLoading ? 'Loading...' : profilesContent}
                    onChange={handleProfilesChange}
                    disabled={profilesLoading}
                    minHeight={300}
                  />
                </div>

                <div className="space-y-2">
                  {!profilesError && profilesPath && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Configuration file:</span>{' '}
                      <span className="font-mono text-xs">{profilesPath}</span>
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Edit coding agent profiles. Each profile needs a unique
                    label, agent type, and command configuration.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSaveProfiles}
                    disabled={
                      profilesSaving ||
                      profilesLoading ||
                      !!profilesError ||
                      profilesSuccess
                    }
                    className={
                      profilesSuccess ? 'bg-green-600 hover:bg-green-700' : ''
                    }
                  >
                    {profilesSaving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {profilesSuccess && <span className="mr-2">✓</span>}
                    {profilesSuccess ? 'Profiles Saved!' : 'Save Profiles'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Safety & Disclaimers</CardTitle>
              <CardDescription>
                Manage safety warnings and acknowledgments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Disclaimer Status</Label>
                    <p className="text-sm text-muted-foreground">
                      {config.disclaimer_acknowledged
                        ? 'You have acknowledged the safety disclaimer.'
                        : 'The safety disclaimer has not been acknowledged.'}
                    </p>
                  </div>
                  <Button
                    onClick={resetDisclaimer}
                    variant="outline"
                    size="sm"
                    disabled={!config.disclaimer_acknowledged}
                  >
                    Reset Disclaimer
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Resetting the disclaimer will require you to acknowledge the
                  safety warning again.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Onboarding Status</Label>
                    <p className="text-sm text-muted-foreground">
                      {config.onboarding_acknowledged
                        ? 'You have completed the onboarding process.'
                        : 'The onboarding process has not been completed.'}
                    </p>
                  </div>
                  <Button
                    onClick={resetOnboarding}
                    variant="outline"
                    size="sm"
                    disabled={!config.onboarding_acknowledged}
                  >
                    Reset Onboarding
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Resetting the onboarding will show the setup screen again.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Telemetry Acknowledgment</Label>
                    <p className="text-sm text-muted-foreground">
                      {config.telemetry_acknowledged
                        ? 'You have acknowledged the telemetry notice.'
                        : 'The telemetry notice has not been acknowledged.'}
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      updateConfig({ telemetry_acknowledged: false })
                    }
                    variant="outline"
                    size="sm"
                    disabled={!config.telemetry_acknowledged}
                  >
                    Reset Acknowledgment
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Resetting the acknowledgment will require you to acknowledge
                  the telemetry notice again.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sticky save button */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t p-4 z-10">
          <div className="container mx-auto max-w-4xl flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving || success}
              className={success ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
