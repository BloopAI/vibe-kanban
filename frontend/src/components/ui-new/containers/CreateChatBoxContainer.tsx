import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { useUserSystem } from '@/components/ConfigProvider';
import { useCreateWorkspace } from '@/hooks/useCreateWorkspace';
import { useCreateAttachments } from '@/hooks/useCreateAttachments';
import { getVariantOptions } from '@/utils/executor';
import { splitMessageToTitleDescription } from '@/utils/string';
import type { ExecutorProfileId, BaseCodingAgent } from 'shared/types';
import { CreateChatBox } from '../primitives/CreateChatBox';

export function CreateChatBoxContainer() {
  const { t } = useTranslation('common');
  const { profiles, config } = useUserSystem();
  const {
    repos,
    targetBranches,
    selectedProfile,
    setSelectedProfile,
    message,
    setMessage,
    selectedProjectId,
    clearDraft,
    hasInitialValue,
  } = useCreateMode();

  const { createWorkspace } = useCreateWorkspace();
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

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

  // Get project ID from context
  const projectId = selectedProjectId;

  // Determine if we can submit
  const canSubmit =
    repos.length > 0 &&
    message.trim().length > 0 &&
    effectiveProfile !== null &&
    projectId !== undefined;

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

  // Handle executor change - reset variant to first available
  const handleExecutorChange = useCallback(
    (executor: BaseCodingAgent) => {
      const executorConfig = profiles?.[executor];
      const variants = executorConfig ? Object.keys(executorConfig) : [];
      setSelectedProfile({
        executor,
        variant: variants[0] ?? null,
      });
    },
    [profiles, setSelectedProfile]
  );

  // Handle submit
  const handleSubmit = useCallback(async () => {
    setHasAttemptedSubmit(true);
    if (!canSubmit || !effectiveProfile || !projectId) return;

    const { title, description } = splitMessageToTitleDescription(message);

    await createWorkspace.mutateAsync({
      task: {
        project_id: projectId,
        title,
        description,
        status: null,
        parent_workspace_id: null,
        image_ids: getImageIds(),
        shared_task_id: null,
      },
      executor_profile_id: effectiveProfile,
      repos: repos.map((r) => ({
        repo_id: r.id,
        target_branch: targetBranches[r.id] ?? 'main',
      })),
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
      <div className="flex-1" />
      <div className="flex justify-center @container">
        <CreateChatBox
          editor={{
            value: message,
            onChange: setMessage,
          }}
          onSend={handleSubmit}
          isSending={createWorkspace.isPending}
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
                }
              : undefined
          }
          error={displayError}
          projectId={projectId}
          agent={effectiveProfile?.executor ?? null}
          onPasteFiles={uploadFiles}
          localImages={localImages}
        />
      </div>
    </div>
  );
}
