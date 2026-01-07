import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import {
  Loader2,
  GitCommit,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  usePendingCommits,
  useCommitPending,
  useDiscardPendingCommit,
  useDiscardAllPendingCommits,
} from '@/hooks';
import type { PendingCommit } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal, getErrorMessage } from '@/lib/modals';

export type PendingCommitsResult = 'closed';

interface CommitItemProps {
  commit: PendingCommit;
  onCommit: (id: string, title: string) => Promise<void>;
  onDiscard: (id: string) => Promise<void>;
  isProcessing: boolean;
}

function CommitItem({
  commit,
  onCommit,
  onDiscard,
  isProcessing,
}: CommitItemProps) {
  const { t } = useTranslation('pendingCommits');
  const [title, setTitle] = useState(
    commit.agent_summary?.split('\n')[0] || ''
  );
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleCommit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('errors.titleRequired'));
      return;
    }
    if (trimmedTitle.length > 500) {
      setError(t('errors.titleTooLong'));
      return;
    }
    setError(null);
    try {
      await onCommit(commit.id, trimmedTitle);
    } catch (err) {
      setError(getErrorMessage(err) || t('errors.commitFailed'));
    }
  };

  const handleDiscard = async () => {
    setError(null);
    try {
      await onDiscard(commit.id);
    } catch (err) {
      setError(getErrorMessage(err) || t('errors.discardFailed'));
    }
  };

  return (
    <Card className="p-3">
      <button
        type="button"
        className="w-full flex items-center justify-between hover:bg-muted/50 -m-1 p-1 rounded"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-left">
          <GitCommit className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate font-mono text-sm">{commit.repo_path}</span>
          <Badge variant="secondary" className="text-xs shrink-0">
            {new Date(commit.created_at).toLocaleDateString()}
          </Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {commit.agent_summary && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
              <p className="font-medium mb-1">{t('agentSummary')}:</p>
              <p className="whitespace-pre-wrap">{commit.agent_summary}</p>
            </div>
          )}

          <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
            <p className="font-medium mb-1">{t('diffSummary')}:</p>
            <pre className="whitespace-pre-wrap text-xs font-mono">
              {commit.diff_summary}
            </pre>
          </div>

          <div>
            <Label htmlFor={`title-${commit.id}`} className="text-sm">
              {t('commitTitle')}
            </Label>
            <Input
              id={`title-${commit.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              disabled={isProcessing}
              className="mt-1"
            />
          </div>

          {error && (
            <Alert variant="destructive" className="py-2">
              {error}
            </Alert>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscard}
              disabled={isProcessing}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {t('discard')}
            </Button>
            <Button
              size="sm"
              onClick={handleCommit}
              disabled={isProcessing || !title.trim()}
            >
              {isProcessing ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Check className="h-3 w-3 mr-1" />
              )}
              {t('commit')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

const PendingCommitsDialogImpl = NiceModal.create(() => {
  const modal = useModal();
  const { t } = useTranslation('pendingCommits');
  const { data: commits, isLoading, refetch } = usePendingCommits();
  const commitMutation = useCommitPending();
  const discardMutation = useDiscardPendingCommit();
  const discardAllMutation = useDiscardAllPendingCommits();

  const isProcessing =
    commitMutation.isPending ||
    discardMutation.isPending ||
    discardAllMutation.isPending;

  const handleCommit = async (id: string, title: string) => {
    await commitMutation.mutateAsync({ id, data: { title } });
    await refetch();
  };

  const handleDiscard = async (id: string) => {
    await discardMutation.mutateAsync(id);
    await refetch();
  };

  const handleDiscardAll = async () => {
    await discardAllMutation.mutateAsync();
    await refetch();
  };

  const handleClose = () => {
    modal.resolve('closed' as PendingCommitsResult);
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleClose();
    }
  };

  const pendingCount = commits?.length || 0;

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCommit className="h-5 w-5" />
            {t('title')}
            {pendingCount > 0 && (
              <Badge variant="secondary">{pendingCount}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingCount === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('noPending')}
            </div>
          ) : (
            commits?.map((commit) => (
              <CommitItem
                key={commit.id}
                commit={commit}
                onCommit={handleCommit}
                onDiscard={handleDiscard}
                isProcessing={isProcessing}
              />
            ))
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          {pendingCount > 1 && (
            <Button
              variant="destructive"
              onClick={handleDiscardAll}
              disabled={isProcessing}
              className="mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('discardAll')}
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const PendingCommitsDialog = defineModal<object, PendingCommitsResult>(
  PendingCommitsDialogImpl
);
