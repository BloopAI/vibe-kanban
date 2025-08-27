import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { TaskAttempt } from 'shared/types';
import { useDevServer } from '@/hooks/useDevServer';
import { useRebase } from '@/hooks/useRebase';
import { useMerge } from '@/hooks/useMerge';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';
import { useDiffSummary } from '@/hooks/useDiffSummary';

interface AttemptHeaderCardProps {
  attemptNumber: number;
  totalAttempts: number;
  selectedAttempt: TaskAttempt | null;
  onCreatePR?: () => void;
  onCreateNewAttempt?: () => void;
  onJumpToDiffFullScreen?: () => void;
}

export function AttemptHeaderCard({
  attemptNumber,
  totalAttempts,
  selectedAttempt,
  onCreatePR,
  onCreateNewAttempt,
  onJumpToDiffFullScreen,
}: AttemptHeaderCardProps) {
  const {
    start: startDevServer,
    stop: stopDevServer,
    runningDevServer,
  } = useDevServer(selectedAttempt?.id);
  const rebase = useRebase(selectedAttempt?.id);
  const merge = useMerge(selectedAttempt?.id);
  const openInEditor = useOpenInEditor(selectedAttempt);
  const { fileCount, added, deleted } = useDiffSummary(selectedAttempt?.id ?? null);

  return (
    <Card className="border-b border-dashed bg-secondary flex items-center text-sm text-muted-foreground">
      <div className="flex-1 flex gap-6 p-3">
        <p>
          Attempt &middot;{' '}
          <span className="text-primary">
            {attemptNumber}/{totalAttempts}
          </span>
        </p>
        <p>
          Profile &middot;{' '}
          <span className="text-primary">{selectedAttempt?.profile}</span>
        </p>
        {selectedAttempt?.branch && (
          <p className="max-w-30 truncate">
            Branch &middot;{' '}
            <span className="text-primary">{selectedAttempt.branch}</span>
          </p>
        )}
        {fileCount > 0 && (
          <p>
            <Button variant="ghost" size="sm" className="h-4 p-0" onClick={onJumpToDiffFullScreen}>
              Diff
            </Button>
            {' '}&middot;{' '}
            <span className="text-green-600">+{added}</span>{' '}
            <span className="text-red-600">-{deleted}</span>
          </p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0 mr-3">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => openInEditor()}
            disabled={!selectedAttempt}
          >
            Open in IDE
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={runningDevServer ? stopDevServer : startDevServer}
            disabled={!selectedAttempt}
            className={runningDevServer ? 'text-destructive' : ''}
          >
            {runningDevServer ? 'Stop dev server' : 'Start dev server'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => rebase()}
            disabled={!selectedAttempt}
          >
            Rebase
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCreatePR} disabled={!onCreatePR}>
            Create PR
          </DropdownMenuItem>
          <DropdownMenuItem onClick={merge} disabled={!selectedAttempt}>
            Merge
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onCreateNewAttempt}
            disabled={!onCreateNewAttempt}
          >
            Create new attempt
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Card >
  );
}
