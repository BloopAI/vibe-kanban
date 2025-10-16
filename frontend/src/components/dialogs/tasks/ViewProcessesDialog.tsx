import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ProcessesTab from '@/components/tasks/TaskDetails/ProcessesTab';
import { ProcessSelectionProvider } from '@/contexts/ProcessSelectionContext';

export interface ViewProcessesDialogProps {
  attemptId: string;
}

export const ViewProcessesDialog = NiceModal.create<ViewProcessesDialogProps>(
  ({ attemptId }) => {
    const { t } = useTranslation('tasks');
    const modal = useModal();

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        modal.hide();
      }
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={handleOpenChange}
        className="max-w-5xl w-[92vw] p-0 overflow-x-hidden"
      >
        <DialogContent
          className="p-0 min-w-0"
          onKeyDownCapture={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              modal.hide();
            }
          }}
        >
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle>{t('viewProcessesDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="h-[75vh] flex flex-col min-h-0 min-w-0">
            <ProcessSelectionProvider>
              <ProcessesTab attemptId={attemptId} />
            </ProcessSelectionProvider>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);
