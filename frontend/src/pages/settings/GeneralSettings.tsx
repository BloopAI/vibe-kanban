import { useCallback, useState } from 'react';
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
import { ChevronDown, Key, Loader2, Volume2 } from 'lucide-react';
import {
  ThemeMode,
  EditorType,
  SoundFile,
  ExecutorProfileId,
  BaseCodingAgent,
} from 'shared/types';

import { toPrettyCase } from '@/utils/string';
import { useTheme } from '@/components/theme-provider';
import { useUserSystem } from '@/components/config-provider';
import { GitHubLoginDialog } from '@/components/GitHubLoginDialog';
import { TaskTemplateManager } from '@/components/TaskTemplateManager';

export function GeneralSettings() {
  const {
    config,
    updateConfig,
    saveConfig,
    loading,
    updateAndSaveConfig,
    profiles,
  } = useUserSystem();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { setTheme } = useTheme();
  const [showGitHubLogin, setShowGitHubLogin] = useState(false);

  const playSound = async (soundFile: SoundFile) => {
    const audio = new Audio(`/api/sounds/${soundFile}`);
    try {
      await audio.play();
    } catch (err) {
      console.error('Failed to play sound:', err);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const success = await saveConfig();

      if (success) {
        setSuccess(true);
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
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading settings...</span>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="py-8">
        <Alert variant="destructive">
          <AlertDescription>Failed to load configuration.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
              onValueChange={(value: ThemeMode) =>
                updateConfig({ theme: value })
              }
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
            <Label htmlFor="executor">Default Agent Configuration</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={config.executor_profile?.executor ?? ''}
                onValueChange={(value: string) => {
                  const variants = profiles?.[value];
                  const keepCurrentVariant =
                    variants &&
                    config.executor_profile?.variant &&
                    variants[config.executor_profile.variant];

                  const newProfile: ExecutorProfileId = {
                    executor: value as BaseCodingAgent,
                    variant: keepCurrentVariant
                      ? config.executor_profile!.variant
                      : null,
                  };
                  updateConfig({
                    executor_profile: newProfile,
                  });
                }}
                disabled={!profiles}
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
                  selectedProfile && Object.keys(selectedProfile).length > 0;

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
                                  executor: currentProfileVariant!.executor,
                                  variant: variantLabel,
                                };
                                updateConfig({
                                  executor_profile: newProfile,
                                });
                              }}
                              className={
                                currentProfileVariant?.variant === variantLabel
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
              Choose the default agent configuration to use when creating a task
              attempt.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editor</CardTitle>
          <CardDescription>
            Configure your code editing experience.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="editor-type">Editor Type</Label>
            <Select
              value={config.editor.editor_type}
              onValueChange={(value: EditorType) =>
                updateConfig({
                  editor: { ...config.editor, editor_type: value },
                })
              }
            >
              <SelectTrigger id="editor-type">
                <SelectValue placeholder="Select editor" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(EditorType).map((editor) => (
                  <SelectItem key={editor} value={editor}>
                    {toPrettyCase(editor)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Choose your preferred code editor interface.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            GitHub Integration
          </CardTitle>
          <CardDescription>
            Connect your GitHub account to enable advanced features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAuthenticated ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">
                    Connected as {config.github.username}
                  </p>
                  {config.github.primary_email && (
                    <p className="text-sm text-muted-foreground">
                      {config.github.primary_email}
                    </p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Manage <ChevronDown className="ml-1 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleLogout}>
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your GitHub account to access private repositories and
                enable advanced Git operations.
              </p>
              <Button onClick={() => setShowGitHubLogin(true)}>
                Connect GitHub Account
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Control when and how you receive notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="sound-enabled"
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
              <Label htmlFor="sound-enabled" className="cursor-pointer">
                Sound Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Play a sound when task attempts finish running.
              </p>
            </div>
          </div>
          {config.notifications.sound_enabled && (
            <div className="ml-6 space-y-2">
              <Label htmlFor="sound-file">Sound</Label>
              <div className="flex gap-2">
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
                Choose the sound to play when tasks complete. Click the volume
                button to preview.
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
              <Label htmlFor="push-notifications" className="cursor-pointer">
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
                application. No prompts or project information are collected.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Task Templates</CardTitle>
          <CardDescription>
            Manage global task templates that can be used across all projects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaskTemplateManager isGlobal={true} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Safety & Disclaimers</CardTitle>
          <CardDescription>
            Reset acknowledgments for safety warnings and onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Disclaimer Acknowledgment</p>
              <p className="text-sm text-muted-foreground">
                Reset the safety disclaimer to show it again on next startup.
              </p>
            </div>
            <Button variant="outline" onClick={resetDisclaimer}>
              Reset
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Onboarding</p>
              <p className="text-sm text-muted-foreground">
                Reset the onboarding flow to show it again on next startup.
              </p>
            </div>
            <Button variant="outline" onClick={resetOnboarding}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sticky Save Button */}
      <div className="sticky bottom-0 z-10 bg-background/80 backdrop-blur-sm border-t pt-4">
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </div>

      <GitHubLoginDialog
        open={showGitHubLogin}
        onOpenChange={(open) => setShowGitHubLogin(open)}
      />
    </div>
  );
}
