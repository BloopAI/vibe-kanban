import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import {
  ProjectProvider,
  useProjectContext,
} from '@/contexts/remote/ProjectContext';
import { cn } from '@/lib/utils';

export interface ChangeStatusDialogProps {
  projectId: string;
  issueIds: string[];
}

function ChangeStatusDialogContent({
  issueIds,
}: Pick<ChangeStatusDialogProps, 'issueIds'>) {
  const modal = useModal();
  const { t } = useTranslation(['kanban', 'common']);
  const [selectedStatusId, setSelectedStatusId] = useState<string>('');

  const { statuses, updateIssue, getIssue } = useProjectContext();

  // Get sorted visible statuses
  const sortedStatuses = useMemo(
    () =>
      [...statuses]
        .filter((s) => !s.hidden)
        .sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );

  // Get issue info for display
  const issueInfo = useMemo(
    () => issueIds.map((id) => getIssue(id)).filter(Boolean),
    [issueIds, getIssue]
  );

  const handleConfirm = () => {
    if (!selectedStatusId) return;

    // Update all selected issues
    for (const issueId of issueIds) {
      updateIssue(issueId, { status_id: selectedStatusId });
    }
    modal.hide();
  };

  const handleCancel = () => {
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleCancel();
    }
  };

  const descriptionText =
    issueIds.length === 1
      ? t('changeStatus.descriptionSingle', {
          title: issueInfo[0]?.title ?? 'issue',
          defaultValue: `Change status for "${issueInfo[0]?.title ?? 'issue'}"`,
        })
      : t('changeStatus.descriptionMultiple', {
          count: issueIds.length,
          defaultValue: `Change status for ${issueIds.length} issues`,
        });

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('changeStatus.title', { defaultValue: 'Change Status' })}
          </DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {sortedStatuses.map((status) => (
            <button
              key={status.id}
              type="button"
              onClick={() => setSelectedStatusId(status.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors',
                selectedStatusId === status.id
                  ? 'bg-accent'
                  : 'hover:bg-accent/50'
              )}
            >
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: `hsl(${status.color})` }}
              />
              <span>{status.name}</span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {t('common:buttons.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedStatusId}>
            {t('changeStatus.action', { defaultValue: 'Change Status' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ChangeStatusDialogImpl = NiceModal.create<ChangeStatusDialogProps>(
  ({ projectId, issueIds }) => {
    return (
      <ProjectProvider projectId={projectId}>
        <ChangeStatusDialogContent issueIds={issueIds} />
      </ProjectProvider>
    );
  }
);

export const ChangeStatusDialog = defineModal<ChangeStatusDialogProps, void>(
  ChangeStatusDialogImpl
);
