import { useEffect, useRef, useState } from 'react';
import { ConflictBanner } from '@/components/tasks/ConflictBanner';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';
import { useAttemptConflicts } from '@/hooks/useAttemptConflicts';
import type { RepoBranchStatus } from 'shared/types';

type Props = {
  selectedAttemptId?: string;
  attemptBranch: string | null;
  branchStatus: RepoBranchStatus[] | undefined;
  isEditable: boolean;
  onResolve?: () => void;
  enableResolve: boolean;
  enableAbort: boolean;
  conflictResolutionInstructions: string | null;
};

export function FollowUpConflictSection({
  selectedAttemptId,
  attemptBranch,
  branchStatus,
  onResolve,
  enableResolve,
  enableAbort,
  conflictResolutionInstructions,
}: Props) {
  const repoWithConflicts = branchStatus?.find(
    (r) => r.is_rebase_in_progress || (r.conflicted_files?.length ?? 0) > 0
  );
  const op = repoWithConflicts?.conflict_op ?? null;
  const openInEditor = useOpenInEditor(selectedAttemptId);
  const repoId = repoWithConflicts?.repo_id;
  const { abortConflicts } = useAttemptConflicts(selectedAttemptId, repoId);

  // write using setAborting and read through abortingRef in async handlers
  const [aborting, setAborting] = useState(false);
  const abortingRef = useRef(false);
  useEffect(() => {
    abortingRef.current = aborting;
  }, [aborting]);

  if (!repoWithConflicts) return null;

  return (
    <>
      <ConflictBanner
        attemptBranch={attemptBranch}
        baseBranch={repoWithConflicts.target_branch_name ?? ''}
        conflictedFiles={repoWithConflicts.conflicted_files || []}
        op={op}
        onResolve={onResolve}
        enableResolve={enableResolve && !aborting}
        onOpenEditor={() => {
          if (!selectedAttemptId) return;
          const first = repoWithConflicts.conflicted_files?.[0];
          openInEditor(first ? { filePath: first } : undefined);
        }}
        onAbort={async () => {
          if (!selectedAttemptId) return;
          if (!enableAbort || abortingRef.current) return;
          try {
            setAborting(true);
            await abortConflicts();
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
          <div className="text-xs font-medium text-warning-foreground dark:text-warning mb-1">
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
