import { useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { Copy, Check } from 'lucide-react';
import { defineModal } from '@/lib/modals';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProcessLogsViewerContent } from '@/components/tasks/TaskDetails/ProcessLogsViewer';
import { useLogStream } from '@/hooks/useLogStream';

export interface ScriptLogsDialogProps {
  processId: string;
  title: string;
}

const ScriptLogsDialogImpl = NiceModal.create<ScriptLogsDialogProps>(
  ({ processId, title }) => {
    const modal = useModal();
    const { logs, error } = useLogStream(processId);
    const [copied, setCopied] = useState(false);

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        modal.hide();
      }
    };

    const handleCopyLogs = () => {
      const logText = logs.map((entry) => entry.content).join('\n');
      navigator.clipboard.writeText(logText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={handleOpenChange}
        className="max-w-4xl w-[85vw] p-0 overflow-x-hidden"
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
            <div className="flex items-center gap-2">
              <DialogTitle>{title}</DialogTitle>
              <button
                onClick={handleCopyLogs}
                disabled={logs.length === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                title={copied ? 'Copied!' : 'Copy logs'}
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </DialogHeader>
          <div className="h-[60vh] flex flex-col min-h-0 min-w-0 bg-black/90">
            <ProcessLogsViewerContent logs={logs} error={error} />
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export const ScriptLogsDialog = defineModal<ScriptLogsDialogProps, void>(
  ScriptLogsDialogImpl
);
