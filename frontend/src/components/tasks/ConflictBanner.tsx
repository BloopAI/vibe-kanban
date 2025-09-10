import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ConflictOp } from 'shared/types';
import { displayConflictOpLabel } from '@/lib/conflicts';

interface Props {
  attemptBranch: string | null;
  baseBranch?: string;
  conflictedFiles: string[];
  isDraftLocked: boolean;
  isDraftReady: boolean;
  onOpenEditor: () => void;
  onInsertInstructions: () => void;
  onAbort: () => void;
  op?: ConflictOp | null;
}

export function ConflictBanner({
  attemptBranch,
  baseBranch,
  conflictedFiles,
  isDraftLocked,
  isDraftReady,
  onOpenEditor,
  onInsertInstructions,
  onAbort,
  op,
}: Props) {
  const displayFiles = conflictedFiles.slice(0, 8);
  const opTitle = displayConflictOpLabel(op);
  return (
    <div className="rounded-md border border-yellow-300 bg-yellow-50 text-yellow-900 p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 text-yellow-700" />
        <div className="text-sm leading-relaxed">
          {attemptBranch ? (
            <>
              {opTitle} in progress: '{attemptBranch}' → '{baseBranch}'.
            </>
          ) : (
            <>A Git operation with merge conflicts is in progress.</>
          )}{' '}
          Follow-ups are allowed; some actions may be temporarily unavailable
          until you resolve the conflicts or abort the {opTitle.toLowerCase()}.
          {displayFiles.length ? (
            <div className="mt-1 text-xs text-yellow-800">
              Conflicted files ({displayFiles.length}
              {conflictedFiles.length > displayFiles.length
                ? ` of ${conflictedFiles.length}`
                : ''}
              ):
              <div
                className="mt-1 grid gap-0.5"
                style={{ gridTemplateColumns: '1fr' }}
              >
                {displayFiles.map((f) => (
                  <div key={f} className="truncate">
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="border-yellow-300 text-yellow-800 hover:bg-yellow-100"
          onClick={onOpenEditor}
        >
          Open in Editor
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-yellow-300 text-yellow-800 hover:bg-yellow-100"
          onClick={onInsertInstructions}
          disabled={isDraftLocked || !isDraftReady}
        >
          Insert Resolve-Conflicts Instructions
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-red-300 text-red-700 hover:bg-red-50"
          onClick={onAbort}
        >
          Abort {opTitle}
        </Button>
      </div>
    </div>
  );
}
