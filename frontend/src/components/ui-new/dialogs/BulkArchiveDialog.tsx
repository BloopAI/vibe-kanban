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
  ArchiveIcon,
  CheckCircleIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { defineModal } from '@/lib/modals';
import { cn } from '@/lib/utils';

export interface BulkArchiveDialogProps {
  projectId?: string;
  completedTaskCount?: number;
  cancelledTaskCount?: number;
}

export type BulkArchiveResult = 'archived' | 'canceled';

type ArchiveOption = 'completed' | 'cancelled' | 'both' | 'old';

const archiveOptions: {
  value: ArchiveOption;
  label: string;
  description: string;
}[] = [
  {
    value: 'completed',
    label: 'Completed tasks',
    description: 'Archive all tasks marked as Done',
  },
  {
    value: 'cancelled',
    label: 'Cancelled tasks',
    description: 'Archive all tasks marked as Cancelled',
  },
  {
    value: 'both',
    label: 'Completed & Cancelled',
    description: 'Archive both done and cancelled tasks',
  },
  {
    value: 'old',
    label: 'Older than 30 days',
    description: 'Archive completed tasks older than 30 days',
  },
];

const BulkArchiveDialogImpl = NiceModal.create<BulkArchiveDialogProps>(
  (props) => {
    const modal = useModal();
    const { completedTaskCount = 0, cancelledTaskCount = 0 } = props;
    const [selectedOption, setSelectedOption] =
      useState<ArchiveOption>('completed');
    const [isArchiving, setIsArchiving] = useState(false);

    const getArchiveCount = () => {
      switch (selectedOption) {
        case 'completed':
          return completedTaskCount;
        case 'cancelled':
          return cancelledTaskCount;
        case 'both':
          return completedTaskCount + cancelledTaskCount;
        case 'old':
          return 0; // Would need to calculate based on dates
        default:
          return 0;
      }
    };

    const handleArchive = async () => {
      setIsArchiving(true);
      try {
        // TODO: Implement actual archive logic
        console.log('Archiving tasks with option:', selectedOption);

        // Simulate processing
        await new Promise((resolve) => setTimeout(resolve, 1000));

        modal.resolve('archived' as BulkArchiveResult);
        modal.hide();
      } catch (error) {
        console.error('Archive failed:', error);
      } finally {
        setIsArchiving(false);
      }
    };

    const handleCancel = () => {
      modal.resolve('canceled' as BulkArchiveResult);
      modal.hide();
    };

    const archiveCount = getArchiveCount();

    return (
      <Dialog open={modal.visible} onOpenChange={handleCancel}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <ArchiveIcon className="h-6 w-6 text-brand" />
              <DialogTitle>Bulk Archive Tasks</DialogTitle>
            </div>
            <DialogDescription className="text-left pt-2">
              Move old or completed tasks to the archive to keep your board
              clean.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label className="text-sm font-medium mb-3 block">
              What to archive
            </label>
            <div className="space-y-2">
              {archiveOptions.map(({ value, label, description }) => {
                const count =
                  value === 'completed'
                    ? completedTaskCount
                    : value === 'cancelled'
                      ? cancelledTaskCount
                      : value === 'both'
                        ? completedTaskCount + cancelledTaskCount
                        : null;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectedOption(value)}
                    className={cn(
                      'w-full flex items-start gap-3 p-3 rounded-md border text-left',
                      'transition-colors duration-150',
                      selectedOption === value
                        ? 'border-brand bg-brand/10'
                        : 'border-input hover:border-brand/50 hover:bg-muted/50'
                    )}
                  >
                    <div
                      className={cn(
                        'size-icon-sm rounded-full border flex items-center justify-center mt-0.5',
                        selectedOption === value
                          ? 'border-brand bg-brand'
                          : 'border-input'
                      )}
                    >
                      {selectedOption === value && (
                        <CheckCircleIcon
                          className="size-icon-xs text-white"
                          weight="bold"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={cn(
                            'text-sm font-medium',
                            selectedOption === value && 'text-brand'
                          )}
                        >
                          {label}
                        </p>
                        {count !== null && count > 0 && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {count}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {archiveCount > 0 && (
              <div
                className={cn(
                  'mt-4 flex items-start gap-2 p-3 rounded-md',
                  'bg-amber-50 dark:bg-amber-950/30',
                  'border border-amber-200 dark:border-amber-900'
                )}
              >
                <WarningIcon className="size-icon-sm text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  This will archive {archiveCount} task
                  {archiveCount !== 1 ? 's' : ''}. Archived tasks can be
                  restored from the archive view.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleArchive}
              disabled={isArchiving || archiveCount === 0}
              variant={archiveCount > 0 ? 'default' : 'secondary'}
            >
              {isArchiving
                ? 'Archiving...'
                : archiveCount > 0
                  ? `Archive ${archiveCount} Task${archiveCount !== 1 ? 's' : ''}`
                  : 'No tasks to archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const BulkArchiveDialog = defineModal<
  BulkArchiveDialogProps,
  BulkArchiveResult
>(BulkArchiveDialogImpl);
