import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';
import { ConflictBanner } from '@/components/tasks/ConflictBanner';
import { buildResolveConflictsInstructions } from '@/lib/conflicts';
import type { BranchStatus } from 'shared/types';

type Props = {
  selectedAttemptId?: string;
  attemptBranch: string | null;
  branchStatus?: BranchStatus;
  isEditable: boolean;
  appendInstructions: (text: string) => void;
  refetchBranchStatus: () => void;
};

export function FollowUpConflictSection({
  selectedAttemptId,
  attemptBranch,
  branchStatus,
  isEditable,
  appendInstructions,
  refetchBranchStatus,
}: Props) {
  const op = branchStatus?.conflict_op ?? null;
  const handleInsertInstructions = useCallback(() => {
    const template = buildResolveConflictsInstructions(
      attemptBranch,
      branchStatus?.base_branch_name,
      branchStatus?.conflicted_files || [],
      op
    );
    appendInstructions(template);
  }, [
    attemptBranch,
    branchStatus?.base_branch_name,
    branchStatus?.conflicted_files,
    op,
    appendInstructions,
  ]);

  const hasConflicts = (branchStatus?.conflicted_files?.length ?? 0) > 0;
  if (!hasConflicts) return null;

  return (
    <ConflictBanner
      attemptBranch={attemptBranch}
      baseBranch={branchStatus?.base_branch_name}
      conflictedFiles={branchStatus?.conflicted_files || []}
      isEditable={isEditable}
      op={op}
      onOpenEditor={async () => {
        if (!selectedAttemptId) return;
        try {
          const first = branchStatus?.conflicted_files?.[0];
          await attemptsApi.openEditor(selectedAttemptId, undefined, first);
        } catch (e) {
          console.error('Failed to open editor', e);
        }
      }}
      onInsertInstructions={handleInsertInstructions}
      onAbort={async () => {
        if (!selectedAttemptId) return;
        try {
          await attemptsApi.abortConflicts(selectedAttemptId);
          refetchBranchStatus();
        } catch (e) {
          console.error('Failed to abort conflicts', e);
        }
      }}
    />
  );
}
