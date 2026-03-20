import { Button } from '@vibe/ui/components/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vibe/ui/components/KeyboardDialog';
import { create, useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/shared/lib/modals';
import { IdeIcon } from '@/shared/components/IdeIcon';
import { getIdeName } from '@/shared/lib/ideName';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import type { EditorPickerRepo, EditorType } from 'shared/types';

export interface WorkspaceEditorPickerDialogProps {
  repos: EditorPickerRepo[];
  workspaceId: string;
}

export type WorkspaceEditorPickerResult =
  | { type: 'global' }
  | { type: 'repo'; repoId: string }
  | null;

const WorkspaceEditorPickerDialogImpl =
  create<WorkspaceEditorPickerDialogProps>(({ repos }) => {
    const modal = useModal();
    const { config } = useUserSystem();
    const globalEditorType = config?.editor?.editor_type ?? null;

    const handleSelect = (result: WorkspaceEditorPickerResult) => {
      modal.resolve(result);
      modal.hide();
    };

    const handleCancel = () => {
      modal.resolve(null);
      modal.hide();
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && handleCancel()}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Open in IDE</DialogTitle>
            <DialogDescription>
              This workspace has multiple repositories. Choose which one to
              open.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1 py-2">
            <button
              className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-left hover:bg-secondary transition-colors"
              onClick={() => handleSelect({ type: 'global' })}
            >
              <IdeIcon editorType={globalEditorType} className="h-5 w-5" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-normal truncate">
                  Open workspace folder
                </span>
                <span className="text-xs text-low">
                  {getIdeName(globalEditorType)} (global setting)
                </span>
              </div>
            </button>
            <div className="border-t border-primary my-1" />
            {repos.map((repo) => {
              const effectiveEditor = (repo.effective_editor_type ??
                globalEditorType) as EditorType | null;
              return (
                <button
                  key={repo.id}
                  className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-left hover:bg-secondary transition-colors"
                  onClick={() =>
                    handleSelect({ type: 'repo', repoId: repo.id })
                  }
                >
                  <IdeIcon editorType={effectiveEditor} className="h-5 w-5" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-normal truncate">
                      {repo.display_name}
                    </span>
                    <span className="text-xs text-low">
                      {getIdeName(effectiveEditor)}
                      {repo.effective_editor_type ? ' (repo override)' : ''}
                      {repo.editor_launch_target
                        ? ` \u2192 ${repo.editor_launch_target}`
                        : ''}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });

export const WorkspaceEditorPickerDialog = defineModal<
  WorkspaceEditorPickerDialogProps,
  WorkspaceEditorPickerResult
>(WorkspaceEditorPickerDialogImpl);
