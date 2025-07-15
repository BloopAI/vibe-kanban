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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Code } from 'lucide-react';
import type { EditorType, ExecutorConfig } from 'shared/types';
import {
  EXECUTOR_TYPES,
  EDITOR_TYPES,
  EXECUTOR_LABELS,
  EDITOR_LABELS,
} from 'shared/types';

interface OnboardingDialogProps {
  open: boolean;
  onComplete: (config: {
    executor: ExecutorConfig;
    editor: { editor_type: EditorType; custom_command: string | null };
  }) => void;
}

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const [executor, setExecutor] = useState<ExecutorConfig>({ type: 'claude' });
  const [editorType, setEditorType] = useState<EditorType>('vscode');
  const [customCommand, setCustomCommand] = useState<string>('');

  const handleComplete = () => {
    onComplete({
      executor,
      editor: {
        editor_type: editorType,
        custom_command: editorType === 'custom' ? customCommand || null : null,
      },
    });
  };

  const isValid =
    editorType !== 'custom' ||
    (editorType === 'custom' && customCommand.trim() !== '');

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <DialogTitle>Welcome to Vibe Kanban</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Let's set up your coding preferences. You can always change these
            later in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Choose Your Coding Agent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="executor">Default Executor</Label>
                <Select
                  value={executor.type}
                  onValueChange={(value) => setExecutor({ type: value as any })}
                >
                  <SelectTrigger id="executor">
                    <SelectValue placeholder="Select your preferred coding agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXECUTOR_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {EXECUTOR_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {executor.type === 'claude' && 'Claude Code from Anthropic'}
                  {executor.type === 'amp' && 'From Sourcegraph'}
                  {executor.type === 'gemini' && 'Google Gemini from Bloop'}
                  {executor.type === 'charmopencode' &&
                    'Charm/Opencode AI assistant'}
                  {executor.type === 'echo' &&
                    'This is just for debugging vibe-kanban itself'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                Choose Your Code Editor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editor">Preferred Editor</Label>
                <Select
                  value={editorType}
                  onValueChange={(value: EditorType) => setEditorType(value)}
                >
                  <SelectTrigger id="editor">
                    <SelectValue placeholder="Select your preferred editor" />
                  </SelectTrigger>
                  <SelectContent>
                    {EDITOR_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {EDITOR_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  This editor will be used to open task attempts and project
                  files.
                </p>
              </div>

              {editorType === 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="custom-command">Custom Command</Label>
                  <Input
                    id="custom-command"
                    placeholder="e.g., code, subl, vim"
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the command to run your custom editor. Use spaces for
                    arguments (e.g., "code --wait").
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button
            onClick={handleComplete}
            disabled={!isValid}
            className="w-full"
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
