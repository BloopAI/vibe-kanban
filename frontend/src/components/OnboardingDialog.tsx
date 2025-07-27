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
import { useTranslation } from '@/lib/i18n';

interface OnboardingDialogProps {
  open: boolean;
  onComplete: (config: {
    executor: ExecutorConfig;
    editor: { editor_type: EditorType; custom_command: string | null };
  }) => void;
}

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const { t } = useTranslation();
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
            <DialogTitle>{t('onboarding.title')}</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            {t('onboarding.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
{t('onboarding.codingAgent.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="executor">{t('onboarding.codingAgent.label')}</Label>
                <Select
                  value={executor.type}
                  onValueChange={(value) => setExecutor({ type: value as any })}
                >
                  <SelectTrigger id="executor">
                    <SelectValue placeholder={t('onboarding.codingAgent.placeholder')} />
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
                  {executor.type === 'claude' && t('onboarding.codingAgent.descriptions.claude')}
                  {executor.type === 'amp' && t('onboarding.codingAgent.descriptions.amp')}
                  {executor.type === 'gemini' && t('onboarding.codingAgent.descriptions.gemini')}
                  {executor.type === 'charm-opencode' && t('onboarding.codingAgent.descriptions.charmOpencode')}
                  {executor.type === 'claude-code-router' && t('onboarding.codingAgent.descriptions.claudeCodeRouter')}
                  {executor.type === 'echo' && t('onboarding.codingAgent.descriptions.echo')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-4 w-4" />
{t('onboarding.codeEditor.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editor">{t('onboarding.codeEditor.label')}</Label>
                <Select
                  value={editorType}
                  onValueChange={(value: EditorType) => setEditorType(value)}
                >
                  <SelectTrigger id="editor">
                    <SelectValue placeholder={t('onboarding.codeEditor.placeholder')} />
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
                  {t('onboarding.codeEditor.description')}
                </p>
              </div>

              {editorType === 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="custom-command">{t('onboarding.codeEditor.customCommand')}</Label>
                  <Input
                    id="custom-command"
                    placeholder={t('onboarding.codeEditor.customPlaceholder')}
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('onboarding.codeEditor.customDescription')}
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
{t('onboarding.continueButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
