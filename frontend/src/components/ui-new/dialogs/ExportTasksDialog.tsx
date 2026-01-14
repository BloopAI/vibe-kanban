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
import {
  UploadSimpleIcon,
  FileTextIcon,
  FileCsvIcon,
  CodeIcon,
} from '@phosphor-icons/react';
import { defineModal } from '@/lib/modals';
import { cn } from '@/lib/utils';

export interface ExportTasksDialogProps {
  projectId?: string;
  taskCount?: number;
}

export type ExportFormat = 'csv' | 'json' | 'markdown';
export type ExportTasksResult = 'exported' | 'canceled';

const formatOptions: {
  value: ExportFormat;
  label: string;
  icon: typeof FileTextIcon;
}[] = [
  { value: 'csv', label: 'CSV', icon: FileCsvIcon },
  { value: 'json', label: 'JSON', icon: CodeIcon },
  { value: 'markdown', label: 'Markdown', icon: FileTextIcon },
];

const ExportTasksDialogImpl = NiceModal.create<ExportTasksDialogProps>(
  (props) => {
    const modal = useModal();
    const { taskCount = 0 } = props;
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
      setIsExporting(true);
      try {
        // TODO: Implement actual export logic
        // Fetch tasks, format them, and trigger download
        console.log('Exporting tasks as:', selectedFormat);

        // Simulate download
        const content =
          selectedFormat === 'json'
            ? JSON.stringify({ tasks: [] }, null, 2)
            : selectedFormat === 'csv'
              ? 'title,status,created_at\n'
              : '# Tasks\n\n';

        const blob = new Blob([content], {
          type:
            selectedFormat === 'json'
              ? 'application/json'
              : selectedFormat === 'csv'
                ? 'text/csv'
                : 'text/markdown',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tasks.${selectedFormat === 'markdown' ? 'md' : selectedFormat}`;
        a.click();
        URL.revokeObjectURL(url);

        modal.resolve('exported' as ExportTasksResult);
        modal.hide();
      } catch (error) {
        console.error('Export failed:', error);
      } finally {
        setIsExporting(false);
      }
    };

    const handleCancel = () => {
      modal.resolve('canceled' as ExportTasksResult);
      modal.hide();
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleCancel}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <UploadSimpleIcon className="h-6 w-6 text-brand" />
              <DialogTitle>Export Tasks</DialogTitle>
            </div>
            <DialogDescription className="text-left pt-2">
              Export {taskCount > 0 ? `${taskCount} tasks` : 'all tasks'} to a
              file.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {formatOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedFormat(value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-md border',
                    'transition-colors duration-150',
                    selectedFormat === value
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-input hover:border-brand/50 hover:bg-muted/50'
                  )}
                >
                  <Icon className="size-icon-base" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const ExportTasksDialog = defineModal<
  ExportTasksDialogProps,
  ExportTasksResult
>(ExportTasksDialogImpl);
