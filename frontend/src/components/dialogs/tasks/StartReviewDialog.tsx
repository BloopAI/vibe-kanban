import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { AgentSelector } from '@/components/tasks/AgentSelector';
import { ConfigSelector } from '@/components/tasks/ConfigSelector';
import { useUserSystem } from '@/components/ConfigProvider';
import { sessionsApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import type { ExecutorProfileId } from 'shared/types';

export interface StartReviewDialogProps {
  sessionId?: string;
  workspaceId: string;
  reviewMarkdown?: string;
  defaultProfile?: ExecutorProfileId | null;
  onSuccess?: (newSessionId?: string) => void;
}

const StartReviewDialogImpl = NiceModal.create<StartReviewDialogProps>(
  ({ sessionId, workspaceId, reviewMarkdown, defaultProfile, onSuccess }) => {
    const modal = useModal();
    const queryClient = useQueryClient();
    const { profiles } = useUserSystem();
    const { t } = useTranslation(['tasks', 'common']);

    const [selectedProfile, setSelectedProfile] =
      useState<ExecutorProfileId | null>(defaultProfile ?? null);
    const [additionalPrompt, setAdditionalPrompt] = useState('');
    const [createNewSession, setCreateNewSession] = useState(!sessionId);
    const [includeGitContext, setIncludeGitContext] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const effectiveProfile = selectedProfile ?? defaultProfile ?? null;

    const canSubmit = Boolean(effectiveProfile && !isSubmitting);

    const handleSubmit = useCallback(async () => {
      if (!effectiveProfile) return;

      setIsSubmitting(true);
      setError(null);

      try {
        let targetSessionId = sessionId;

        if (createNewSession || !sessionId) {
          const session = await sessionsApi.create({
            workspace_id: workspaceId,
            executor: effectiveProfile.executor,
          });
          targetSessionId = session.id;

          queryClient.invalidateQueries({
            queryKey: ['workspaceSessions', workspaceId],
          });
        }

        if (!targetSessionId) {
          setError('Failed to create session');
          setIsSubmitting(false);
          return;
        }

        const promptParts = [reviewMarkdown, additionalPrompt].filter(Boolean);
        const combinedPrompt = promptParts.join('\n\n');

        await sessionsApi.startReview(targetSessionId, {
          executor_profile_id: effectiveProfile,
          additional_prompt: combinedPrompt || null,
          use_all_workspace_commits: includeGitContext,
        });

        queryClient.invalidateQueries({
          queryKey: ['processes', workspaceId],
        });
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', workspaceId],
        });

        const createdNewSession = targetSessionId !== sessionId;
        onSuccess?.(createdNewSession ? targetSessionId : undefined);
        modal.hide();
      } catch (err) {
        console.error('Failed to start review:', err);
        setError('Failed to start review. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    }, [
      effectiveProfile,
      sessionId,
      workspaceId,
      createNewSession,
      includeGitContext,
      reviewMarkdown,
      additionalPrompt,
      queryClient,
      onSuccess,
      modal,
    ]);

    const handleOpenChange = (open: boolean) => {
      if (!open) modal.hide();
    };

    const handleNewSessionChange = (checked: boolean) => {
      setCreateNewSession(checked);
      if (!checked && defaultProfile) {
        setSelectedProfile(defaultProfile);
      }
    };

    const hasReviewComments = Boolean(reviewMarkdown);

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="additional-prompt"
                className="text-sm font-medium"
              >
                {t('startReviewDialog.additionalInstructions')}
              </Label>
              <Textarea
                id="additional-prompt"
                value={additionalPrompt}
                onChange={(e) => setAdditionalPrompt(e.target.value)}
                placeholder="Add any specific instructions for the review..."
                className="min-h-[80px] resize-none"
              />
            </div>

            {hasReviewComments && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t('startReviewDialog.reviewComments', {
                    count:
                      reviewMarkdown
                        ?.split('\n')
                        .filter((l) => l.startsWith('-')).length ?? 0,
                  })}
                </Label>
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 max-h-32 overflow-y-auto">
                  <pre className="whitespace-pre-wrap font-sans text-xs">
                    {reviewMarkdown}
                  </pre>
                </div>
              </div>
            )}

            {error && <div className="text-sm text-destructive">{error}</div>}

            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-git-context"
                  checked={includeGitContext}
                  onCheckedChange={(checked) =>
                    setIncludeGitContext(checked === true)
                  }
                />
                <Label
                  htmlFor="include-git-context"
                  className="cursor-pointer text-sm"
                >
                  {t('startReviewDialog.includeGitContext')}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                {t('startReviewDialog.includeGitContextDescription')}
              </p>
            </div>

            {profiles && (
              <div className="flex gap-3 flex-col sm:flex-row">
                <AgentSelector
                  profiles={profiles}
                  selectedExecutorProfile={effectiveProfile}
                  onChange={setSelectedProfile}
                  disabled={!createNewSession}
                  showLabel={false}
                />
                <ConfigSelector
                  profiles={profiles}
                  selectedExecutorProfile={effectiveProfile}
                  onChange={setSelectedProfile}
                  showLabel={false}
                />
              </div>
            )}
          </div>

          <DialogFooter className="sm:!justify-between">
            <Button
              variant="outline"
              onClick={() => modal.hide()}
              disabled={isSubmitting}
            >
              {t('common:buttons.cancel')}
            </Button>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="new-session-switch"
                  checked={createNewSession}
                  onCheckedChange={handleNewSessionChange}
                  disabled={!sessionId}
                  className="!bg-border data-[state=checked]:!bg-foreground disabled:opacity-50"
                  aria-label={t('startReviewDialog.newSession')}
                />
                <Label
                  htmlFor="new-session-switch"
                  className="text-sm cursor-pointer"
                >
                  {t('startReviewDialog.newSession')}
                </Label>
              </div>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {isSubmitting
                  ? t('actionsMenu.startingReview')
                  : t('actionsMenu.startReview')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const StartReviewDialog = defineModal<StartReviewDialogProps, void>(
  StartReviewDialogImpl
);
