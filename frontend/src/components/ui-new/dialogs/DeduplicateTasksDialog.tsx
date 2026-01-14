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
  CopyIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react';
import { defineModal } from '@/lib/modals';
import { cn } from '@/lib/utils';

export interface DeduplicateTasksDialogProps {
  projectId?: string;
}

export type DeduplicateTasksResult = 'merged' | 'canceled';

interface DuplicateGroup {
  id: string;
  title: string;
  count: number;
  taskIds: string[];
}

const DeduplicateTasksDialogImpl =
  NiceModal.create<DeduplicateTasksDialogProps>(() => {
    const modal = useModal();
    const [isScanning, setIsScanning] = useState(false);
    const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(
      new Set()
    );
    const [hasScanned, setHasScanned] = useState(false);

    const handleScan = async () => {
      setIsScanning(true);
      try {
        // TODO: Implement actual duplicate detection logic
        // This would analyze task titles for similarity
        console.log('Scanning for duplicates...');

        // Simulate finding duplicates
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Mock data for demonstration
        setDuplicates([]);
        setHasScanned(true);
      } catch (error) {
        console.error('Scan failed:', error);
      } finally {
        setIsScanning(false);
      }
    };

    const handleMerge = async () => {
      if (selectedGroups.size === 0) return;

      try {
        // TODO: Implement actual merge logic
        console.log('Merging selected duplicates:', Array.from(selectedGroups));

        modal.resolve('merged' as DeduplicateTasksResult);
        modal.hide();
      } catch (error) {
        console.error('Merge failed:', error);
      }
    };

    const handleCancel = () => {
      modal.resolve('canceled' as DeduplicateTasksResult);
      modal.hide();
    };

    const toggleGroup = (groupId: string) => {
      setSelectedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        return next;
      });
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleCancel}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <CopyIcon className="h-6 w-6 text-brand" />
              <DialogTitle>Find Duplicate Tasks</DialogTitle>
            </div>
            <DialogDescription className="text-left pt-2">
              Scan for tasks with similar titles and merge duplicates.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {!hasScanned ? (
              <div className="text-center py-8">
                <MagnifyingGlassIcon className="size-icon-xl mx-auto text-muted-foreground/40 mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  Click scan to find duplicate tasks based on title similarity.
                </p>
                <Button onClick={handleScan} disabled={isScanning}>
                  {isScanning ? 'Scanning...' : 'Scan for Duplicates'}
                </Button>
              </div>
            ) : duplicates.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircleIcon className="size-icon-xl mx-auto text-green-500 mb-4" />
                <p className="text-sm text-muted-foreground">
                  No duplicate tasks found. Your board is clean!
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {duplicates.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-md border text-left',
                      'transition-colors duration-150',
                      selectedGroups.has(group.id)
                        ? 'border-brand bg-brand/10'
                        : 'border-input hover:border-brand/50'
                    )}
                  >
                    <div
                      className={cn(
                        'size-icon-sm rounded border flex items-center justify-center',
                        selectedGroups.has(group.id)
                          ? 'border-brand bg-brand text-white'
                          : 'border-input'
                      )}
                    >
                      {selectedGroups.has(group.id) && (
                        <CheckCircleIcon
                          className="size-icon-xs"
                          weight="bold"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {group.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {group.count} similar tasks
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancel}>
              {hasScanned && duplicates.length === 0 ? 'Close' : 'Cancel'}
            </Button>
            {duplicates.length > 0 && (
              <Button
                onClick={handleMerge}
                disabled={selectedGroups.size === 0}
              >
                Merge Selected ({selectedGroups.size})
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });

export const DeduplicateTasksDialog = defineModal<
  DeduplicateTasksDialogProps,
  DeduplicateTasksResult
>(DeduplicateTasksDialogImpl);
