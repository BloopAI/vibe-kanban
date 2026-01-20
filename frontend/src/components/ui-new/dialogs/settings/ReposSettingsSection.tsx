import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isEqual } from 'lodash';
import { SpinnerIcon } from '@phosphor-icons/react';
import { useScriptPlaceholders } from '@/hooks/useScriptPlaceholders';
import { repoApi } from '@/lib/api';
import type { Repo, UpdateRepo } from 'shared/types';
import { cn } from '@/lib/utils';
import { PrimaryButton } from '../../primitives/PrimaryButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuTriggerButton,
} from '../../primitives/Dropdown';

// Reusable settings components
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
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-normal">{label}</label>
      {children}
      {description && <p className="text-sm text-low">{description}</p>}
    </div>
  );
}

function SettingsInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full bg-secondary border border-border rounded-sm px-base py-half text-base text-high',
        'placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand'
      )}
    />
  );
}

function SettingsTextarea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={cn(
        'w-full bg-secondary border border-border rounded-sm px-base py-half text-base text-high font-mono',
        'placeholder:text-low placeholder:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand',
        'resize-y'
      )}
    />
  );
}

function SettingsCheckbox({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className={cn(
          'mt-0.5 h-4 w-4 rounded border-border bg-secondary text-brand focus:ring-brand focus:ring-offset-0',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />
      <div className="space-y-0.5">
        <label
          htmlFor={id}
          className={cn(
            'text-sm font-medium text-normal cursor-pointer',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {label}
        </label>
        {description && <p className="text-sm text-low">{description}</p>}
      </div>
    </div>
  );
}

interface RepoScriptsFormState {
  display_name: string;
  setup_script: string;
  parallel_setup_script: boolean;
  cleanup_script: string;
  copy_files: string;
  dev_server_script: string;
}

function repoToFormState(repo: Repo): RepoScriptsFormState {
  return {
    display_name: repo.display_name,
    setup_script: repo.setup_script ?? '',
    parallel_setup_script: repo.parallel_setup_script,
    cleanup_script: repo.cleanup_script ?? '',
    copy_files: repo.copy_files ?? '',
    dev_server_script: repo.dev_server_script ?? '',
  };
}

export function ReposSettingsSection() {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();

  // Fetch all repos
  const {
    data: repos,
    isLoading: reposLoading,
    error: reposError,
  } = useQuery({
    queryKey: ['repos'],
    queryFn: () => repoApi.list(),
  });

  // Selected repo state
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);

  // Form state
  const [draft, setDraft] = useState<RepoScriptsFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Get OS-appropriate script placeholders
  const placeholders = useScriptPlaceholders();

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !selectedRepo) return false;
    return !isEqual(draft, repoToFormState(selectedRepo));
  }, [draft, selectedRepo]);

  // Handle repo selection
  const handleRepoSelect = useCallback(
    (id: string) => {
      if (id === selectedRepoId) return;

      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          t('settings.repos.save.confirmSwitch')
        );
        if (!confirmed) return;
        setDraft(null);
        setSelectedRepo(null);
        setSuccess(false);
        setError(null);
      }

      setSelectedRepoId(id);
    },
    [hasUnsavedChanges, selectedRepoId, t]
  );

  // Populate draft from server data
  useEffect(() => {
    if (!repos) return;

    const nextRepo = selectedRepoId
      ? repos.find((r) => r.id === selectedRepoId)
      : null;

    setSelectedRepo((prev) =>
      prev?.id === nextRepo?.id ? prev : (nextRepo ?? null)
    );

    if (!nextRepo) {
      if (!hasUnsavedChanges) setDraft(null);
      return;
    }

    if (hasUnsavedChanges) return;

    setDraft(repoToFormState(nextRepo));
  }, [repos, selectedRepoId, hasUnsavedChanges]);

  const handleSave = async () => {
    if (!draft || !selectedRepo) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const updateData: UpdateRepo = {
        display_name: draft.display_name.trim() || null,
        setup_script: draft.setup_script.trim() || null,
        cleanup_script: draft.cleanup_script.trim() || null,
        copy_files: draft.copy_files.trim() || null,
        parallel_setup_script: draft.parallel_setup_script,
        dev_server_script: draft.dev_server_script.trim() || null,
      };

      const updatedRepo = await repoApi.update(selectedRepo.id, updateData);
      setSelectedRepo(updatedRepo);
      setDraft(repoToFormState(updatedRepo));
      queryClient.setQueryData(['repos'], (old: Repo[] | undefined) =>
        old?.map((r) => (r.id === updatedRepo.id ? updatedRepo : r))
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('settings.repos.save.error')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!selectedRepo) return;
    setDraft(repoToFormState(selectedRepo));
  };

  const updateDraft = (updates: Partial<RepoScriptsFormState>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, ...updates };
    });
  };

  if (reposLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <SpinnerIcon
          className="size-icon-lg animate-spin text-brand"
          weight="bold"
        />
        <span className="text-normal">{t('settings.repos.loading')}</span>
      </div>
    );
  }

  if (reposError) {
    return (
      <div className="py-8">
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {reposError instanceof Error
            ? reposError.message
            : t('settings.repos.loadError')}
        </div>
      </div>
    );
  }

  const repoOptions =
    repos?.map((r) => ({ value: r.id, label: r.display_name })) ?? [];

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
          {t('settings.repos.save.success')}
        </div>
      )}

      {/* Repo selector */}
      <SettingsCard
        title={t('settings.repos.title')}
        description={t('settings.repos.description')}
      >
        <SettingsField
          label={t('settings.repos.selector.label')}
          description={t('settings.repos.selector.helper')}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <DropdownMenuTriggerButton
                label={
                  repoOptions.find((r) => r.value === selectedRepoId)?.label ||
                  t('settings.repos.selector.placeholder')
                }
                className="w-full justify-between"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
              {repoOptions.length > 0 ? (
                repoOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => handleRepoSelect(option.value)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>
                  {t('settings.repos.selector.noRepos')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SettingsField>
      </SettingsCard>

      {selectedRepo && draft && (
        <>
          {/* General settings */}
          <SettingsCard
            title={t('settings.repos.general.title')}
            description={t('settings.repos.general.description')}
          >
            <SettingsField
              label={t('settings.repos.general.displayName.label')}
              description={t('settings.repos.general.displayName.helper')}
            >
              <SettingsInput
                value={draft.display_name}
                onChange={(value) => updateDraft({ display_name: value })}
                placeholder={t(
                  'settings.repos.general.displayName.placeholder'
                )}
              />
            </SettingsField>

            <SettingsField
              label={t('settings.repos.general.path.label')}
              description=""
            >
              <div className="text-sm text-low font-mono bg-secondary px-base py-half rounded-sm">
                {selectedRepo.path}
              </div>
            </SettingsField>
          </SettingsCard>

          {/* Scripts settings */}
          <SettingsCard
            title={t('settings.repos.scripts.title')}
            description={t('settings.repos.scripts.description')}
          >
            <SettingsField
              label={t('settings.repos.scripts.devServer.label')}
              description={t('settings.repos.scripts.devServer.helper')}
            >
              <SettingsTextarea
                value={draft.dev_server_script}
                onChange={(value) => updateDraft({ dev_server_script: value })}
                placeholder={placeholders.dev}
              />
            </SettingsField>

            <SettingsField
              label={t('settings.repos.scripts.setup.label')}
              description={t('settings.repos.scripts.setup.helper')}
            >
              <SettingsTextarea
                value={draft.setup_script}
                onChange={(value) => updateDraft({ setup_script: value })}
                placeholder={placeholders.setup}
              />
            </SettingsField>

            <SettingsCheckbox
              id="parallel-setup-script"
              label={t('settings.repos.scripts.setup.parallelLabel')}
              description={t('settings.repos.scripts.setup.parallelHelper')}
              checked={draft.parallel_setup_script}
              onChange={(checked) =>
                updateDraft({ parallel_setup_script: checked })
              }
              disabled={!draft.setup_script.trim()}
            />

            <SettingsField
              label={t('settings.repos.scripts.cleanup.label')}
              description={t('settings.repos.scripts.cleanup.helper')}
            >
              <SettingsTextarea
                value={draft.cleanup_script}
                onChange={(value) => updateDraft({ cleanup_script: value })}
                placeholder={placeholders.cleanup}
              />
            </SettingsField>

            <SettingsField
              label={t('settings.repos.scripts.copyFiles.label')}
              description={t('settings.repos.scripts.copyFiles.helper')}
            >
              <SettingsTextarea
                value={draft.copy_files}
                onChange={(value) => updateDraft({ copy_files: value })}
                placeholder={t('settings.repos.scripts.copyFiles.placeholder')}
                rows={3}
              />
            </SettingsField>
          </SettingsCard>

          {/* Sticky Save Button */}
          {hasUnsavedChanges && (
            <div className="sticky bottom-0 z-10 bg-panel/80 backdrop-blur-sm border-t border-border/50 py-4 -mx-6 px-6 -mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-low">
                  {t('settings.repos.save.unsavedChanges')}
                </span>
                <div className="flex gap-2">
                  <PrimaryButton
                    variant="tertiary"
                    value={t('settings.repos.save.discard')}
                    onClick={handleDiscard}
                    disabled={saving}
                  />
                  <PrimaryButton
                    value={t('settings.repos.save.button')}
                    onClick={handleSave}
                    disabled={saving}
                    actionIcon={saving ? 'spinner' : undefined}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// Alias for backwards compatibility
export { ReposSettingsSection as ReposSettingsSectionContent };
