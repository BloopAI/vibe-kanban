import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cloneDeep, merge, isEqual } from 'lodash';
import {
  SpinnerIcon,
  SpeakerHighIcon,
  CheckIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import {
  DEFAULT_PR_DESCRIPTION_PROMPT,
  EditorType,
  SoundFile,
  ThemeMode,
  UiLanguage,
} from 'shared/types';
import { getLanguageOptions } from '@/i18n/languages';
import { toPrettyCase } from '@/utils/string';
import {
  useEditorAvailability,
  type EditorAvailabilityState,
} from '@/hooks/useEditorAvailability';
import { useTheme } from '@/components/ThemeProvider';
import { useUserSystem } from '@/components/ConfigProvider';
import { TagManager } from '@/components/TagManager';
import { cn } from '@/lib/utils';
import { PrimaryButton } from '../../primitives/PrimaryButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuTriggerButton,
} from '../../primitives/Dropdown';
import { IconButton } from '../../primitives/IconButton';

// Reusable components for settings
function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium text-high">{title}</h3>
        {description && <p className="text-sm text-low mt-1">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SettingsField({
  label,
  description,
  error,
  children,
}: {
  label: string;
  description?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-normal">{label}</label>
      )}
      {children}
      {error && <p className="text-sm text-error">{error}</p>}
      {description && !error && (
        <p className="text-sm text-low">{description}</p>
      )}
    </div>
  );
}

function SettingsCheckbox({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border bg-secondary text-brand focus:ring-brand focus:ring-offset-0"
      />
      <div className="space-y-0.5">
        <label
          htmlFor={id}
          className="text-sm font-medium text-normal cursor-pointer"
        >
          {label}
        </label>
        {description && <p className="text-sm text-low">{description}</p>}
      </div>
    </div>
  );
}

function SettingsSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  placeholder?: string;
}) {
  const selectedOption = options.find((opt) => opt.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <DropdownMenuTriggerButton
          label={selectedOption?.label || placeholder}
          className="w-full justify-between"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SettingsInput({
  value,
  onChange,
  placeholder,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full bg-secondary border rounded-sm px-base py-half text-base text-high',
        'placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand',
        error ? 'border-error' : 'border-border'
      )}
    />
  );
}

function SettingsTextarea({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        'w-full min-h-[100px] bg-secondary border border-border rounded-sm px-base py-half text-base text-high',
        'placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand',
        'resize-y',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    />
  );
}

function EditorAvailabilityIndicator({
  availability,
}: {
  availability: EditorAvailabilityState;
}) {
  if (availability === null) {
    return null;
  }

  if (availability === 'checking') {
    return (
      <div className="flex items-center gap-2 text-sm text-low">
        <SpinnerIcon className="size-icon-xs animate-spin" />
        <span>Checking availability...</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm',
        availability === 'available' ? 'text-success' : 'text-warning'
      )}
    >
      {availability === 'available' ? (
        <>
          <CheckIcon className="size-icon-xs" weight="bold" />
          <span>Editor available</span>
        </>
      ) : (
        <>
          <WarningIcon className="size-icon-xs" weight="bold" />
          <span>Editor not found</span>
        </>
      )}
    </div>
  );
}

