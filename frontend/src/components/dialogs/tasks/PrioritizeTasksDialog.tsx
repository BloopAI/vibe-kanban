import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { toast } from 'sonner';
import { Sparkles, CheckCheck, RotateCcw } from 'lucide-react';
import { defineModal } from '@/lib/modals';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePrioritySuggestions, useBulkTaskUpdate } from '@/hooks';
import { PrioritizeSuggestionCard } from './PrioritizeSuggestionCard';
import type {
  PrioritySuggestion,
  PrioritizeResult,
  PrioritizeTasksDialogProps,
} from '@/lib/prioritization';

const PrioritizeTasksDialogImpl = NiceModal.create<PrioritizeTasksDialogProps>(
  ({ tasks }) => {
    const modal = useModal();
    const { t } = useTranslation('tasks');
    const { updatePriorities, isUpdating } = useBulkTaskUpdate();

    // Compute suggestions from tasks
    const initialSuggestions = usePrioritySuggestions(tasks);

    // Track user decisions for each suggestion
    const [decisions, setDecisions] = useState<Record<string, boolean | null>>(
      () => {
        const initial: Record<string, boolean | null> = {};
        for (const s of initialSuggestions) {
          initial[s.taskId] = null;
        }
        return initial;
      }
    );

    // Merge decisions into suggestions
    const suggestions: PrioritySuggestion[] = useMemo(() => {
      return initialSuggestions.map((s) => ({
        ...s,
        accepted: decisions[s.taskId] ?? null,
      }));
    }, [initialSuggestions, decisions]);

    const acceptedSuggestions = useMemo(
      () => suggestions.filter((s) => s.accepted === true),
      [suggestions]
    );

    const pendingSuggestions = useMemo(
      () => suggestions.filter((s) => s.accepted === null),
      [suggestions]
    );

    const handleAccept = useCallback((taskId: string) => {
      setDecisions((prev) => ({ ...prev, [taskId]: true }));
    }, []);

    const handleReject = useCallback((taskId: string) => {
      setDecisions((prev) => ({ ...prev, [taskId]: false }));
    }, []);

    const handleAcceptAll = useCallback(() => {
      setDecisions((prev) => {
        const next = { ...prev };
        for (const s of suggestions) {
          if (next[s.taskId] === null) {
            next[s.taskId] = true;
          }
        }
        return next;
      });
    }, [suggestions]);

    const handleClearAll = useCallback(() => {
      setDecisions((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = null;
        }
        return next;
      });
    }, []);

    const handleApply = useCallback(async () => {
      if (acceptedSuggestions.length === 0) {
        modal.remove();
        return;
      }

      // Store previous priorities for undo
      const previousPriorities = acceptedSuggestions.map((s) => ({
        taskId: s.taskId,
        priority: s.currentPriority,
      }));

      try {
        await updatePriorities.mutateAsync(
          acceptedSuggestions.map((s) => ({
            taskId: s.taskId,
            priority: s.suggestedPriority,
          }))
        );

        modal.resolve({
          updatedCount: acceptedSuggestions.length,
          skippedCount: suggestions.length - acceptedSuggestions.length,
        } as PrioritizeResult);
        modal.remove();

        toast.success(
          t('prioritize.successMessage', {
            count: acceptedSuggestions.length,
            defaultValue: `Updated ${acceptedSuggestions.length} task priorities`,
          }),
          {
            action: {
              label: t('prioritize.undo', 'Undo'),
              onClick: async () => {
                try {
                  await updatePriorities.mutateAsync(previousPriorities);
                  toast.success(
                    t('prioritize.undoSuccess', 'Changes reverted')
                  );
                } catch {
                  toast.error(t('prioritize.undoFailed', 'Failed to undo'));
                }
              },
            },
            duration: 8000,
          }
        );
      } catch {
        toast.error(
          t('prioritize.errorMessage', 'Failed to update priorities')
        );
      }
    }, [acceptedSuggestions, suggestions.length, updatePriorities, modal, t]);

    const handleCancel = useCallback(() => {
      modal.remove();
    }, [modal]);

    const hasSuggestions = suggestions.length > 0;
    const hasAccepted = acceptedSuggestions.length > 0;

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && handleCancel()}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {t('prioritize.title', 'Prioritize Tasks')}
            </DialogTitle>
            <DialogDescription>
              {hasSuggestions
                ? t(
                    'prioritize.description',
                    'Review AI-suggested priority changes based on task age, keywords, labels, and due dates.'
                  )
                : t(
                    'prioritize.noSuggestions',
                    'All tasks already have appropriate priorities.'
                  )}
            </DialogDescription>
          </DialogHeader>

          {hasSuggestions && (
            <>
              {/* Bulk actions */}
              <div className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAcceptAll}
                    disabled={pendingSuggestions.length === 0 || isUpdating}
                  >
                    <CheckCheck className="h-4 w-4 mr-1" />
                    {t('prioritize.acceptAll', 'Accept All')}
                    {pendingSuggestions.length > 0 &&
                      ` (${pendingSuggestions.length})`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAll}
                    disabled={
                      Object.values(decisions).every((d) => d === null) ||
                      isUpdating
                    }
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    {t('prioritize.reset', 'Reset')}
                  </Button>
                </div>
                <span className="text-sm text-muted-foreground">
                  {t('prioritize.showing', {
                    count: suggestions.length,
                    total: tasks.length,
                    defaultValue: `${suggestions.length} suggestions`,
                  })}
                </span>
              </div>

              {/* Suggestions list */}
              <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
                <div className="divide-y">
                  {suggestions.map((suggestion) => (
                    <PrioritizeSuggestionCard
                      key={suggestion.taskId}
                      suggestion={suggestion}
                      onAccept={() => handleAccept(suggestion.taskId)}
                      onReject={() => handleReject(suggestion.taskId)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isUpdating}
            >
              {t('common:buttons.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleApply} disabled={!hasAccepted || isUpdating}>
              {isUpdating
                ? t('prioritize.applying', 'Applying...')
                : t('prioritize.applyChanges', {
                    count: acceptedSuggestions.length,
                    defaultValue: `Apply Changes (${acceptedSuggestions.length})`,
                  })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const PrioritizeTasksDialog = defineModal<
  PrioritizeTasksDialogProps,
  PrioritizeResult | undefined
>(PrioritizeTasksDialogImpl);
