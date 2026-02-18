import { useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { useUserSystem } from '@/components/ConfigProvider';
import { useCreateWorkspace } from '@/hooks/useCreateWorkspace';
import { useCreateAttachments } from '@/hooks/useCreateAttachments';
import { useExecutorConfig } from '@/hooks/useExecutorConfig';
import { getSortedExecutorVariantKeys } from '@/utils/executor';
import { splitMessageToTitleDescription } from '@/utils/string';
import type { ExecutorProfileId, BaseCodingAgent, Repo } from 'shared/types';
import { CreateChatBox } from '../primitives/CreateChatBox';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { CreateModeRepoPickerBar } from './CreateModeRepoPickerBar';

function getRepoDisplayName(repo: Repo) {
  return repo.display_name || repo.name;
}

interface CreateChatBoxContainerProps {
  onWorkspaceCreated: ((workspaceId: string) => void) | null;
}

export function CreateChatBoxContainer({
  onWorkspaceCreated,
}: CreateChatBoxContainerProps) {
  const { t } = useTranslation('common');
  const { profiles, config } = useUserSystem();
  const {
    repos,
    targetBranches,
    message,
    setMessage,
    selectedProjectId,
    clearDraft,
    hasInitialValue,
    hasResolvedInitialRepoDefaults,
    linkedIssue,
    clearLinkedIssue,
    preferredExecutorConfig,
    executorConfig: draftConfig,
    setExecutorConfig: setDraftConfig,
  } = useCreateMode();

  const { createWorkspace } = useCreateWorkspace({
    onWorkspaceCreated: onWorkspaceCreated ?? undefined,
  });
  const hasSelectedRepos = repos.length > 0;
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [hasInitializedStep, setHasInitializedStep] = useState(false);
  const [isSelectingRepos, setIsSelectingRepos] = useState(true);

  useEffect(() => {
    if (!hasInitialValue || hasInitializedStep) return;
    if (!hasSelectedRepos && !hasResolvedInitialRepoDefaults) return;

    setIsSelectingRepos(!hasSelectedRepos);
    setHasInitializedStep(true);
  }, [
    hasInitialValue,
    hasInitializedStep,
    hasSelectedRepos,
    hasResolvedInitialRepoDefaults,
  ]);

  const showRepoPickerStep = !hasSelectedRepos || isSelectingRepos;
  const showChatStep = hasSelectedRepos && !isSelectingRepos;

  // Attachment handling - insert markdown and track image IDs
  const handleInsertMarkdown = useCallback(
    (markdown: string) => {
      const newMessage = message.trim()
        ? `${message}\n\n${markdown}`
        : markdown;
      setMessage(newMessage);
    },
    [message, setMessage]
  );

  const { uploadFiles, getImageIds, clearAttachments, localImages } =
    useCreateAttachments(handleInsertMarkdown);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const imageFiles = acceptedFiles.filter((f) =>
        f.type.startsWith('image/')
      );
      if (imageFiles.length > 0) {
        uploadFiles(imageFiles);
      }
    },
    [uploadFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    disabled: createWorkspace.isPending || !hasSelectedRepos,
    noClick: true,
    noKeyboard: true,
  });

  const scratchConfig = useMemo(() => {
    if (!hasInitialValue) return undefined; // still loading
    return draftConfig ?? null;
  }, [hasInitialValue, draftConfig]);

  const {
    executorConfig,
    effectiveExecutor,
    selectedVariant,
    executorOptions,
    variantOptions,
    presetOptions,
    setOverrides: setExecutorOverrides,
  } = useExecutorConfig({
    profiles,
    lastUsedConfig: preferredExecutorConfig,
    scratchConfig,
    configExecutorProfile: config?.executor_profile,
    onPersist: (cfg) => setDraftConfig(cfg),
  });

  const effectiveProfileId = useMemo<ExecutorProfileId | null>(
    () =>
      effectiveExecutor
        ? { executor: effectiveExecutor, variant: selectedVariant }
        : null,
    [effectiveExecutor, selectedVariant]
  );

  // Get project ID from context
  const projectId = selectedProjectId;

  const repoId = repos.length === 1 ? repos[0]?.id : undefined;
  const repoSummaryLabel = useMemo(() => {
    if (repos.length === 1) {
      const repo = repos[0];
      if (!repo) return '0 repositories selected';
      const branch = targetBranches[repo.id] ?? 'Select branch';
      return `${getRepoDisplayName(repo)} · ${branch}`;
    }

    return `${repos.length} repositories selected`;
  }, [repos, targetBranches]);

  const repoSummaryTitle = useMemo(
    () =>
      repos
        .map((repo) => {
          const branch = targetBranches[repo.id] ?? 'Select branch';
          return `${getRepoDisplayName(repo)} (${branch})`;
        })
        .join('\n'),
    [repos, targetBranches]
  );

  const hasSelectedBranchesForAllRepos = repos.every(
    (repo) => !!targetBranches[repo.id]
  );

  // Determine if we can submit
  const canSubmit =
    hasSelectedRepos &&
    hasSelectedBranchesForAllRepos &&
    message.trim().length > 0 &&
    effectiveExecutor !== null &&
    projectId !== null;

  const handlePresetSelect = (presetId: string | null) => {
    if (!effectiveExecutor) return;
    setDraftConfig({
      ...draftConfig,
      executor: effectiveExecutor,
      variant: presetId,
    });
  };

  const handleCustomise = () => {
    SettingsDialog.show({ initialSection: 'agents' });
  };

  // Handle executor change - use saved variant if switching to default executor
  const handleExecutorChange = useCallback(
    (executor: BaseCodingAgent) => {
      const executorProfile = profiles?.[executor];
      if (!executorProfile) {
        setDraftConfig({ executor, variant: null });
        return;
      }

      const variants = getSortedExecutorVariantKeys(executorProfile);
      let targetVariant: string | null = null;

      // If switching to user's default executor, use their saved variant
      if (
        config?.executor_profile?.executor === executor &&
        config?.executor_profile?.variant
      ) {
        const savedVariant = config.executor_profile.variant;
        if (variants.includes(savedVariant)) {
          targetVariant = savedVariant;
        }
      }

      // Fallback to DEFAULT or first available
      if (!targetVariant) {
        targetVariant = variants.includes('DEFAULT')
          ? 'DEFAULT'
          : (variants[0] ?? null);
      }

      setDraftConfig({ executor, variant: targetVariant });
    },
    [profiles, setDraftConfig, config?.executor_profile]
  );

  // Handle submit
  const handleSubmit = useCallback(async () => {
    setHasAttemptedSubmit(true);
    if (!canSubmit || !effectiveProfileId || !executorConfig || !projectId)
      return;

    const { title, description } = splitMessageToTitleDescription(message);

    await createWorkspace.mutateAsync({
      data: {
        task: {
          project_id: projectId,
          title,
          description,
          status: null,
          parent_workspace_id: null,
          image_ids: getImageIds(),
        },
        executor_config: executorConfig,
        repos: repos.map((r) => ({
          repo_id: r.id,
          target_branch: targetBranches[r.id]!,
        })),
        linked_issue: linkedIssue
          ? {
              remote_project_id: linkedIssue.remoteProjectId,
              issue_id: linkedIssue.issueId,
            }
          : null,
      },
      linkToIssue: linkedIssue
        ? {
            remoteProjectId: linkedIssue.remoteProjectId,
            issueId: linkedIssue.issueId,
          }
        : undefined,
    });

    // Clear attachments and draft after successful creation
    clearAttachments();
    await clearDraft();
  }, [
    canSubmit,
    effectiveProfileId,
    executorConfig,
    projectId,
    message,
    repos,
    targetBranches,
    createWorkspace,
    getImageIds,
    clearAttachments,
    clearDraft,
    linkedIssue,
  ]);

  // Determine error to display
  const displayError =
    hasAttemptedSubmit && repos.length === 0
      ? 'Add at least one repository to create a workspace'
      : hasAttemptedSubmit && !hasSelectedBranchesForAllRepos
        ? 'Select a branch for every repository before creating a workspace'
        : createWorkspace.error
          ? createWorkspace.error instanceof Error
            ? createWorkspace.error.message
            : 'Failed to create workspace'
          : null;

  // Wait for initial value to be applied before rendering
  // This ensures the editor mounts with content ready, so autoFocus works correctly
  if (!hasInitialValue) {
    return null;
  }

  // Handle case where no project exists
  if (!projectId) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-lg font-medium text-high mb-2">
            {t('projects.noProjectFound')}
          </h2>
          <p className="text-sm text-low">{t('projects.createFirstPrompt')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col bg-primary h-full">
      <div className="flex flex-1 items-center justify-center px-base">
        <div className="flex w-chat max-w-full flex-col gap-base">
          {showRepoPickerStep && (
            <>
              <h2 className="mb-double text-center text-4xl font-medium tracking-tight text-high">
                {t('createMode.headings.repoStep')}
              </h2>
              <CreateModeRepoPickerBar
                onContinueToPrompt={() => setIsSelectingRepos(false)}
              />
            </>
          )}

          {showChatStep && (
            <>
              <h2 className="mb-double text-center text-4xl font-medium tracking-tight text-high">
                {t('createMode.headings.chatStep')}
              </h2>

              <div className="flex justify-center @container">
                <CreateChatBox
                  editor={{
                    value: message,
                    onChange: setMessage,
                  }}
                  onSend={handleSubmit}
                  isSending={createWorkspace.isPending}
                  disabled={!hasSelectedRepos}
                  executor={{
                    selected: effectiveExecutor,
                    options: executorOptions,
                    onChange: handleExecutorChange,
                  }}
                  error={displayError}
                  repoIds={repos.map((r) => r.id)}
                  projectId={projectId ?? undefined}
                  agent={effectiveExecutor}
                  repoId={repoId}
                  modelSelector={{
                    onAdvancedSettings: handleCustomise,
                    presets: variantOptions,
                    selectedPreset: selectedVariant,
                    onPresetSelect: handlePresetSelect,
                    onOverrideChange: setExecutorOverrides,
                    executorConfig,
                    presetOptions,
                  }}
                  onPasteFiles={uploadFiles}
                  localImages={localImages}
                  dropzone={{ getRootProps, getInputProps, isDragActive }}
                  onEditRepos={() => setIsSelectingRepos(true)}
                  repoSummaryLabel={repoSummaryLabel}
                  repoSummaryTitle={repoSummaryTitle}
                  linkedIssue={
                    linkedIssue?.simpleId
                      ? {
                          simpleId: linkedIssue.simpleId,
                          title: linkedIssue.title ?? '',
                          onRemove: clearLinkedIssue,
                        }
                      : null
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
