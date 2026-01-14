import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { Loader2, AlertCircle, Merge, Trash2, X, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { defineModal } from '@/lib/modals';
import { tasksApi } from '@/lib/api';
import type {
  DuplicatePair,
  DuplicateMatchType,
  MergeTasksRequest,
} from 'shared/types';

export interface DeduplicateDialogProps {
  projectId: string;
}

type DuplicateAction = 'merge' | 'keep' | 'delete' | null;

interface DuplicatePairState {
  pair: DuplicatePair;
  action: DuplicateAction;
  selected: boolean;
}

const DeduplicateDialogImpl = NiceModal.create<DeduplicateDialogProps>(
  ({ projectId }) => {
    const modal = useModal();
    const queryClient = useQueryClient();

    const [pairStates, setPairStates] = useState<DuplicatePairState[]>([]);
    const [processingError, setProcessingError] = useState<string | null>(null);

    // Fetch duplicates
    const {
      data: duplicatesResponse,
      isLoading,
      error: fetchError,
      refetch,
    } = useQuery({
      queryKey: ['task-duplicates', projectId],
      queryFn: () => tasksApi.findDuplicates(projectId),
      enabled: modal.visible,
      staleTime: 0,
    });

    // Initialize pair states when data arrives
    useState(() => {
      if (duplicatesResponse?.duplicate_pairs) {
        setPairStates(
          duplicatesResponse.duplicate_pairs.map((pair) => ({
            pair,
            action: null,
            selected: false,
          }))
        );
      }
    });

    // Update states when duplicates change
    if (
      duplicatesResponse?.duplicate_pairs &&
      pairStates.length !== duplicatesResponse.duplicate_pairs.length
    ) {
      setPairStates(
        duplicatesResponse.duplicate_pairs.map((pair) => ({
          pair,
          action: null,
          selected: false,
        }))
      );
    }

    // Merge mutation
    const mergeMutation = useMutation({
      mutationFn: (request: MergeTasksRequest) => tasksApi.mergeTasks(request),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
      },
    });

    // Bulk merge mutation
    const bulkMergeMutation = useMutation({
      mutationFn: tasksApi.bulkMergeTasks,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
      },
    });

    // Delete task mutation
    const deleteMutation = useMutation({
      mutationFn: (taskId: string) => tasksApi.delete(taskId),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
      },
    });

    const handleSetAction = useCallback(
      (index: number, action: DuplicateAction) => {
        setPairStates((prev) =>
          prev.map((state, i) => (i === index ? { ...state, action } : state))
        );
      },
      []
    );

    const handleSelectAllHighConfidence = useCallback(() => {
      setPairStates((prev) =>
        prev.map((state) => ({
          ...state,
          selected: state.pair.similarity_score >= 0.8,
          action: state.pair.similarity_score >= 0.8 ? 'merge' : state.action,
        }))
      );
    }, []);

    const handleApplyActions = useCallback(async () => {
      setProcessingError(null);

      const mergeRequests: MergeTasksRequest[] = [];
      const deleteTaskIds: string[] = [];

      for (const state of pairStates) {
        if (state.action === 'merge') {
          mergeRequests.push({
            primary_task_id: state.pair.primary_task.id,
            secondary_task_id: state.pair.secondary_task.id,
            append_description: true,
            combine_labels: true,
          });
        } else if (state.action === 'delete') {
          deleteTaskIds.push(state.pair.secondary_task.id);
        }
        // 'keep' action does nothing
      }

      try {
        // Process merges
        if (mergeRequests.length > 0) {
          const result = await bulkMergeMutation.mutateAsync({
            merges: mergeRequests,
          });
          if (result.failed_merges > 0) {
            setProcessingError(
              `${result.failed_merges} merge(s) failed: ${result.errors.join(', ')}`
            );
          }
        }

        // Process deletes
        for (const taskId of deleteTaskIds) {
          await deleteMutation.mutateAsync(taskId);
        }

        // Refetch duplicates to update the list
        await refetch();
      } catch (err) {
        setProcessingError(
          err instanceof Error ? err.message : 'An error occurred'
        );
      }
    }, [pairStates, bulkMergeMutation, deleteMutation, refetch]);

    const handleClose = () => {
      modal.remove();
    };

    const hasActions = pairStates.some((s) => s.action !== null);
    const isProcessing =
      mergeMutation.isPending ||
      bulkMergeMutation.isPending ||
      deleteMutation.isPending;

    return (
      <Dialog open={modal.visible} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Find Duplicate Tasks</DialogTitle>
            <DialogDescription>
              Review potential duplicate tasks and choose how to handle them.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 flex flex-col gap-4 py-4">
            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">
                  Analyzing tasks...
                </span>
              </div>
            )}

            {/* Error state */}
            {fetchError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {fetchError instanceof Error
                    ? fetchError.message
                    : 'Failed to find duplicates'}
                </AlertDescription>
              </Alert>
            )}

            {/* Processing error */}
            {processingError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{processingError}</AlertDescription>
              </Alert>
            )}

            {/* No duplicates found */}
            {!isLoading && !fetchError && pairStates.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Check className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p>No duplicate tasks found in this project.</p>
                <p className="text-sm mt-2">
                  {duplicatesResponse?.total_tasks_analyzed ?? 0} tasks analyzed
                </p>
              </div>
            )}

            {/* Duplicates list */}
            {!isLoading && pairStates.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Found {pairStates.length} potential duplicate
                    {pairStates.length !== 1 ? 's' : ''} (
                    {duplicatesResponse?.total_tasks_analyzed ?? 0} tasks
                    analyzed)
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllHighConfidence}
                  >
                    Auto-select high confidence
                  </Button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto border rounded-md">
                  <div className="divide-y">
                    {pairStates.map((state, index) => (
                      <DuplicatePairRow
                        key={`${state.pair.primary_task.id}-${state.pair.secondary_task.id}`}
                        state={state}
                        onSetAction={(action) => handleSetAction(index, action)}
                        disabled={isProcessing}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isProcessing}
            >
              {hasActions ? 'Cancel' : 'Close'}
            </Button>
            {hasActions && (
              <Button onClick={handleApplyActions} disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Apply ${pairStates.filter((s) => s.action !== null).length} action(s)`
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

interface DuplicatePairRowProps {
  state: DuplicatePairState;
  onSetAction: (action: DuplicateAction) => void;
  disabled: boolean;
}

function DuplicatePairRow({
  state,
  onSetAction,
  disabled,
}: DuplicatePairRowProps) {
  const { pair, action } = state;
  const similarityPercent = Math.round(pair.similarity_score * 100);

  return (
    <div className="p-4 hover:bg-muted/50">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={action !== null}
          onCheckedChange={() => {
            if (action === null) {
              onSetAction('merge');
            } else {
              onSetAction(null);
            }
          }}
          disabled={disabled}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge
              variant={
                similarityPercent >= 80
                  ? 'default'
                  : similarityPercent >= 60
                    ? 'secondary'
                    : 'outline'
              }
            >
              {similarityPercent}% match
            </Badge>
            {pair.match_types.map((type) => (
              <Badge key={type} variant="outline" className="text-xs">
                {formatMatchType(type)}
              </Badge>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Primary task (older - will be kept) */}
            <div className="border rounded p-2 bg-green-50 dark:bg-green-950/20">
              <div className="text-xs text-muted-foreground mb-1">
                Keep (#{pair.primary_task.task_number?.toString() ?? '?'})
              </div>
              <div className="font-medium text-sm truncate">
                {pair.primary_task.title}
              </div>
              {pair.primary_task.description && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {pair.primary_task.description}
                </div>
              )}
            </div>

            {/* Secondary task (newer - will be merged/deleted) */}
            <div className="border rounded p-2 bg-orange-50 dark:bg-orange-950/20">
              <div className="text-xs text-muted-foreground mb-1">
                Duplicate (#{pair.secondary_task.task_number?.toString() ?? '?'}
                )
              </div>
              <div className="font-medium text-sm truncate">
                {pair.secondary_task.title}
              </div>
              {pair.secondary_task.description && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {pair.secondary_task.description}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              variant={action === 'merge' ? 'default' : 'outline'}
              onClick={() => onSetAction(action === 'merge' ? null : 'merge')}
              disabled={disabled}
            >
              <Merge className="h-3 w-3 mr-1" />
              Merge
            </Button>
            <Button
              size="sm"
              variant={action === 'keep' ? 'default' : 'outline'}
              onClick={() => onSetAction(action === 'keep' ? null : 'keep')}
              disabled={disabled}
            >
              <X className="h-3 w-3 mr-1" />
              Keep Both
            </Button>
            <Button
              size="sm"
              variant={action === 'delete' ? 'destructive' : 'outline'}
              onClick={() => onSetAction(action === 'delete' ? null : 'delete')}
              disabled={disabled}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete Duplicate
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMatchType(type: DuplicateMatchType): string {
  switch (type) {
    case 'exact_title':
      return 'Exact title';
    case 'similar_title':
      return 'Similar title';
    case 'similar_description':
      return 'Similar description';
    case 'same_external_ref':
      return 'Same external ref';
    default:
      return type;
  }
}

export const DeduplicateDialog = defineModal<DeduplicateDialogProps, void>(
  DeduplicateDialogImpl
);
