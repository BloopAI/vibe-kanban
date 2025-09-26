import { attemptsApi } from '@/lib/api';
import { useEffect, useRef, useState } from 'react';
import { ConflictBanner } from '@/components/tasks/ConflictBanner';
import type { BranchStatus } from 'shared/types';

type Props = {
  selectedAttemptId?: string;
  attemptBranch: string | null;
  branchStatus?: BranchStatus;
  isEditable: boolean;
  refetchBranchStatus: () => void;
  onResolve?: () => void;
  enableResolve: boolean;
  enableAbort: boolean;
  conflictResolutionInstructions: string;
};

export function FollowUpConflictSection({
  selectedAttemptId,
  attemptBranch,
  branchStatus,
  refetchBranchStatus,
  onResolve,
  enableResolve,
  enableAbort,
  conflictResolutionInstructions,
}: Props) {
  const op = branchStatus?.conflict_op ?? null;

  // write using setAborting and read through abortingRef in async handlers
  const [aborting, setAborting] = useState(false);
  const abortingRef = useRef(false);
  useEffect(() => {
    abortingRef.current = aborting;
  }, [aborting]);

  if (
    !branchStatus?.is_rebase_in_progress &&
    !branchStatus?.conflicted_files?.length
  )
    return null;

  return (
    <>
      <ConflictBanner
        attemptBranch={attemptBranch}
        baseBranch={branchStatus?.base_branch_name}
        conflictedFiles={branchStatus?.conflicted_files || []}
        op={op}
        onResolve={onResolve}
        enableResolve={enableResolve && !aborting}
        onOpenEditor={async () => {
          if (!selectedAttemptId) return;
          try {
            const first = branchStatus?.conflicted_files?.[0];
            await attemptsApi.openEditor(selectedAttemptId, undefined, first);
          } catch (e) {
            console.error('Failed to open editor', e);
          }
        }}
        onAbort={async () => {
          if (!selectedAttemptId) return;
          if (!enableAbort || abortingRef.current) return;
          try {
            setAborting(true);
            await attemptsApi.abortConflicts(selectedAttemptId);
            refetchBranchStatus();
          } catch (e) {
            console.error('Failed to abort conflicts', e);
          } finally {
            setAborting(false);
          }
        }}
        enableAbort={enableAbort && !aborting}
      />
      {/* Conflict instructions preview (non-editable) */}
      {conflictResolutionInstructions && enableResolve && (
        <div className="text-sm mb-4">
          <div className="text-xs font-medium text-yellow-900 mb-1">
            Conflict resolution instructions
          </div>
          <div className="whitespace-pre-wrap">
            {conflictResolutionInstructions}
          </div>
        </div>
      )}
    </>
  );
}
