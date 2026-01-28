import { useEffect, useRef, useState } from 'react';
import { ConflictBanner } from '@/components/tasks/ConflictBanner';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';
import { useAttemptConflicts } from '@/hooks/useAttemptConflicts';
import type { RepoBranchStatus } from 'shared/types';

type Props = {
  workspaceId?: string;
  attemptBranch: string | null;
  branchStatus: RepoBranchStatus[] | undefined;
  isEditable: boolean;
  onResolve?: () => void;
  enableResolve: boolean;
  enableAbort: boolean;
  conflictResolutionInstructions: string | null;
};

export function FollowUpConflictSection({
  workspaceId,
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
  const openInEditor = useOpenInEditor(workspaceId);
  const repoId = repoWithConflicts?.repo_id;
  const { abortConflicts, continueConflicts } = useAttemptConflicts(
    workspaceId,
    repoId
  );

  // write using setAborting/setContinuing and read through refs in async handlers
  const [aborting, setAborting] = useState(false);
  const abortingRef = useRef(false);
  const [continuing, setContinuing] = useState(false);
  const continuingRef = useRef(false);
  useEffect(() => {
    abortingRef.current = aborting;
  }, [aborting]);
  useEffect(() => {
    continuingRef.current = continuing;
  }, [continuing]);

  if (!repoWithConflicts) return null;

  const hasConflicts = (repoWithConflicts.conflicted_files?.length ?? 0) > 0;

  return (
    <>
      <ConflictBanner
        attemptBranch={attemptBranch}
        baseBranch={repoWithConflicts.target_branch_name ?? ''}
        conflictedFiles={repoWithConflicts.conflicted_files || []}
        op={op}
        onResolve={onResolve}
        enableResolve={enableResolve && !aborting && !continuing}
        onContinue={
          !hasConflicts
            ? async () => {
                if (!workspaceId) return;
                if (continuingRef.current) return;
                try {
                  setContinuing(true);
                  await continueConflicts();
                } catch (e) {
                  console.error('Failed to continue operation', e);
                } finally {
                  setContinuing(false);
                }
              }
            : undefined
        }
        enableContinue={!continuing && !aborting}
        onOpenEditor={() => {
          if (!workspaceId) return;
          const first = repoWithConflicts.conflicted_files?.[0];
          openInEditor(first ? { filePath: first } : undefined);
        }}
        onAbort={async () => {
          if (!workspaceId) return;
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
        enableAbort={enableAbort && !aborting && !continuing}
      />
      {/* Conflict instructions preview (non-editable) */}
      {conflictResolutionInstructions && enableResolve && hasConflicts && (
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
