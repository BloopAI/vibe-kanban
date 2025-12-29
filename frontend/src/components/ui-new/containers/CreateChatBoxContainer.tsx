import { useMemo, useCallback, useState } from 'react';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { useUserSystem } from '@/components/ConfigProvider';
import { useCreateWorkspace } from '@/hooks/useCreateWorkspace';
import type { ExecutorProfileId, BaseCodingAgent } from 'shared/types';
import {
  SessionChatBox,
  type ExecutionStatus,
} from '../primitives/SessionChatBox';

export function CreateChatBoxContainer() {
  const { profiles, config } = useUserSystem();
  const {
    repos,
    targetBranches,
    selectedProfile,
    setSelectedProfile,
    message,
    setMessage,
    selectedProjectId,
  } = useCreateMode();

  const { createWorkspace } = useCreateWorkspace();
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

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
  const variantOptions = useMemo(() => {
    if (!effectiveProfile || !profiles) return [];
    const executorConfig = profiles[effectiveProfile.executor];
    if (!executorConfig) return [];
    return Object.keys(executorConfig);
  }, [effectiveProfile, profiles]);

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

    await createWorkspace.mutateAsync({
      task: {
        project_id: projectId,
        title: message.trim().substring(0, 100),
        description: message.length > 100 ? message : null,
        status: null,
        parent_workspace_id: null,
        image_ids: null,
        shared_task_id: null,
      },
      executor_profile_id: effectiveProfile,
      repos: repos.map((r) => ({
        repo_id: r.id,
        target_branch: targetBranches[r.id] ?? 'main',
      })),
    });
  }, [
    canSubmit,
    effectiveProfile,
    projectId,
    message,
    repos,
    targetBranches,
    createWorkspace,
  ]);

  // Execution status for UI
  const status: ExecutionStatus = createWorkspace.isPending
    ? 'sending'
    : 'idle';
  const error = createWorkspace.error
    ? createWorkspace.error instanceof Error
      ? createWorkspace.error.message
      : 'Failed to create workspace'
    : null;

  // Handle case where no project exists
  if (!projectId) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-lg font-medium text-high mb-2">
            No project found
          </h2>
          <p className="text-sm text-low">
            Create a project first to start working on tasks.
          </p>
        </div>
      </div>
    );
  }

  // Common props for SessionChatBox
  const chatBoxProps = {
    status,
    editor: {
      value: message,
      onChange: setMessage,
    },
    actions: {
      onSend: handleSubmit,
      onQueue: () => {},
      onCancelQueue: () => {},
      onStop: () => {},
      onAttach: () => {},
    },
    variant: effectiveProfile
      ? {
          selected: effectiveProfile.variant ?? 'DEFAULT',
          options: variantOptions,
          onChange: handleVariantChange,
        }
      : undefined,
    executor: {
      selected: effectiveProfile?.executor ?? null,
      options: Object.keys(profiles ?? {}) as BaseCodingAgent[],
      onChange: handleExecutorChange,
    },
    hideStats: true,
  };

  return (
    <div className="relative flex flex-1 flex-col bg-primary h-full">
      <div className="flex-1" />
      <div className="flex justify-center @container">
        <SessionChatBox
          {...chatBoxProps}
          error={
            hasAttemptedSubmit && repos.length === 0
              ? 'Add at least one repository to create a workspace'
              : error
          }
        />
      </div>
    </div>
  );
}
