import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useTranslation } from 'react-i18next';
import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import ProcessesTab from '@/components/tasks/TaskDetails/ProcessesTab';
import { ProcessSelectionProvider } from '@/contexts/ProcessSelectionContext';
import type { LogEntry } from '@/components/tasks/TaskDetails/ProcessLogsViewer';

export interface ViewProcessesDialogProps {
  attemptId: string;
  initialProcessId?: string | null;
}

const ViewProcessesDialogImpl = NiceModal.create<ViewProcessesDialogProps>(
  ({ attemptId, initialProcessId }) => {
    const { t } = useTranslation('tasks');
    const modal = useModal();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [copied, setCopied] = useState(false);

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        modal.hide();
      }
    };

    const handleLogsChange = useCallback((newLogs: LogEntry[]) => {
      setLogs(newLogs);
    }, []);

    const handleCopyLogs = useCallback(async () => {
      if (logs.length === 0) return;

      const text = logs.map((entry) => entry.content).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.warn('Copy to clipboard failed:', err);
      }
    }, [logs]);

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
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-12 top-4 h-4 w-4 p-0 rounded-sm opacity-70 hover:opacity-100"
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
          >
            {copied ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle>{t('viewProcessesDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="h-[75vh] flex flex-col min-h-0 min-w-0">
            <ProcessSelectionProvider initialProcessId={initialProcessId}>
              <ProcessesTab
                attemptId={attemptId}
                onLogsChange={handleLogsChange}
              />
            </ProcessSelectionProvider>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export const ViewProcessesDialog = defineModal<ViewProcessesDialogProps, void>(
  ViewProcessesDialogImpl
);
