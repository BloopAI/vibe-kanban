import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EditorType, TaskAttempt } from 'shared/types';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';

interface EditorSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAttempt: TaskAttempt | null;
}

export function EditorSelectionDialog({
  isOpen,
  onClose,
  selectedAttempt,
}: EditorSelectionDialogProps) {
  const handleOpenInEditor = useOpenInEditor(selectedAttempt, onClose);
  const [selectedEditor, setSelectedEditor] = useState<EditorType>(
    EditorType.VS_CODE
  );

  const handleConfirm = () => {
    handleOpenInEditor(selectedEditor);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
              onValueChange={(value) => setSelectedEditor(value as EditorType)}
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
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Open Editor</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
