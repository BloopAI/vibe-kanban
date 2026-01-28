import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AgentSelector } from '@/components/tasks/AgentSelector';
import { ConfigSelector } from '@/components/tasks/ConfigSelector';
import { useUserSystem } from '@/components/ConfigProvider';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { attemptsApi, sessionsApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import {
  buildResolveConflictsInstructions,
  displayConflictOpLabel,
} from '@/lib/conflicts';
import type {
  BaseCodingAgent,
  ExecutorProfileId,
  ConflictOp,
} from 'shared/types';

export interface ResolveConflictsDialogProps {
  workspaceId: string;
  conflictOp: ConflictOp;
  sourceBranch: string | null;
  targetBranch: string;
  conflictedFiles: string[];
  repoName?: string;
  repoId?: string;
}

export type ResolveConflictsDialogResult =
  | { action: 'resolved'; sessionId?: string }
  | { action: 'continued' }
  | { action: 'aborted' }
  | { action: 'cancelled' };

const ResolveConflictsDialogImpl =
  NiceModal.create<ResolveConflictsDialogProps>(
    ({
      workspaceId,
      conflictOp,
      sourceBranch,
      targetBranch,
      conflictedFiles,
      repoName,
      repoId,
    }) => {
      const modal = useModal();
      const queryClient = useQueryClient();
      const { profiles, config } = useUserSystem();
      const { sessions, selectedSession, selectedSessionId, selectSession } =
        useWorkspaceContext();
      const { t } = useTranslation(['tasks', 'common']);

      const hasConflicts = conflictedFiles.length > 0;
      const opLabel = displayConflictOpLabel(conflictOp);

      const resolvedSession = useMemo(() => {
        if (!selectedSessionId) return selectedSession ?? null;
        return (
          sessions.find((session) => session.id === selectedSessionId) ??
          selectedSession ??
          null
        );
      }, [sessions, selectedSessionId, selectedSession]);
      const sessionExecutor =
        resolvedSession?.executor as BaseCodingAgent | null;

      const resolvedDefaultProfile = useMemo(() => {
        if (sessionExecutor) {
          const variant =
            config?.executor_profile?.executor === sessionExecutor
              ? config.executor_profile.variant
              : null;
          return { executor: sessionExecutor, variant };
        }
        return config?.executor_profile ?? null;
      }, [sessionExecutor, config?.executor_profile]);

      // Default to creating a new session if no existing session
      const [createNewSession, setCreateNewSession] =
        useState(!selectedSessionId);
      const [userSelectedProfile, setUserSelectedProfile] =
        useState<ExecutorProfileId | null>(null);
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [error, setError] = useState<string | null>(null);

      const effectiveProfile = userSelectedProfile ?? resolvedDefaultProfile;
      const canSubmit = Boolean(effectiveProfile && !isSubmitting);

      // Build the conflict resolution instructions
      const conflictInstructions = useMemo(
        () =>
          buildResolveConflictsInstructions(
            sourceBranch,
            targetBranch,
            conflictedFiles,
            conflictOp,
            repoName
          ),
        [sourceBranch, targetBranch, conflictedFiles, conflictOp, repoName]
      );

      const handleSubmit = useCallback(async () => {
        if (!effectiveProfile) return;

        setIsSubmitting(true);
        setError(null);

        try {
          let targetSessionId = selectedSessionId;
          const creatingNewSession = createNewSession || !selectedSessionId;

          // Create new session if user selected that option or no existing session
          if (creatingNewSession) {
            const session = await sessionsApi.create({
              workspace_id: workspaceId,
              executor: effectiveProfile.executor,
            });
            targetSessionId = session.id;
          }

          if (!targetSessionId) {
            setError('Failed to create session');
            setIsSubmitting(false);
            return;
          }

          // Send follow-up with conflict resolution instructions
          await sessionsApi.followUp(targetSessionId, {
            prompt: conflictInstructions,
            executor_profile_id: effectiveProfile,
            retry_process_id: null,
            force_when_dirty: null,
            perform_git_reset: null,
          });

          // Invalidate queries and wait for them to complete
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: ['workspaceSessions', workspaceId],
            }),
            queryClient.invalidateQueries({
              queryKey: ['processes', workspaceId],
            }),
            queryClient.invalidateQueries({
              queryKey: ['branchStatus', workspaceId],
            }),
          ]);

          // Navigate to the new session if one was created
          // Do this after queries are refreshed so the session exists in the list
          if (creatingNewSession && targetSessionId) {
            selectSession(targetSessionId);
          }

          modal.resolve({
            action: 'resolved',
            sessionId: creatingNewSession ? targetSessionId : undefined,
          } as ResolveConflictsDialogResult);
          modal.hide();
        } catch (err) {
          console.error('Failed to resolve conflicts:', err);
          setError('Failed to start conflict resolution. Please try again.');
        } finally {
          setIsSubmitting(false);
        }
      }, [
        effectiveProfile,
        selectedSessionId,
        createNewSession,
        workspaceId,
        conflictInstructions,
        queryClient,
        selectSession,
        modal,
      ]);

      const handleCancel = useCallback(() => {
        modal.resolve({ action: 'cancelled' } as ResolveConflictsDialogResult);
        modal.hide();
      }, [modal]);

      const handleContinue = useCallback(async () => {
        if (!repoId) return;

        setIsSubmitting(true);
        setError(null);

        try {
          await attemptsApi.continueConflicts(workspaceId, { repo_id: repoId });

          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: ['branchStatus', workspaceId],
            }),
            queryClient.invalidateQueries({
              queryKey: ['attemptRepo', workspaceId],
            }),
          ]);

          modal.resolve({ action: 'continued' } as ResolveConflictsDialogResult);
          modal.hide();
        } catch (err) {
          console.error('Failed to continue operation:', err);
          setError(
            t(
              'resolveConflicts.dialog.continueError',
              'Failed to continue. Please try again.'
            )
          );
        } finally {
          setIsSubmitting(false);
        }
      }, [repoId, workspaceId, queryClient, modal, t]);

      const handleAbort = useCallback(async () => {
        if (!repoId) return;

        setIsSubmitting(true);
        setError(null);

        try {
          await attemptsApi.abortConflicts(workspaceId, { repo_id: repoId });

          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: ['branchStatus', workspaceId],
            }),
            queryClient.invalidateQueries({
              queryKey: ['attemptRepo', workspaceId],
            }),
          ]);

          modal.resolve({ action: 'aborted' } as ResolveConflictsDialogResult);
          modal.hide();
        } catch (err) {
          console.error('Failed to abort operation:', err);
          setError(
            t(
              'resolveConflicts.dialog.abortError',
              'Failed to abort. Please try again.'
            )
          );
        } finally {
          setIsSubmitting(false);
        }
      }, [repoId, workspaceId, queryClient, modal, t]);

      const handleOpenChange = (open: boolean) => {
        if (!open) handleCancel();
      };

      const handleNewSessionChange = (checked: boolean) => {
        setCreateNewSession(checked);
        // Reset to default profile when toggling back to existing session
        if (!checked && resolvedDefaultProfile) {
          setUserSelectedProfile(resolvedDefaultProfile);
        }
      };

      const hasExistingSession = Boolean(selectedSessionId);

      // Show simpler dialog when no conflicts (just continue or abort)
      if (!hasConflicts) {
        return (
          <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>
                  {t('resolveConflicts.dialog.inProgressTitle', {
                    defaultValue: '{{op}} in Progress',
                    op: opLabel,
                  })}
                </DialogTitle>
                <DialogDescription>
                  {t('resolveConflicts.dialog.inProgressDescription', {
                    defaultValue:
                      'A {{op}} operation is in progress. You can continue or abort.',
                    op: opLabel.toLowerCase(),
                  })}
                </DialogDescription>
              </DialogHeader>

              {error && (
                <div className="text-sm text-destructive">{error}</div>
              )}

              <DialogFooter className="sm:!justify-between">
                <Button
                  variant="outline"
                  onClick={handleAbort}
                  disabled={isSubmitting || !repoId}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  {isSubmitting
                    ? t('resolveConflicts.dialog.aborting', 'Aborting...')
                    : t('resolveConflicts.dialog.abort', {
                        defaultValue: 'Abort {{op}}',
                        op: opLabel,
                      })}
                </Button>
                <Button
                  onClick={handleContinue}
                  disabled={isSubmitting || !repoId}
                >
                  {isSubmitting
                    ? t('resolveConflicts.dialog.continuing', 'Continuing...')
                    : t('resolveConflicts.dialog.continue', {
                        defaultValue: 'Continue {{op}}',
                        op: opLabel,
                      })}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      }

      return (
        <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {t('resolveConflicts.dialog.title', 'Resolve Conflicts')}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'resolveConflicts.dialog.description',
                  'Conflicts were detected. Choose how you want the agent to resolve them.'
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Conflict summary */}
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="font-medium text-warning-foreground dark:text-warning">
                  {t('resolveConflicts.dialog.filesWithConflicts', {
                    count: conflictedFiles.length,
                  })}
                </p>
                {conflictedFiles.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-warning-foreground/80 dark:text-warning/80">
                    {conflictedFiles.slice(0, 5).map((file) => (
                      <li key={file} className="truncate">
                        {file}
                      </li>
                    ))}
                    {conflictedFiles.length > 5 && (
                      <li className="text-warning-foreground/60 dark:text-warning/60">
                        {t('resolveConflicts.dialog.andMore', {
                          count: conflictedFiles.length - 5,
                        })}
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {error && <div className="text-sm text-destructive">{error}</div>}

              {/* Agent/profile selector - only show when creating new session */}
              {profiles && createNewSession && (
                <div className="flex gap-3 flex-col sm:flex-row">
                  <AgentSelector
                    profiles={profiles}
                    selectedExecutorProfile={effectiveProfile}
                    onChange={setUserSelectedProfile}
                    showLabel={false}
                  />
                  <ConfigSelector
                    profiles={profiles}
                    selectedExecutorProfile={effectiveProfile}
                    onChange={setUserSelectedProfile}
                    showLabel={false}
                  />
                </div>
              )}
            </div>

            <DialogFooter className="sm:!justify-between">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                {t('common:buttons.cancel')}
              </Button>
              <div className="flex items-center gap-3">
                {hasExistingSession && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="new-session-switch"
                      checked={createNewSession}
                      onCheckedChange={handleNewSessionChange}
                      className="!bg-border data-[state=checked]:!bg-foreground disabled:opacity-50"
                      aria-label={t(
                        'resolveConflicts.dialog.newSession',
                        'New Session'
                      )}
                    />
                    <Label
                      htmlFor="new-session-switch"
                      className="text-sm cursor-pointer"
                    >
                      {t('resolveConflicts.dialog.newSession', 'New Session')}
                    </Label>
                  </div>
                )}
                <Button onClick={handleSubmit} disabled={!canSubmit}>
                  {isSubmitting
                    ? t('resolveConflicts.dialog.resolving', 'Starting...')
                    : t('resolveConflicts.dialog.resolve', 'Resolve Conflicts')}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  );

export const ResolveConflictsDialog = defineModal<
  ResolveConflictsDialogProps,
  ResolveConflictsDialogResult
>(ResolveConflictsDialogImpl);
