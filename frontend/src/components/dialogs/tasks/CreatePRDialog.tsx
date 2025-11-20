import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@radix-ui/react-label';
import { Textarea } from '@/components/ui/textarea.tsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import BranchSelector from '@/components/tasks/BranchSelector';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { attemptsApi } from '@/lib/api.ts';
import { useTranslation } from 'react-i18next';

import { GitBranch, TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { projectsApi } from '@/lib/api.ts';
import { Loader2 } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useAuth } from '@/hooks';
import {
  GhCliHelpInstructions,
  GhCliSetupDialog,
  mapGhCliErrorToUi,
} from '@/components/dialogs/auth/GhCliSetupDialog';
import type {
  GhCliSupportContent,
  GhCliSupportVariant,
} from '@/components/dialogs/auth/GhCliSetupDialog';
import type { GhCliSetupError } from 'shared/types';
import { useUserSystem } from '@/components/ConfigProvider';
import { defineModal } from '@/lib/modals';

interface CreatePRDialogProps {
  attempt: TaskAttempt;
  task: TaskWithAttemptStatus;
  projectId: string;
}

const CreatePRDialogImpl = NiceModal.create<CreatePRDialogProps>(
  ({ attempt, task, projectId }) => {
    const modal = useModal();
    const { t } = useTranslation('tasks');
    const { isLoaded } = useAuth();
    const { environment } = useUserSystem();
    const [prTitle, setPrTitle] = useState('');
    const [prBody, setPrBody] = useState('');
    const [prBaseBranch, setPrBaseBranch] = useState('');
    const [creatingPR, setCreatingPR] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ghCliHelp, setGhCliHelp] = useState<GhCliSupportContent | null>(
      null
    );
    const [branches, setBranches] = useState<GitBranch[]>([]);
    const [branchesLoading, setBranchesLoading] = useState(false);

    const getGhCliHelpTitle = (variant: GhCliSupportVariant) =>
      variant === 'homebrew'
        ? 'Homebrew is required for automatic setup'
        : 'GitHub CLI needs manual setup';

    useEffect(() => {
      if (!modal.visible || !isLoaded) {
        return;
      }

      setPrTitle(`${task.title} (vibe-kanban)`);
      setPrBody(task.description || '');

      // Always fetch branches for dropdown population
      if (projectId) {
        setBranchesLoading(true);
        projectsApi
          .getBranches(projectId)
          .then((projectBranches) => {
            setBranches(projectBranches);

            // Set smart default: task target branch OR current branch
            if (attempt.target_branch) {
              setPrBaseBranch(attempt.target_branch);
            } else {
              const currentBranch = projectBranches.find((b) => b.is_current);
              if (currentBranch) {
                setPrBaseBranch(currentBranch.name);
              }
            }
          })
          .catch(console.error)
          .finally(() => setBranchesLoading(false));
      }

      setError(null); // Reset error when opening
      setGhCliHelp(null);
    }, [modal.visible, isLoaded, task, attempt, projectId]);

    const isMacEnvironment = useMemo(
      () => environment?.os_type?.toLowerCase().includes('mac'),
      [environment?.os_type]
    );

    const handleConfirmCreatePR = useCallback(async () => {
      if (!projectId || !attempt.id) return;

      setError(null);
      setGhCliHelp(null);
      setCreatingPR(true);

      const handleGhCliSetupOutcome = (
        setupResult: GhCliSetupError | null,
        fallbackMessage: string
      ) => {
        if (setupResult === null) {
          setError(null);
          setGhCliHelp(null);
          setCreatingPR(false);
          modal.hide();
          return;
        }

        const ui = mapGhCliErrorToUi(setupResult, fallbackMessage, t);

        if (ui.variant) {
          setGhCliHelp(ui);
          setError(null);
          return;
        }

        setGhCliHelp(null);
        setError(ui.message);
      };

      const result = await attemptsApi.createPR(attempt.id, {
        title: prTitle,
        body: prBody || null,
        target_branch: prBaseBranch || null,
      });

      if (result.success) {
        setPrTitle('');
        setPrBody('');
        setPrBaseBranch('');
        setCreatingPR(false);
        modal.hide();
        return;
      }

      setCreatingPR(false);

      const defaultGhCliErrorMessage =
        result.message || 'Failed to run GitHub CLI setup.';

      const showGhCliSetupDialog = async () => {
        const setupResult = await GhCliSetupDialog.show({
          attemptId: attempt.id,
        });

        handleGhCliSetupOutcome(setupResult, defaultGhCliErrorMessage);
      };

      if (result.error) {
        if (
          result.error.type === 'github_cli_not_installed' ||
          result.error.type === 'github_cli_not_logged_in'
        ) {
          if (isMacEnvironment) {
            await showGhCliSetupDialog();
          } else {
            const ui = mapGhCliErrorToUi(
              'SETUP_HELPER_NOT_SUPPORTED',
              defaultGhCliErrorMessage,
              t
            );
            setGhCliHelp(ui.variant ? ui : null);
            setError(ui.variant ? null : ui.message);
          }
          return;
        } else if (
          result.error.type === 'git_cli_not_installed' ||
          result.error.type === 'git_cli_not_logged_in'
        ) {
          const gitCliErrorKey =
            result.error.type === 'git_cli_not_logged_in'
              ? 'createPrDialog.errors.gitCliNotLoggedIn'
              : 'createPrDialog.errors.gitCliNotInstalled';

          setError(result.message || t(gitCliErrorKey));
          setGhCliHelp(null);
          return;
        }
      }

      if (result.message) {
        setError(result.message);
        setGhCliHelp(null);
      } else {
        setError(t('createPrDialog.errors.failedToCreate'));
        setGhCliHelp(null);
      }
    }, [
      attempt,
      projectId,
      prBaseBranch,
      prBody,
      prTitle,
      modal,
      isMacEnvironment,
      t,
    ]);

    const handleCancelCreatePR = useCallback(() => {
      modal.hide();
      // Reset form to empty state
      setPrTitle('');
      setPrBody('');
      setPrBaseBranch('');
    }, [modal]);

    return (
      <>
        <Dialog
          open={modal.visible}
          onOpenChange={() => handleCancelCreatePR()}
        >
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>{t('createPrDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('createPrDialog.description')}
              </DialogDescription>
            </DialogHeader>
            {!isLoaded ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="pr-title">
                    {t('createPrDialog.titleLabel')}
                  </Label>
                  <Input
                    id="pr-title"
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    placeholder={t('createPrDialog.titlePlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pr-body">
                    {t('createPrDialog.descriptionLabel')}
                  </Label>
                  <Textarea
                    id="pr-body"
                    value={prBody}
                    onChange={(e) => setPrBody(e.target.value)}
                    placeholder={t('createPrDialog.descriptionPlaceholder')}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pr-base">
                    {t('createPrDialog.baseBranchLabel')}
                  </Label>
                  <BranchSelector
                    branches={branches}
                    selectedBranch={prBaseBranch}
                    onBranchSelect={setPrBaseBranch}
                    placeholder={
                      branchesLoading
                        ? t('createPrDialog.loadingBranches')
                        : t('createPrDialog.selectBaseBranch')
                    }
                    className={
                      branchesLoading ? 'opacity-50 cursor-not-allowed' : ''
                    }
                  />
                </div>
                {ghCliHelp?.variant && (
                  <Alert variant="default">
                    <AlertTitle>
                      {getGhCliHelpTitle(ghCliHelp.variant)}
                    </AlertTitle>
                    <AlertDescription className="space-y-3">
                      <p>{ghCliHelp.message}</p>
                      <GhCliHelpInstructions
                        variant={ghCliHelp.variant}
                        t={t}
                      />
                    </AlertDescription>
                  </Alert>
                )}
                {error && <Alert variant="destructive">{error}</Alert>}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={handleCancelCreatePR}>
                {t('common:buttons.cancel')}
              </Button>
              <Button
                onClick={handleConfirmCreatePR}
                disabled={creatingPR || !prTitle.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {creatingPR ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('createPrDialog.creating')}
                  </>
                ) : (
                  t('createPrDialog.createButton')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

export const CreatePRDialog = defineModal<CreatePRDialogProps, void>(
  CreatePRDialogImpl
);
