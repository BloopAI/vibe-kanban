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
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Key, Loader2, Volume2, Globe } from 'lucide-react';
import type { EditorType, SoundFile, ThemeMode } from 'shared/types';
import {
  EDITOR_LABELS,
  EDITOR_TYPES,
  EXECUTOR_LABELS,
  EXECUTOR_TYPES,
  SOUND_FILES,
  SOUND_LABELS,
} from 'shared/types';
import { useTheme } from '@/components/theme-provider';
import { useConfig } from '@/components/config-provider';
import { GitHubLoginDialog } from '@/components/GitHubLoginDialog';
import { TaskTemplateManager } from '@/components/TaskTemplateManager';
import { useTranslation, LANGUAGE_LABELS, type Language } from '@/lib/i18n';

export function Settings() {
  const { config, updateConfig, saveConfig, loading, updateAndSaveConfig } =
    useConfig();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { setTheme } = useTheme();
  const [showGitHubLogin, setShowGitHubLogin] = useState(false);
  const { t, currentLanguage, setLanguage } = useTranslation();

  const playSound = async (soundFile: SoundFile) => {
    const audio = new Audio(`/api/sounds/${soundFile}.wav`);
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

  const isAuthenticated = !!(config?.github?.username && config?.github?.token);

  const handleLogout = useCallback(async () => {
    if (!config) return;
    updateAndSaveConfig({
      github: {
        ...config.github,
        token: null,
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
          <span className="ml-2">{t('settings.loading')}</span>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>{t('settings.failed')} {error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
          <p className="text-muted-foreground">
            {t('settings.subtitle')}
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
              {t('settings.saved')}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                {t('settings.language.title')}
              </CardTitle>
              <CardDescription>
                {t('settings.language.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="language">{t('settings.language.language')}</Label>
                <Select
                  value={currentLanguage}
                  onValueChange={(value: Language) => setLanguage(value)}
                >
                  <SelectTrigger id="language">
                    <SelectValue placeholder={t('settings.language.languagePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {t('settings.language.languageDescription')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.appearance.title')}</CardTitle>
              <CardDescription>
                {t('settings.appearance.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="theme">{t('settings.appearance.theme')}</Label>
                <Select
                  value={config.theme}
                  onValueChange={(value: ThemeMode) => {
                    updateConfig({ theme: value });
                    setTheme(value);
                  }}
                >
                  <SelectTrigger id="theme">
                    <SelectValue placeholder={t('settings.appearance.themePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t('settings.appearance.themes.light')}</SelectItem>
                    <SelectItem value="dark">{t('settings.appearance.themes.dark')}</SelectItem>
                    <SelectItem value="system">{t('settings.appearance.themes.system')}</SelectItem>
                    <SelectItem value="purple">{t('settings.appearance.themes.purple')}</SelectItem>
                    <SelectItem value="green">{t('settings.appearance.themes.green')}</SelectItem>
                    <SelectItem value="blue">{t('settings.appearance.themes.blue')}</SelectItem>
                    <SelectItem value="orange">{t('settings.appearance.themes.orange')}</SelectItem>
                    <SelectItem value="red">{t('settings.appearance.themes.red')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {t('settings.appearance.themeDescription')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.taskExecution.title')}</CardTitle>
              <CardDescription>
                {t('settings.taskExecution.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="executor">{t('settings.taskExecution.executor')}</Label>
                <Select
                  value={config.executor.type}
                  onValueChange={(value: 'echo' | 'claude' | 'amp') =>
                    updateConfig({ executor: { type: value } })
                  }
                >
                  <SelectTrigger id="executor">
                    <SelectValue placeholder={t('settings.taskExecution.executorPlaceholder')} />
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
                  {t('settings.taskExecution.executorDescription')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.editor.title')}</CardTitle>
              <CardDescription>
                {t('settings.editor.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editor">{t('settings.editor.editor')}</Label>
                <Select
                  value={config.editor.editor_type}
                  onValueChange={(value: EditorType) =>
                    updateConfig({
                      editor: {
                        ...config.editor,
                        editor_type: value,
                        custom_command:
                          value === 'custom'
                            ? config.editor.custom_command
                            : null,
                      },
                    })
                  }
                >
                  <SelectTrigger id="editor">
                    <SelectValue placeholder={t('settings.editor.editorPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {EDITOR_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {EDITOR_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {t('settings.editor.editorDescription')}
                </p>
              </div>

              {config.editor.editor_type === 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="custom-command">{t('settings.editor.customCommand')}</Label>
                  <Input
                    id="custom-command"
                    placeholder={t('settings.editor.customCommandPlaceholder')}
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
                    {t('settings.editor.customCommandDescription')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                {t('settings.github.title')}
              </CardTitle>
              <CardDescription>
                {t('settings.github.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="github-token">{t('settings.github.token')}</Label>
                <Input
                  id="github-token"
                  type="password"
                  placeholder={t('settings.github.tokenPlaceholder')}
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
                  {t('settings.github.tokenDescription')}{' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {t('settings.github.createToken')}
                  </a>
                </p>
              </div>
              {config && isAuthenticated ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>{t('settings.github.signedInAs')}</Label>
                    <div className="text-lg font-mono">
                      {config.github.username}
                    </div>
                  </div>
                  <Button variant="outline" onClick={handleLogout}>
                    {t('settings.github.logOut')}
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setShowGitHubLogin(true)}>
                  {t('settings.github.signIn')}
                </Button>
              )}
              <GitHubLoginDialog
                open={showGitHubLogin}
                onOpenChange={setShowGitHubLogin}
              />
              <div className="space-y-2 pt-4">
                <Label htmlFor="default-pr-base">{t('settings.github.defaultPrBase')}</Label>
                <Input
                  id="default-pr-base"
                  placeholder={t('settings.github.defaultPrBasePlaceholder')}
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
                  {t('settings.github.defaultPrBaseDescription')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.notifications.title')}</CardTitle>
              <CardDescription>
                {t('settings.notifications.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sound-alerts"
                  checked={config.sound_alerts}
                  onCheckedChange={(checked: boolean) =>
                    updateConfig({ sound_alerts: checked })
                  }
                />
                <div className="space-y-0.5">
                  <Label htmlFor="sound-alerts" className="cursor-pointer">
                    {t('settings.notifications.soundAlerts')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.notifications.soundAlertsDescription')}
                  </p>
                </div>
              </div>

              {config.sound_alerts && (
                <div className="space-y-2 ml-6">
                  <Label htmlFor="sound-file">{t('settings.notifications.sound')}</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={config.sound_file}
                      onValueChange={(value: SoundFile) =>
                        updateConfig({ sound_file: value })
                      }
                    >
                      <SelectTrigger id="sound-file" className="flex-1">
                        <SelectValue placeholder={t('settings.notifications.soundPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {SOUND_FILES.map((soundFile) => (
                          <SelectItem key={soundFile} value={soundFile}>
                            {SOUND_LABELS[soundFile]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => playSound(config.sound_file)}
                      className="px-3"
                    >
                      <Volume2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.notifications.soundDescription')}
                  </p>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="push-notifications"
                  checked={config.push_notifications}
                  onCheckedChange={(checked: boolean) =>
                    updateConfig({ push_notifications: checked })
                  }
                />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="push-notifications"
                    className="cursor-pointer"
                  >
                    {t('settings.notifications.pushNotifications')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.notifications.pushNotificationsDescription')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.privacy.title')}</CardTitle>
              <CardDescription>
                {t('settings.privacy.subtitle')}
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
                    {t('settings.privacy.enableTelemetry')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.privacy.telemetryDescription')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.taskTemplates.title')}</CardTitle>
              <CardDescription>
                {t('settings.taskTemplates.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TaskTemplateManager isGlobal={true} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.safety.title')}</CardTitle>
              <CardDescription>
                {t('settings.safety.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('settings.safety.disclaimerStatus')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {config.disclaimer_acknowledged
                        ? t('settings.safety.disclaimerAcknowledged')
                        : t('settings.safety.disclaimerNotAcknowledged')}
                    </p>
                  </div>
                  <Button
                    onClick={resetDisclaimer}
                    variant="outline"
                    size="sm"
                    disabled={!config.disclaimer_acknowledged}
                  >
                    {t('settings.safety.resetDisclaimer')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.safety.resetDisclaimerDescription')}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('settings.safety.onboardingStatus')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {config.onboarding_acknowledged
                        ? t('settings.safety.onboardingCompleted')
                        : t('settings.safety.onboardingNotCompleted')}
                    </p>
                  </div>
                  <Button
                    onClick={resetOnboarding}
                    variant="outline"
                    size="sm"
                    disabled={!config.onboarding_acknowledged}
                  >
                    {t('settings.safety.resetOnboarding')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.safety.resetOnboardingDescription')}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('settings.safety.telemetryAcknowledgment')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {config.telemetry_acknowledged
                        ? t('settings.safety.telemetryAcknowledged')
                        : t('settings.safety.telemetryNotAcknowledged')}
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
                    {t('settings.safety.resetAcknowledgment')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.safety.resetAcknowledgmentDescription')}
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
              {success ? t('settings.saving') : t('settings.save')}
            </Button>
          </div>
        </div>

        {/* Spacer to prevent content from being hidden behind sticky button */}
        <div className="h-20"></div>
      </div>
    </div>
  );
}
