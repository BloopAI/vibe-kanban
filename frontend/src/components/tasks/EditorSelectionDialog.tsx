import { useContext, useState } from 'react';
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
import type { EditorType } from 'shared/types';
import { TaskDetailsContext } from '@/components/context/taskDetailsContext.ts';

interface EditorSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const editorOptions: {
  value: EditorType;
  label: string;
  description: string;
}[] = [
  {
    value: 'vscode',
    label: 'Visual Studio Code',
    description: "Microsoft's popular code editor",
  },
  {
    value: 'cursor',
    label: 'Cursor',
    description: 'AI-powered code editor',
  },
  {
    value: 'windsurf',
    label: 'Windsurf',
    description: 'Modern code editor',
  },
  {
    value: 'intellij',
    label: 'IntelliJ IDEA',
    description: 'JetBrains IDE',
  },
  {
    value: 'zed',
    label: 'Zed',
    description: 'High-performance code editor',
  },
  {
    value: 'custom',
    label: 'Custom Editor',
    description: 'Use your configured custom editor',
  },
];

export function EditorSelectionDialog({
  isOpen,
  onClose,
}: EditorSelectionDialogProps) {
  const { handleOpenInEditor } = useContext(TaskDetailsContext);
  const [selectedEditor, setSelectedEditor] = useState<EditorType>('vscode');

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
                {editorOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
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