export function GeneralSettingsSection() {
  const { t } = useTranslation(['settings', 'common']);

  const languageOptions = getLanguageOptions(
    t('language.browserDefault', {
      ns: 'common',
      defaultValue: 'Browser Default',
    })
  );
  const { config, loading, updateAndSaveConfig } = useUserSystem();

  const [draft, setDraft] = useState(() => (config ? cloneDeep(config) : null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [branchPrefixError, setBranchPrefixError] = useState<string | null>(
    null
  );
  const { setTheme } = useTheme();

  const editorAvailability = useEditorAvailability(draft?.editor.editor_type);

  const validateBranchPrefix = useCallback(
    (prefix: string): string | null => {
      if (!prefix) return null;
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
      for (let i = 0; i < prefix.length; i++) {
        const code = prefix.charCodeAt(i);
        if (code < 0x20 || code === 0x7f)
          return t('settings.general.git.branchPrefix.errors.controlChars');
      }
      return null;
    },
    [t]
  );

  useEffect(() => {
    if (!config) return;
    if (!dirty) {
      setDraft(cloneDeep(config));
    }
  }, [config, dirty]);

  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !config) return false;
    return !isEqual(draft, config);
  }, [draft, config]);

  const updateDraft = useCallback(
    (patch: Partial<typeof config>) => {
      setDraft((prev: typeof config) => {
        if (!prev) return prev;
        const next = merge({}, prev, patch);
        if (!isEqual(next, config)) {
          setDirty(true);
        }
        return next;
      });
    },
    [config]
  );

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
    setSuccess(false);

    try {
      await updateAndSaveConfig(draft);
      setTheme(draft.theme);
      setDirty(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
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
      <div className="flex items-center justify-center py-8 gap-2">
        <SpinnerIcon
          className="size-icon-lg animate-spin text-brand"
          weight="bold"
        />
        <span className="text-normal">{t('settings.general.loading')}</span>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="py-8">
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {t('settings.general.loadError')}
        </div>
      </div>
    );
  }

  const themeOptions = Object.values(ThemeMode).map((theme) => ({
    value: theme,
    label: toPrettyCase(theme),
  }));

  const editorOptions = Object.values(EditorType).map((editor) => ({
    value: editor,
    label: toPrettyCase(editor),
  }));

  const soundOptions = Object.values(SoundFile).map((sound) => ({
    value: sound,
    label: toPrettyCase(sound),
  }));

  return (
    <>
      {/* Status messages */}
      {error && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success/10 border border-success/50 rounded-sm p-4 text-success font-medium">
          {t('settings.general.save.success')}
        </div>
      )}

      {/* Appearance */}
      <SettingsCard
        title={t('settings.general.appearance.title')}
        description={t('settings.general.appearance.description')}
      >
        <SettingsField
          label={t('settings.general.appearance.theme.label')}
          description={t('settings.general.appearance.theme.helper')}
        >
          <SettingsSelect
            value={draft?.theme}
            options={themeOptions}
            onChange={(value) => updateDraft({ theme: value })}
            placeholder={t('settings.general.appearance.theme.placeholder')}
          />
        </SettingsField>

        <SettingsField
          label={t('settings.general.appearance.language.label')}
          description={t('settings.general.appearance.language.helper')}
        >
          <SettingsSelect
            value={draft?.language}
            options={languageOptions}
            onChange={(value: UiLanguage) => updateDraft({ language: value })}
            placeholder={t('settings.general.appearance.language.placeholder')}
          />
        </SettingsField>
      </SettingsCard>

      {/* Editor */}
      <SettingsCard
        title={t('settings.general.editor.title')}
        description={t('settings.general.editor.description')}
      >
        <SettingsField
          label={t('settings.general.editor.type.label')}
          description={t('settings.general.editor.type.helper')}
        >
          <SettingsSelect
            value={draft?.editor.editor_type}
            options={editorOptions}
            onChange={(value: EditorType) =>
              updateDraft({
                editor: { ...draft!.editor, editor_type: value },
              })
            }
            placeholder={t('settings.general.editor.type.placeholder')}
          />
          {draft?.editor.editor_type !== EditorType.CUSTOM && (
            <EditorAvailabilityIndicator availability={editorAvailability} />
          )}
        </SettingsField>

        {draft?.editor.editor_type === EditorType.CUSTOM && (
          <SettingsField
            label={t('settings.general.editor.customCommand.label')}
            description={t('settings.general.editor.customCommand.helper')}
          >
            <SettingsInput
              value={draft?.editor.custom_command || ''}
              onChange={(value) =>
                updateDraft({
                  editor: {
                    ...draft!.editor,
                    custom_command: value || null,
                  },
                })
              }
              placeholder={t(
                'settings.general.editor.customCommand.placeholder'
              )}
            />
          </SettingsField>
        )}

        {(draft?.editor.editor_type === EditorType.VS_CODE ||
          draft?.editor.editor_type === EditorType.CURSOR ||
          draft?.editor.editor_type === EditorType.WINDSURF ||
          draft?.editor.editor_type === EditorType.GOOGLE_ANTIGRAVITY ||
          draft?.editor.editor_type === EditorType.ZED) && (
          <>
            <SettingsField
              label={t('settings.general.editor.remoteSsh.host.label')}
              description={t('settings.general.editor.remoteSsh.host.helper')}
            >
              <SettingsInput
                value={draft?.editor.remote_ssh_host || ''}
                onChange={(value) =>
                  updateDraft({
                    editor: {
                      ...draft!.editor,
                      remote_ssh_host: value || null,
                    },
                  })
                }
                placeholder={t(
                  'settings.general.editor.remoteSsh.host.placeholder'
                )}
              />
            </SettingsField>

            {draft?.editor.remote_ssh_host && (
              <SettingsField
                label={t('settings.general.editor.remoteSsh.user.label')}
                description={t('settings.general.editor.remoteSsh.user.helper')}
              >
                <SettingsInput
                  value={draft?.editor.remote_ssh_user || ''}
                  onChange={(value) =>
                    updateDraft({
                      editor: {
                        ...draft!.editor,
                        remote_ssh_user: value || null,
                      },
                    })
                  }
                  placeholder={t(
                    'settings.general.editor.remoteSsh.user.placeholder'
                  )}
                />
              </SettingsField>
            )}
          </>
        )}
      </SettingsCard>

      {/* Git */}
      <SettingsCard
        title={t('settings.general.git.title')}
        description={t('settings.general.git.description')}
      >
        <SettingsField
          label={t('settings.general.git.branchPrefix.label')}
          error={branchPrefixError}
          description={
            <>
              {t('settings.general.git.branchPrefix.helper')}{' '}
              {draft?.git_branch_prefix ? (
                <>
                  {t('settings.general.git.branchPrefix.preview')}{' '}
                  <code className="text-xs bg-secondary px-1 py-0.5 rounded">
                    {t('settings.general.git.branchPrefix.previewWithPrefix', {
                      prefix: draft.git_branch_prefix,
                    })}
                  </code>
                </>
              ) : (
                <>
                  {t('settings.general.git.branchPrefix.preview')}{' '}
                  <code className="text-xs bg-secondary px-1 py-0.5 rounded">
                    {t('settings.general.git.branchPrefix.previewNoPrefix')}
                  </code>
                </>
              )}
            </>
          }
        >
          <SettingsInput
            value={draft?.git_branch_prefix ?? ''}
            onChange={(value) => {
              const trimmed = value.trim();
              updateDraft({ git_branch_prefix: trimmed });
              setBranchPrefixError(validateBranchPrefix(trimmed));
            }}
            placeholder={t('settings.general.git.branchPrefix.placeholder')}
            error={!!branchPrefixError}
          />
        </SettingsField>
      </SettingsCard>

      {/* Pull Requests */}
      <SettingsCard
        title={t('settings.general.pullRequests.title')}
        description={t('settings.general.pullRequests.description')}
      >
        <SettingsCheckbox
          id="pr-auto-description"
          label={t('settings.general.pullRequests.autoDescription.label')}
          description={t(
            'settings.general.pullRequests.autoDescription.helper'
          )}
          checked={draft?.pr_auto_description_enabled ?? false}
          onChange={(checked) =>
            updateDraft({ pr_auto_description_enabled: checked })
          }
        />

        <SettingsCheckbox
          id="use-custom-prompt"
          label={t('settings.general.pullRequests.customPrompt.useCustom')}
          checked={draft?.pr_auto_description_prompt != null}
          onChange={(checked) => {
            if (checked) {
              updateDraft({
                pr_auto_description_prompt: DEFAULT_PR_DESCRIPTION_PROMPT,
              });
            } else {
              updateDraft({ pr_auto_description_prompt: null });
            }
          }}
        />

        <SettingsField
          label=""
          description={t('settings.general.pullRequests.customPrompt.helper')}
        >
          <SettingsTextarea
            value={
              draft?.pr_auto_description_prompt ?? DEFAULT_PR_DESCRIPTION_PROMPT
            }
            onChange={(value) =>
              updateDraft({ pr_auto_description_prompt: value })
            }
            disabled={draft?.pr_auto_description_prompt == null}
          />
        </SettingsField>
      </SettingsCard>

      {/* Notifications */}
      <SettingsCard
        title={t('settings.general.notifications.title')}
        description={t('settings.general.notifications.description')}
      >
        <SettingsCheckbox
          id="sound-enabled"
          label={t('settings.general.notifications.sound.label')}
          description={t('settings.general.notifications.sound.helper')}
          checked={draft?.notifications.sound_enabled ?? false}
          onChange={(checked) =>
            updateDraft({
              notifications: {
                ...draft!.notifications,
                sound_enabled: checked,
              },
            })
          }
        />

        {draft?.notifications.sound_enabled && (
          <div className="ml-7 space-y-2">
            <label className="text-sm font-medium text-normal">
              {t('settings.general.notifications.sound.fileLabel')}
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <SettingsSelect
                  value={draft.notifications.sound_file}
                  options={soundOptions}
                  onChange={(value: SoundFile) =>
                    updateDraft({
                      notifications: {
                        ...draft.notifications,
                        sound_file: value,
                      },
                    })
                  }
                  placeholder={t(
                    'settings.general.notifications.sound.filePlaceholder'
                  )}
                />
              </div>
              <IconButton
                icon={SpeakerHighIcon}
                onClick={() => playSound(draft.notifications.sound_file)}
                aria-label="Preview sound"
                title="Preview sound"
              />
            </div>
            <p className="text-sm text-low">
              {t('settings.general.notifications.sound.fileHelper')}
            </p>
          </div>
        )}

        <SettingsCheckbox
          id="push-notifications"
          label={t('settings.general.notifications.push.label')}
          description={t('settings.general.notifications.push.helper')}
          checked={draft?.notifications.push_enabled ?? false}
          onChange={(checked) =>
            updateDraft({
              notifications: {
                ...draft!.notifications,
                push_enabled: checked,
              },
            })
          }
        />
      </SettingsCard>

      {/* Privacy */}
      <SettingsCard
        title={t('settings.general.privacy.title')}
        description={t('settings.general.privacy.description')}
      >
        <SettingsCheckbox
          id="analytics-enabled"
          label={t('settings.general.privacy.telemetry.label')}
          description={t('settings.general.privacy.telemetry.helper')}
          checked={draft?.analytics_enabled ?? false}
          onChange={(checked) => updateDraft({ analytics_enabled: checked })}
        />
      </SettingsCard>

      {/* Task Templates */}
      <SettingsCard
        title={t('settings.general.taskTemplates.title')}
        description={t('settings.general.taskTemplates.description')}
      >
        <TagManager />
      </SettingsCard>

      {/* Safety */}
      <SettingsCard
        title={t('settings.general.safety.title')}
        description={t('settings.general.safety.description')}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-normal">
              {t('settings.general.safety.disclaimer.title')}
            </p>
            <p className="text-sm text-low">
              {t('settings.general.safety.disclaimer.description')}
            </p>
          </div>
          <PrimaryButton
            variant="tertiary"
            value={t('settings.general.safety.disclaimer.button')}
            onClick={resetDisclaimer}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-normal">
              {t('settings.general.safety.onboarding.title')}
            </p>
            <p className="text-sm text-low">
              {t('settings.general.safety.onboarding.description')}
            </p>
          </div>
          <PrimaryButton
            variant="tertiary"
            value={t('settings.general.safety.onboarding.button')}
            onClick={resetOnboarding}
          />
        </div>
      </SettingsCard>

      {/* Beta Features */}
      <SettingsCard
        title={t('settings.general.beta.title')}
        description={t('settings.general.beta.description')}
      >
        <SettingsCheckbox
          id="beta-workspaces"
          label={t('settings.general.beta.workspaces.label')}
          description={t('settings.general.beta.workspaces.helper')}
          checked={draft?.beta_workspaces ?? false}
          onChange={(checked) => updateDraft({ beta_workspaces: checked })}
        />
        <SettingsCheckbox
          id="commit-reminder"
          label={t('settings.general.beta.commitReminder.label')}
          description={t('settings.general.beta.commitReminder.helper')}
          checked={draft?.commit_reminder ?? false}
          onChange={(checked) => updateDraft({ commit_reminder: checked })}
        />
      </SettingsCard>

      {/* Sticky Save Button */}
      {hasUnsavedChanges && (
        <div className="sticky bottom-0 z-10 bg-panel/80 backdrop-blur-sm border-t border-border/50 py-4 -mx-6 px-6 -mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-low">
              {t('settings.general.save.unsavedChanges')}
            </span>
            <div className="flex gap-2">
              <PrimaryButton
                variant="tertiary"
                value={t('settings.general.save.discard')}
                onClick={handleDiscard}
                disabled={saving}
              />
              <PrimaryButton
                value={t('settings.general.save.button')}
                onClick={handleSave}
                disabled={saving || !!branchPrefixError}
                actionIcon={saving ? 'spinner' : undefined}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Alias for backwards compatibility
export { GeneralSettingsSection as GeneralSettingsSectionContent };
