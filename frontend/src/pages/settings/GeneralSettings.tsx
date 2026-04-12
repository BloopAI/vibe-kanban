import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cloneDeep, merge, isEqual } from 'lodash';
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
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, Loader2, Volume2 } from 'lucide-react';
import {
  BaseCodingAgent,
  CodeFont,
  EditorType,
  ExecutorProfileId,
  ProseFont,
  SoundFile,
  ThemeMode,
  UiFont,
  UiLanguage,
} from 'shared/types';

// Font option arrays (since ts-rs generates string literal unions, not enums)
const UI_FONTS: UiFont[] = [
  'INTER',
  'ROBOTO',
  'PUBLIC_SANS',
  'CHIVO_MONO',
  'SYSTEM',
];
const CODE_FONTS: CodeFont[] = [
  'JET_BRAINS_MONO',
  'CASCADIA_MONO',
  'HACK',
  'IBM_PLEX_MONO',
  'CHIVO_MONO',
  'SYSTEM',
];
const PROSE_FONTS: ProseFont[] = [
  'INTER',
  'ROBOTO',
  'GEORGIA',
  'CHIVO_MONO',
  'SYSTEM',
];
import { getLanguageOptions } from '@/i18n/languages';

import { toPrettyCase } from '@/utils/string';
import { useEditorAvailability } from '@/hooks/useEditorAvailability';
import { EditorAvailabilityIndicator } from '@/components/EditorAvailabilityIndicator';
import { useAgentAvailability } from '@/hooks/useAgentAvailability';
import { AgentAvailabilityIndicator } from '@/components/AgentAvailabilityIndicator';
import { useTheme } from '@/components/ThemeProvider';
import { useUserSystem } from '@/components/ConfigProvider';
import { useFeedback } from '@/hooks/useFeedback';
import { useFonts } from '@/components/FontProvider';
import { TemplateManager } from '@/components/TemplateManager';
import { LabelManager } from '@/components/LabelManager';
import { FontPreview, BuildInfo } from '@/components/settings';
import {
  loadFont,
  getUiFontUrl,
  getCodeFontUrl,
  getProseFontUrl,
} from '@/lib/fonts';
import { useTerminalSettings } from '@/hooks/useTerminalSettings';

