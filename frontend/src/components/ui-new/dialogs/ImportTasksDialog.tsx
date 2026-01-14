import { useState } from 'react';
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
import { DownloadSimpleIcon, FileTextIcon } from '@phosphor-icons/react';
import { defineModal } from '@/lib/modals';
import { cn } from '@/lib/utils';

export interface ImportTasksDialogProps {
  projectId?: string;
}

export type ImportTasksResult = 'imported' | 'canceled';

const ImportTasksDialogImpl = NiceModal.create<ImportTasksDialogProps>(() => {
  const modal = useModal();
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    if (!importText.trim()) return;

    setIsImporting(true);
    try {
      // TODO: Implement actual import logic
      // Parse the text and create tasks via API
      console.log('Importing tasks:', importText);

      modal.resolve('imported' as ImportTasksResult);
      modal.hide();
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCancel = () => {
    modal.resolve('canceled' as ImportTasksResult);
    modal.hide();
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DownloadSimpleIcon className="h-6 w-6 text-brand" />
            <DialogTitle>Import Tasks</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Paste task titles, one per line. Tasks will be created in the To Do
            status.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div
            className={cn(
              'relative rounded-md border border-input',
              'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2'
            )}
          >
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Task 1&#10;Task 2&#10;Task 3"
              rows={8}
              className={cn(
                'w-full rounded-md px-3 py-2',
                'bg-transparent text-sm',
                'placeholder:text-muted-foreground',
                'focus:outline-none',
                'resize-none'
              )}
            />
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <FileTextIcon className="size-icon-xs" />
            <span>
              {importText.trim()
                ? `${
                    importText
                      .trim()
                      .split('\n')
                      .filter((l) => l.trim()).length
                  } tasks to import`
                : 'Enter task titles, one per line'}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!importText.trim() || isImporting}
          >
            {isImporting ? 'Importing...' : 'Import Tasks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ImportTasksDialog = defineModal<
  ImportTasksDialogProps,
  ImportTasksResult
>(ImportTasksDialogImpl);
