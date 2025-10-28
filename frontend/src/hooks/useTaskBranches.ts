import { useState, useEffect } from 'react';
import { projectsApi, attemptsApi } from '@/lib/api';
import type { GitBranch } from 'shared/types';

interface UseTaskBranchesProps {
  modalVisible: boolean;
  isEditMode: boolean;
  projectId?: string;
  initialBaseBranch?: string;
  parentTaskAttemptId?: string;
}

export function useTaskBranches({
  modalVisible,
  isEditMode,
  projectId,
  initialBaseBranch,
  parentTaskAttemptId,
}: UseTaskBranchesProps) {
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  // Fetch branches when dialog opens in create mode
  useEffect(() => {
    if (!modalVisible || isEditMode || !projectId) return;

    let cancelled = false;

    projectsApi
      .getBranches(projectId)
      .then((projectBranches) => {
        if (cancelled) return;

        setBranches(projectBranches);

        if (
          initialBaseBranch &&
          projectBranches.some((b) => b.name === initialBaseBranch)
        ) {
          setSelectedBranch(initialBaseBranch);
        } else {
          const currentBranch = projectBranches.find((b) => b.is_current);
          const defaultBranch = currentBranch || projectBranches[0];
          if (defaultBranch) {
            setSelectedBranch(defaultBranch.name);
          }
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [modalVisible, isEditMode, projectId, initialBaseBranch]);

  // Fetch parent base branch when parentTaskAttemptId is provided
  useEffect(() => {
    if (
      !modalVisible ||
      isEditMode ||
      !parentTaskAttemptId ||
      initialBaseBranch ||
      branches.length === 0
    ) {
      return;
    }

    let cancelled = false;

    attemptsApi
      .get(parentTaskAttemptId)
      .then((attempt) => {
        if (cancelled) return;

        const parentBranch = attempt.branch || attempt.target_branch;
        if (parentBranch && branches.some((b) => b.name === parentBranch)) {
          setSelectedBranch(parentBranch);
        }
      })
      .catch(() => {
        // Silently fail, will use current branch fallback
      });

    return () => {
      cancelled = true;
    };
  }, [
    modalVisible,
    isEditMode,
    parentTaskAttemptId,
    initialBaseBranch,
    branches,
  ]);

  return { branches, selectedBranch, setSelectedBranch };
}
