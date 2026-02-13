import { useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { useUserSystem } from '@/components/ConfigProvider';
import { useCreateWorkspace } from '@/hooks/useCreateWorkspace';
import { useCreateAttachments } from '@/hooks/useCreateAttachments';
import { useMultiRepoBranches } from '@/hooks/useRepoBranches';
import { getVariantOptions, areProfilesEqual } from '@/utils/executor';
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
  const { profiles, config, updateAndSaveConfig } = useUserSystem();
  const {
    repos,
    targetBranches,
    setTargetBranch,
    selectedProfile,
    setSelectedProfile,
    message,
    setMessage,
    selectedProjectId,
    clearDraft,
    hasInitialValue,
    linkedIssue,
    clearLinkedIssue,
  } = useCreateMode();

  const { createWorkspace } = useCreateWorkspace({
    onWorkspaceCreated: onWorkspaceCreated ?? undefined,
  });
  const hasSelectedRepos = repos.length > 0;
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [hasInitializedStep, setHasInitializedStep] = useState(false);
  const [isSelectingRepos, setIsSelectingRepos] = useState(true);

  useEffect(() => {
    if (!hasInitialValue || hasInitializedStep) return;
    setIsSelectingRepos(!hasSelectedRepos);
    setHasInitializedStep(true);
  }, [hasInitialValue, hasInitializedStep, hasSelectedRepos]);

  const showRepoPickerStep = !hasSelectedRepos || isSelectingRepos;
  const showChatStep = hasSelectedRepos && !isSelectingRepos;

  // Auto-select branch for repos that don't have one yet
  const repoIds = useMemo(() => repos.map((r) => r.id), [repos]);
  const { branchesByRepo } = useMultiRepoBranches(repoIds);

  useEffect(() => {
    repos.forEach((repo) => {
      if (targetBranches[repo.id]) return;
      const branches = branchesByRepo[repo.id];
      if (!branches) return;

      // Priority 1: default_target_branch if configured
      if (
        repo.default_target_branch &&
        branches.some((b) => b.name === repo.default_target_branch)
      ) {
        setTargetBranch(repo.id, repo.default_target_branch);
        return;
      }

      // Priority 2: current checked-out branch
      const currentBranch = branches.find((b) => b.is_current);
      if (currentBranch) {
        setTargetBranch(repo.id, currentBranch.name);
      }
    });
  }, [repos, branchesByRepo, targetBranches, setTargetBranch]);

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

  // Default to user's config profile or first available executor
  const effectiveProfile = useMemo<ExecutorProfileId | null>(() => {
    if (selectedProfile) return selectedProfile;
    if (config?.executor_profile) return config.executor_profile;
    if (profiles) {
      const firstExecutor = Object.keys(profiles)[0] as BaseCodingAgent;
      if (firstExecutor) {
        const variants = Object.keys(profiles[firstExecutor]);
        return {
          executor: firstExecutor,
          variant: variants[0] ?? null,
        };
      }
    }
    return null;
  }, [selectedProfile, config?.executor_profile, profiles]);

  // Get variant options for the current executor
  const variantOptions = useMemo(
    () => getVariantOptions(effectiveProfile?.executor, profiles),
    [effectiveProfile?.executor, profiles]
  );

  // Detect if user has changed from their saved default
  const hasChangedFromDefault = useMemo(() => {
    if (!config?.executor_profile || !effectiveProfile) return false;
    return !areProfilesEqual(effectiveProfile, config.executor_profile);
  }, [effectiveProfile, config?.executor_profile]);

  // Reset toggle when profile matches default again
  useEffect(() => {
    if (!hasChangedFromDefault) {
      setSaveAsDefault(false);
    }
  }, [hasChangedFromDefault]);

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

  // Determine if we can submit
  const canSubmit =
    hasSelectedRepos &&
    message.trim().length > 0 &&
    effectiveProfile !== null &&
    projectId !== null;

  // Handle variant change
  const handleVariantChange = useCallback(
    (variant: string | null) => {
      if (!effectiveProfile) return;
      setSelectedProfile({
        executor: effectiveProfile.executor,
        variant,
      });
    },
    [effectiveProfile, setSelectedProfile]
  );

  // Open settings modal to agent settings section
  const handleCustomise = useCallback(() => {
    SettingsDialog.show({ initialSection: 'agents' });
  }, []);

  // Handle executor change - use saved variant if switching to default executor
  const handleExecutorChange = useCallback(
    (executor: BaseCodingAgent) => {
      const executorConfig = profiles?.[executor];
      if (!executorConfig) {
        setSelectedProfile({ executor, variant: null });
        return;
      }

      const variants = Object.keys(executorConfig);
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

      setSelectedProfile({ executor, variant: targetVariant });
    },
    [profiles, setSelectedProfile, config?.executor_profile]
  );

  // Handle submit
  const handleSubmit = useCallback(async () => {
    setHasAttemptedSubmit(true);
    if (!canSubmit || !effectiveProfile || !projectId) return;

    // Save profile as default if toggle is checked
    if (saveAsDefault && hasChangedFromDefault) {
      await updateAndSaveConfig({ executor_profile: effectiveProfile });
    }

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
        executor_profile_id: effectiveProfile,
        repos: repos.map((r) => ({
          repo_id: r.id,
          target_branch: targetBranches[r.id] ?? 'main',
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
    effectiveProfile,
    projectId,
    message,
    repos,
    targetBranches,
    createWorkspace,
    getImageIds,
    clearAttachments,
    clearDraft,
    saveAsDefault,
    hasChangedFromDefault,
    updateAndSaveConfig,
    linkedIssue,
  ]);

  // Determine error to display
  const displayError =
    hasAttemptedSubmit && repos.length === 0
      ? 'Add at least one repository to create a workspace'
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
                    selected: effectiveProfile?.executor ?? null,
                    options: Object.keys(profiles ?? {}) as BaseCodingAgent[],
                    onChange: handleExecutorChange,
                  }}
                  variant={
                    effectiveProfile
                      ? {
                          selected: effectiveProfile.variant ?? 'DEFAULT',
                          options: variantOptions,
                          onChange: handleVariantChange,
                          onCustomise: handleCustomise,
                        }
                      : undefined
                  }
                  saveAsDefault={{
                    checked: saveAsDefault,
                    onChange: setSaveAsDefault,
                    visible: hasChangedFromDefault,
                  }}
                  error={displayError}
                  repoIds={repos.map((r) => r.id)}
                  projectId={projectId}
                  agent={effectiveProfile?.executor ?? null}
                  repoId={repoId}
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
