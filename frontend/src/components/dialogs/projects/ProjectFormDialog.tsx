import { useMemo, useRef } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

import { ExistingRepoPanel } from './ExistingRepoPanel';
import { NewProjectPanel } from './NewProjectPanel';
import { selectExistingView, selectNewView } from './project-form-reducer';
import { useProjectFormController } from './useProjectFormController';

export interface ProjectFormDialogProps {
  // No props needed - this is only for creating projects now
}

export type ProjectFormDialogResult = 'saved' | 'canceled';

export const ProjectFormDialog = NiceModal.create<ProjectFormDialogProps>(
  () => {
    const modal = useModal();
    const closingReasonRef = useRef<ProjectFormDialogResult | null>(null);

    const { state, dispatch, submitting } = useProjectFormController({
      onSuccess: () => {
        closingReasonRef.current = 'saved';
        modal.resolve('saved');
        modal.hide();
      },
    });

    const existingView = useMemo(() => selectExistingView(state), [state]);
    const newView = useMemo(() => selectNewView(state), [state]);

    const handleCancel = () => {
      dispatch({ type: 'CANCEL' });
      closingReasonRef.current = 'canceled';
      modal.resolve('canceled');
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (open) return;
      if (closingReasonRef.current) {
        closingReasonRef.current = null;
        return;
      }
      handleCancel();
    };

    const showingExisting = existingView.status !== 'hidden';

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>Choose your repository source</DialogDescription>
          </DialogHeader>

          <div className="mx-auto w-full max-w-2xl overflow-x-hidden px-1">
            {showingExisting ? (
              <ExistingRepoPanel
                view={existingView}
                dispatch={dispatch}
                isSubmitting={submitting}
              />
            ) : newView.status === 'editing' ? (
              <NewProjectPanel
                view={newView}
                dispatch={dispatch}
                isSubmitting={submitting}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);