export function GeneralSettings() {
  const { t } = useTranslation(['settings', 'common']);

  // Get language options with proper display names
  const languageOptions = getLanguageOptions(
    t('language.browserDefault', {
      ns: 'common',
      defaultValue: 'Browser Default',
    })
  );
  const {
    config,
    loading,
    updateAndSaveConfig, // Use this on Save
    profiles,
    environment,
  } = useUserSystem();

  // Draft state management
  const [draft, setDraft] = useState(() => (config ? cloneDeep(config) : null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { success, showSuccess } = useFeedback();
  const [branchPrefixError, setBranchPrefixError] = useState<string | null>(
    null
  );
  const { setTheme } = useTheme();
  const { setFonts } = useFonts();

  // Check editor availability when draft editor changes
  const editorAvailability = useEditorAvailability(draft?.editor.editor_type);

  // Check agent availability when draft executor changes
  const agentAvailability = useAgentAvailability(
    draft?.executor_profile?.executor
  );

  // Terminal settings (stored in localStorage, separate from config)
  const {
    settings: terminalSettings,
    updateSettings: updateTerminalSettings,
    resetSettings: resetTerminalSettings,
  } = useTerminalSettings();

  const validateBranchPrefix = useCallback(
    (prefix: string): string | null => {
      if (!prefix) return null; // empty allowed
      if (prefix.includes('/'))
        return t('settings.general.git.branchPrefix.errors.slash');
      if (prefix.startsWith('.'))
        return t('settings.general.git.branchPrefix.errors.startsWithDot');
      if (prefix.endsWith('.') || prefix.endsWith('.lock'))
        return t('settings.general.git.branchPrefix.errors.endsWithDot');
      if (prefix.includes('..') || prefix.includes('@{'))
        return t('settings.general.git.branchPrefix.errors.invalidSequence');
      if (/[ \t~^:?*[\\]/.test(prefix))
        return t('settings.general.git.branchPrefix.errors.invalidChars');
      // Control chars check
      for (let i = 0; i < prefix.length; i++) {
        const code = prefix.charCodeAt(i);
        if (code < 0x20 || code === 0x7f)
          return t('settings.general.git.branchPrefix.errors.controlChars');
      }
      return null;
    },
    [t]
  );

  // When config loads or changes externally, update draft only if not dirty
  useEffect(() => {
    if (!config) return;
    if (!dirty) {
      setDraft(cloneDeep(config));
    }
  }, [config, dirty]);

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !config) return false;
    return !isEqual(draft, config);
  }, [draft, config]);

  // Generic draft update helper
  const updateDraft = useCallback(
    (patch: Partial<typeof config>) => {
      setDraft((prev: typeof config) => {
        if (!prev) return prev;
        const next = merge({}, prev, patch);
        // Mark dirty if changed
        if (!isEqual(next, config)) {
          setDirty(true);
        }
        return next;
      });
    },
    [config]
  );

  // Optional: warn on tab close/navigation with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const playSound = async (soundFile: SoundFile) => {
    const audio = new Audio(`/api/sounds/${soundFile}`);
    try {
      await audio.play();
    } catch (err) {
      console.error('Failed to play sound:', err);
    }
  };

  const handleSave = async () => {
    if (!draft) return;

    setSaving(true);
    setError(null);

    try {
      await updateAndSaveConfig(draft); // Atomically apply + persist
      setTheme(draft.theme);
      setFonts(draft.fonts);
      setDirty(false);
      showSuccess();
    } catch (err) {
      setError(t('settings.general.save.error'));
      console.error('Error saving config:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!config) return;
    setDraft(cloneDeep(config));
    setDirty(false);
  };

  const resetDisclaimer = async () => {
    if (!config) return;
    updateAndSaveConfig({ disclaimer_acknowledged: false });
  };

  const resetOnboarding = async () => {
    if (!config) return;
    updateAndSaveConfig({ onboarding_acknowledged: false });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">{t('settings.general.loading')}</span>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="py-8">
        <Alert variant="destructive">
          <AlertDescription>{t('settings.general.loadError')}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          <AlertDescription className="font-medium">
            {t('settings.general.save.success')}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.appearance.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.appearance.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme">
              {t('settings.general.appearance.theme.label')}
            </Label>
            <Select
              value={draft?.theme}
              onValueChange={(value: ThemeMode) =>
                updateDraft({ theme: value })
              }
            >
              <SelectTrigger id="theme">
                <SelectValue
                  placeholder={t(
                    'settings.general.appearance.theme.placeholder'
                  )}
                />
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
              {t('settings.general.appearance.theme.helper')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="language">
              {t('settings.general.appearance.language.label')}
            </Label>
            <Select
              value={draft?.language}
              onValueChange={(value: UiLanguage) =>
                updateDraft({ language: value })
              }
            >
              <SelectTrigger id="language">
                <SelectValue
                  placeholder={t(
                    'settings.general.appearance.language.placeholder'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {languageOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.general.appearance.language.helper')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Typography Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.fonts.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.fonts.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ui-font">
              {t('settings.general.fonts.uiFont.label')}
            </Label>
            <Select
              value={draft?.fonts.ui_font}
              onValueChange={(value: UiFont) => {
                // Preload the font when selected
                loadFont(getUiFontUrl(value));
                updateDraft({
                  fonts: { ...draft.fonts, ui_font: value },
                });
              }}
            >
              <SelectTrigger id="ui-font">
                <SelectValue
                  placeholder={t('settings.general.fonts.uiFont.placeholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {UI_FONTS.map((font) => (
                  <SelectItem key={font} value={font}>
                    {t(
                      `settings.general.fonts.fontNames.${
                        font === 'INTER'
                          ? 'inter'
                          : font === 'ROBOTO'
                            ? 'roboto'
                            : font === 'PUBLIC_SANS'
                              ? 'publicSans'
                              : font === 'CHIVO_MONO'
                                ? 'chivoMono'
                                : 'system'
                      }`
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.general.fonts.uiFont.helper')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="code-font">
              {t('settings.general.fonts.codeFont.label')}
            </Label>
            <Select
              value={draft?.fonts.code_font}
              onValueChange={(value: CodeFont) => {
                // Preload the font when selected
                loadFont(getCodeFontUrl(value));
                updateDraft({
                  fonts: { ...draft.fonts, code_font: value },
                });
              }}
            >
              <SelectTrigger id="code-font">
                <SelectValue
                  placeholder={t('settings.general.fonts.codeFont.placeholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {CODE_FONTS.map((font) => (
                  <SelectItem key={font} value={font}>
                    {t(
                      `settings.general.fonts.fontNames.${
                        font === 'JET_BRAINS_MONO'
                          ? 'jetBrainsMono'
                          : font === 'CASCADIA_MONO'
                            ? 'cascadiaMono'
                            : font === 'HACK'
                              ? 'hack'
                              : font === 'IBM_PLEX_MONO'
                                ? 'ibmPlexMono'
                                : font === 'CHIVO_MONO'
                                  ? 'chivoMono'
                                  : 'system'
                      }`
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.general.fonts.codeFont.helper')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prose-font">
              {t('settings.general.fonts.proseFont.label')}
            </Label>
            <Select
              value={draft?.fonts.prose_font}
              onValueChange={(value: ProseFont) => {
                // Preload the font when selected
                loadFont(getProseFontUrl(value));
                updateDraft({
                  fonts: { ...draft.fonts, prose_font: value },
                });
              }}
            >
              <SelectTrigger id="prose-font">
                <SelectValue
                  placeholder={t(
                    'settings.general.fonts.proseFont.placeholder'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {PROSE_FONTS.map((font) => (
                  <SelectItem key={font} value={font}>
                    {t(
                      `settings.general.fonts.fontNames.${
                        font === 'INTER'
                          ? 'inter'
                          : font === 'ROBOTO'
                            ? 'roboto'
                            : font === 'GEORGIA'
                              ? 'georgia'
                              : font === 'CHIVO_MONO'
                                ? 'chivoMono'
                                : 'system'
                      }`
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.general.fonts.proseFont.helper')}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="disable-ligatures"
              checked={draft?.fonts.disable_ligatures}
              onCheckedChange={(checked: boolean) =>
                updateDraft({
                  fonts: {
                    ...draft.fonts,
                    disable_ligatures: checked,
                  },
                })
              }
            />
            <div className="space-y-0.5">
              <Label htmlFor="disable-ligatures" className="cursor-pointer">
                {t('settings.general.fonts.disableLigatures.label')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.general.fonts.disableLigatures.helper')}
              </p>
            </div>
          </div>

          {draft?.fonts && <FontPreview fonts={draft.fonts} />}
        </CardContent>
      </Card>

      {/* Dev Banner Settings - only show when in dev mode */}
      {environment?.is_dev_mode && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.general.devBanner.title')}</CardTitle>
            <CardDescription>
              {t('settings.general.devBanner.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dev-banner-bg-color">
                {t('settings.general.devBanner.backgroundColor.label')}
              </Label>
              <Input
                id="dev-banner-bg-color"
                type="text"
                placeholder={t(
                  'settings.general.devBanner.backgroundColor.placeholder'
                )}
                value={draft?.dev_banner?.background_color || ''}
                onChange={(e) =>
                  updateDraft({
                    dev_banner: {
                      ...draft.dev_banner,
                      background_color: e.target.value || null,
                    },
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                {t('settings.general.devBanner.backgroundColor.helper')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dev-banner-fg-color">
                {t('settings.general.devBanner.foregroundColor.label')}
              </Label>
              <Input
                id="dev-banner-fg-color"
                type="text"
                placeholder={t(
                  'settings.general.devBanner.foregroundColor.placeholder'
                )}
                value={draft?.dev_banner?.foreground_color || ''}
                onChange={(e) =>
                  updateDraft({
                    dev_banner: {
                      ...draft.dev_banner,
                      foreground_color: e.target.value || null,
                    },
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                {t('settings.general.devBanner.foregroundColor.helper')}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="dev-banner-show-hostname"
                checked={draft?.dev_banner?.show_hostname ?? false}
                onCheckedChange={(checked: boolean) =>
                  updateDraft({
                    dev_banner: {
                      ...draft.dev_banner,
                      show_hostname: checked,
                    },
                  })
                }
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor="dev-banner-show-hostname"
                  className="cursor-pointer"
                >
                  {t('settings.general.devBanner.showHostname.label')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.general.devBanner.showHostname.helper')}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="dev-banner-show-os-info"
                checked={draft?.dev_banner?.show_os_info ?? false}
                onCheckedChange={(checked: boolean) =>
                  updateDraft({
                    dev_banner: {
                      ...draft.dev_banner,
                      show_os_info: checked,
                    },
                  })
                }
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor="dev-banner-show-os-info"
                  className="cursor-pointer"
                >
                  {t('settings.general.devBanner.showOsInfo.label')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.general.devBanner.showOsInfo.helper')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.taskExecution.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.taskExecution.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="executor">
              {t('settings.general.taskExecution.executor.label')}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={draft?.executor_profile?.executor ?? ''}
                onValueChange={(value: string) => {
                  const variants = profiles?.[value];
                  const keepCurrentVariant =
                    variants &&
                    draft?.executor_profile?.variant &&
                    variants[draft.executor_profile.variant];

                  const newProfile: ExecutorProfileId = {
                    executor: value as BaseCodingAgent,
                    variant: keepCurrentVariant
                      ? draft.executor_profile!.variant
                      : null,
                  };
                  updateDraft({
                    executor_profile: newProfile,
                  });
                }}
                disabled={!profiles}
              >
                <SelectTrigger id="executor">
                  <SelectValue
                    placeholder={t(
                      'settings.general.taskExecution.executor.placeholder'
                    )}
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

              {/* Show variant selector if selected profile has variants */}
              {(() => {
                const currentProfileVariant = draft?.executor_profile;
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
                            {currentProfileVariant?.variant ||
                              t('settings.general.taskExecution.defaultLabel')}
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
                                updateDraft({
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
                        {t('settings.general.taskExecution.defaultLabel')}
                      </span>
                    </Button>
                  );
                }
                return null;
              })()}
            </div>
            <AgentAvailabilityIndicator availability={agentAvailability} />
            <p className="text-sm text-muted-foreground">
              {t('settings.general.taskExecution.executor.helper')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.editor.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.editor.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="editor-type">
              {t('settings.general.editor.type.label')}
            </Label>
            <Select
              value={draft?.editor.editor_type}
              onValueChange={(value: EditorType) =>
                updateDraft({
                  editor: { ...draft.editor, editor_type: value },
                })
              }
            >
              <SelectTrigger id="editor-type">
                <SelectValue
                  placeholder={t('settings.general.editor.type.placeholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {Object.values(EditorType).map((editor) => (
                  <SelectItem key={editor} value={editor}>
                    {toPrettyCase(editor)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Editor availability status indicator */}
            {draft?.editor.editor_type !== EditorType.CUSTOM && (
              <EditorAvailabilityIndicator availability={editorAvailability} />
            )}

            <p className="text-sm text-muted-foreground">
              {t('settings.general.editor.type.helper')}
            </p>
          </div>

          {draft?.editor.editor_type === EditorType.CUSTOM && (
            <div className="space-y-2">
              <Label htmlFor="custom-command">
                {t('settings.general.editor.customCommand.label')}
              </Label>
              <Input
                id="custom-command"
                placeholder={t(
                  'settings.general.editor.customCommand.placeholder'
                )}
                value={draft?.editor.custom_command || ''}
                onChange={(e) =>
                  updateDraft({
                    editor: {
                      ...draft.editor,
                      custom_command: e.target.value || null,
                    },
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                {t('settings.general.editor.customCommand.helper')}
              </p>
            </div>
          )}

          {(draft?.editor.editor_type === EditorType.VS_CODE ||
            draft?.editor.editor_type === EditorType.CURSOR ||
            draft?.editor.editor_type === EditorType.WINDSURF) && (
            <>
              <div className="space-y-2">
                <Label htmlFor="remote-ssh-host">
                  {t('settings.general.editor.remoteSsh.host.label')}
                </Label>
                <Input
                  id="remote-ssh-host"
                  placeholder={t(
                    'settings.general.editor.remoteSsh.host.placeholder'
                  )}
                  value={draft?.editor.remote_ssh_host || ''}
                  onChange={(e) =>
                    updateDraft({
                      editor: {
                        ...draft.editor,
                        remote_ssh_host: e.target.value || null,
                      },
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  {t('settings.general.editor.remoteSsh.host.helper')}
                </p>
              </div>

              {draft?.editor.remote_ssh_host && (
                <div className="space-y-2">
                  <Label htmlFor="remote-ssh-user">
                    {t('settings.general.editor.remoteSsh.user.label')}
                  </Label>
                  <Input
                    id="remote-ssh-user"
                    placeholder={t(
                      'settings.general.editor.remoteSsh.user.placeholder'
                    )}
                    value={draft?.editor.remote_ssh_user || ''}
                    onChange={(e) =>
                      updateDraft({
                        editor: {
                          ...draft.editor,
                          remote_ssh_user: e.target.value || null,
                        },
                      })
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('settings.general.editor.remoteSsh.user.helper')}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.terminal.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.terminal.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="terminal-font-size">
              {t('settings.general.terminal.fontSize.label')}
            </Label>
            <Select
              value={String(terminalSettings.fontSize)}
              onValueChange={(value: string) =>
                updateTerminalSettings({ fontSize: Number(value) })
              }
            >
              <SelectTrigger id="terminal-font-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10px</SelectItem>
                <SelectItem value="12">12px</SelectItem>
                <SelectItem value="14">14px (default)</SelectItem>
                <SelectItem value="16">16px</SelectItem>
                <SelectItem value="18">18px</SelectItem>
                <SelectItem value="20">20px</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.general.terminal.fontSize.helper')}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="terminal-cursor-blink"
              checked={terminalSettings.cursorBlink}
              onCheckedChange={(checked: boolean) =>
                updateTerminalSettings({ cursorBlink: checked })
              }
            />
            <div className="space-y-0.5">
              <Label htmlFor="terminal-cursor-blink" className="cursor-pointer">
                {t('settings.general.terminal.cursorBlink.label')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.general.terminal.cursorBlink.helper')}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={resetTerminalSettings}>
              {t('settings.general.terminal.reset')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timestamps Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.timestamps.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.timestamps.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="timezone">
              {t('settings.general.timestamps.timezone.label')}
            </Label>
            <Select
              value={draft?.timestamps?.timezone ?? 'LOCAL'}
              onValueChange={(value: string) =>
                updateDraft({
                  timestamps: {
                    ...draft.timestamps,
                    timezone: value,
                  },
                })
              }
            >
              <SelectTrigger id="timezone">
                <SelectValue
                  placeholder={t(
                    'settings.general.timestamps.timezone.placeholder'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOCAL">
                  {t('settings.general.timestamps.timezone.local')}
                </SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="America/New_York">
                  America/New_York (EST/EDT)
                </SelectItem>
                <SelectItem value="America/Chicago">
                  America/Chicago (CST/CDT)
                </SelectItem>
                <SelectItem value="America/Denver">
                  America/Denver (MST/MDT)
                </SelectItem>
                <SelectItem value="America/Los_Angeles">
                  America/Los_Angeles (PST/PDT)
                </SelectItem>
                <SelectItem value="Europe/London">
                  Europe/London (GMT/BST)
                </SelectItem>
                <SelectItem value="Europe/Paris">
                  Europe/Paris (CET/CEST)
                </SelectItem>
                <SelectItem value="Europe/Berlin">
                  Europe/Berlin (CET/CEST)
                </SelectItem>
                <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                <SelectItem value="Asia/Shanghai">
                  Asia/Shanghai (CST)
                </SelectItem>
                <SelectItem value="Asia/Seoul">Asia/Seoul (KST)</SelectItem>
                <SelectItem value="Asia/Singapore">
                  Asia/Singapore (SGT)
                </SelectItem>
                <SelectItem value="Australia/Sydney">
                  Australia/Sydney (AEST/AEDT)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.general.timestamps.timezone.helper')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.git.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.git.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="git-branch-prefix">
              {t('settings.general.git.branchPrefix.label')}
            </Label>
            <Input
              id="git-branch-prefix"
              type="text"
              placeholder={t('settings.general.git.branchPrefix.placeholder')}
              value={draft?.git_branch_prefix ?? ''}
              onChange={(e) => {
                const value = e.target.value.trim();
                updateDraft({ git_branch_prefix: value });
                setBranchPrefixError(validateBranchPrefix(value));
              }}
              aria-invalid={!!branchPrefixError}
              className={branchPrefixError ? 'border-destructive' : undefined}
            />
            {branchPrefixError && (
              <p className="text-sm text-destructive">{branchPrefixError}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {t('settings.general.git.branchPrefix.helper')}{' '}
              {draft?.git_branch_prefix ? (
                <>
                  {t('settings.general.git.branchPrefix.preview')}{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    {t('settings.general.git.branchPrefix.previewWithPrefix', {
                      prefix: draft.git_branch_prefix,
                    })}
                  </code>
                </>
              ) : (
                <>
                  {t('settings.general.git.branchPrefix.preview')}{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    {t('settings.general.git.branchPrefix.previewNoPrefix')}
                  </code>
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.notifications.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.notifications.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="sound-enabled"
              checked={draft?.notifications.sound_enabled}
              onCheckedChange={(checked: boolean) =>
                updateDraft({
                  notifications: {
                    ...draft.notifications,
                    sound_enabled: checked,
                  },
                })
              }
            />
            <div className="space-y-0.5">
              <Label htmlFor="sound-enabled" className="cursor-pointer">
                {t('settings.general.notifications.sound.label')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.general.notifications.sound.helper')}
              </p>
            </div>
          </div>
          {draft?.notifications.sound_enabled && (
            <div className="ml-6 space-y-2">
              <Label htmlFor="sound-file">
                {t('settings.general.notifications.sound.fileLabel')}
              </Label>
              <div className="flex gap-2">
                <Select
                  value={draft.notifications.sound_file}
                  onValueChange={(value: SoundFile) =>
                    updateDraft({
                      notifications: {
                        ...draft.notifications,
                        sound_file: value,
                      },
                    })
                  }
                >
                  <SelectTrigger id="sound-file" className="flex-1">
                    <SelectValue
                      placeholder={t(
                        'settings.general.notifications.sound.filePlaceholder'
                      )}
                    />
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
                  onClick={() => playSound(draft.notifications.sound_file)}
                  className="px-3"
                >
                  <Volume2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('settings.general.notifications.sound.fileHelper')}
              </p>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="push-notifications"
              checked={draft?.notifications.push_enabled}
              onCheckedChange={(checked: boolean) =>
                updateDraft({
                  notifications: {
                    ...draft.notifications,
                    push_enabled: checked,
                  },
                })
              }
            />
            <div className="space-y-0.5">
              <Label htmlFor="push-notifications" className="cursor-pointer">
                {t('settings.general.notifications.push.label')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.general.notifications.push.helper')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.performance.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.performance.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="initial-load">
              {t('settings.general.performance.initialLoad.label')}
            </Label>
            <Select
              value={String(draft?.pagination?.initial_load ?? 100)}
              onValueChange={(value: string) =>
                updateDraft({
                  pagination: {
                    ...draft.pagination,
                    initial_load: BigInt(value),
                  },
                })
              }
            >
              <SelectTrigger id="initial-load">
                <SelectValue
                  placeholder={t(
                    'settings.general.performance.initialLoad.option100'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">
                  {t('settings.general.performance.initialLoad.option50')}
                </SelectItem>
                <SelectItem value="100">
                  {t('settings.general.performance.initialLoad.option100')}
                </SelectItem>
                <SelectItem value="200">
                  {t('settings.general.performance.initialLoad.option200')}
                </SelectItem>
                <SelectItem value="500">
                  {t('settings.general.performance.initialLoad.option500')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.general.performance.initialLoad.helper')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.taskTemplates.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.taskTemplates.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateManager />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.labels.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.labels.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LabelManager />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.safety.title')}</CardTitle>
          <CardDescription>
            {t('settings.general.safety.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {t('settings.general.safety.disclaimer.title')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('settings.general.safety.disclaimer.description')}
              </p>
            </div>
            <Button variant="outline" onClick={resetDisclaimer}>
              {t('settings.general.safety.disclaimer.button')}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {t('settings.general.safety.onboarding.title')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('settings.general.safety.onboarding.description')}
              </p>
            </div>
            <Button variant="outline" onClick={resetOnboarding}>
              {t('settings.general.safety.onboarding.button')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Build Info */}
      <BuildInfo />

      {/* Sticky Save Button */}
      <div className="sticky bottom-0 z-10 bg-background/80 backdrop-blur-sm border-t py-4">
        <div className="flex items-center justify-between">
          {hasUnsavedChanges ? (
            <span className="text-sm text-muted-foreground">
              {t('settings.general.save.unsavedChanges')}
            </span>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDiscard}
              disabled={!hasUnsavedChanges || saving}
            >
              {t('settings.general.save.discard')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || saving || !!branchPrefixError}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('settings.general.save.button')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
