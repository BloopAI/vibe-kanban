import { useState } from 'react';
import { Button } from '@vibe/ui/components/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vibe/ui/components/KeyboardDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vibe/ui/components/Select';
import { EditorType } from 'shared/types';
import { useOpenInEditor } from '@/shared/hooks/useOpenInEditor';
import { create, useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/shared/lib/modals';

export interface EditorSelectionDialogProps {
  selectedAttemptId?: string;
  filePath?: string;
  repoId?: string;
  hasExistingOverride?: boolean;
}

const EditorSelectionDialogImpl = create<EditorSelectionDialogProps>(
  ({ selectedAttemptId, filePath, repoId, hasExistingOverride }) => {
    const modal = useModal();
    const handleOpenInEditor = useOpenInEditor(selectedAttemptId, () =>
      modal.hide()
    );
    const [selectedEditor, setSelectedEditor] = useState<EditorType>(
      EditorType.VS_CODE
    );

    const handleConfirm = async () => {
      // If triggered from a repo context with an existing override, update the repo override
      if (repoId && hasExistingOverride) {
        try {
          const { repoApi } = await import('@/shared/lib/api');
          await repoApi.update(repoId, {
            editor_type_override: selectedEditor,
          });
        } catch {
          // Ignore — the user can update it manually later
        }
      }
      handleOpenInEditor({ editorType: selectedEditor, filePath });
      modal.resolve(selectedEditor);
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
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Choose Editor</DialogTitle>
            <DialogDescription>
              The default editor failed to open. Please select an alternative
              editor to open the task worktree.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Editor</label>
              <Select
                value={selectedEditor}
                onValueChange={(value) =>
                  setSelectedEditor(value as EditorType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(EditorType).map((editor) => (
                    <SelectItem key={editor} value={editor}>
                      {editor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleConfirm}>Open Editor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const EditorSelectionDialog = defineModal<
  EditorSelectionDialogProps,
  EditorType | null
>(EditorSelectionDialogImpl);
