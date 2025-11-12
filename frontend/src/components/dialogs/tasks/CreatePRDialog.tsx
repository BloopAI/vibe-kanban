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

import {
  GitBranch,
  GitHubServiceError,
  TaskAttempt,
  TaskWithAttemptStatus,
} from 'shared/types';
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
import { useUserSystem } from '@/components/config-provider';
const CreatePrDialog = NiceModal.create(() => {
  const modal = useModal();
  const { t } = useTranslation();
  const { isLoaded } = useAuth();
  const { environment } = useUserSystem();
  const data = modal.args as
    | { attempt: TaskAttempt; task: TaskWithAttemptStatus; projectId: string }
    | undefined;
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prBaseBranch, setPrBaseBranch] = useState('');
  const [creatingPR, setCreatingPR] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ghCliHelp, setGhCliHelp] = useState<GhCliSupportContent | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  const getGhCliHelpTitle = (variant: GhCliSupportVariant) =>
    variant === 'homebrew'
      ? 'Homebrew is required for automatic setup'
      : 'GitHub CLI needs manual setup';

  useEffect(() => {
    if (!modal.visible || !data || !isLoaded) {
      return;
    }

    setPrTitle(`${data.task.title} (vibe-kanban)`);
    setPrBody(data.task.description || '');

    // Always fetch branches for dropdown population
    if (data.projectId) {
      setBranchesLoading(true);
      projectsApi
        .getBranches(data.projectId)
        .then((projectBranches) => {
          setBranches(projectBranches);

          // Set smart default: task target branch OR current branch
          if (data.attempt.target_branch) {
            setPrBaseBranch(data.attempt.target_branch);
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
  }, [modal.visible, data, isLoaded]);

  const isMacEnvironment = useMemo(
    () => environment?.os_type?.toLowerCase().includes('mac'),
    [environment?.os_type]
  );

  const handleConfirmCreatePR = useCallback(async () => {
    if (!data?.projectId || !data?.attempt.id) return;

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

    const result = await attemptsApi.createPR(data.attempt.id, {
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
      const setupResult = (await NiceModal.show(GhCliSetupDialog, {
        attemptId: data.attempt.id,
      })) as GhCliSetupError | null;

      handleGhCliSetupOutcome(setupResult, defaultGhCliErrorMessage);
    };

    if (result.error) {
      switch (result.error) {
        case GitHubServiceError.GH_CLI_NOT_INSTALLED: {
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
        }
        case GitHubServiceError.TOKEN_INVALID: {
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
        }
        case GitHubServiceError.INSUFFICIENT_PERMISSIONS:
          setError(
            'Insufficient permissions. Please ensure the GitHub CLI has the necessary permissions.'
          );
          setGhCliHelp(null);
          return;
        case GitHubServiceError.REPO_NOT_FOUND_OR_NO_ACCESS:
          setError(
            'Repository not found or no access. Please check your repository access and ensure you are authenticated.'
          );
          setGhCliHelp(null);
          return;
        default:
          setError(result.message || 'Failed to create GitHub PR');
          setGhCliHelp(null);
          return;
      }
    }

    if (result.message) {
      setError(result.message);
      setGhCliHelp(null);
    } else {
      setError('Failed to create GitHub PR');
      setGhCliHelp(null);
    }
  }, [data, prBaseBranch, prBody, prTitle, modal, isMacEnvironment]);

  const handleCancelCreatePR = useCallback(() => {
    modal.hide();
    // Reset form to empty state
    setPrTitle('');
    setPrBody('');
    setPrBaseBranch('');
  }, [modal]);

  // Don't render if no data
  if (!data) return null;

  return (
    <>
      <Dialog open={modal.visible} onOpenChange={() => handleCancelCreatePR()}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Create GitHub Pull Request</DialogTitle>
            <DialogDescription>
              Create a pull request for this task attempt on GitHub.
            </DialogDescription>
          </DialogHeader>
          {!isLoaded ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="pr-title">Title</Label>
                <Input
                  id="pr-title"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  placeholder="Enter PR title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pr-body">Description (optional)</Label>
                <Textarea
                  id="pr-body"
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  placeholder="Enter PR description"
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pr-base">Base Branch</Label>
                <BranchSelector
                  branches={branches}
                  selectedBranch={prBaseBranch}
                  onBranchSelect={setPrBaseBranch}
                  placeholder={
                    branchesLoading
                      ? 'Loading branches...'
                      : 'Select base branch'
                  }
                  className={
                    branchesLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }
                />
              </div>
              {ghCliHelp?.variant && (
                <Alert
                  variant="default"
                  className="border-primary/30 bg-primary/10 text-primary"
                >
                  <AlertTitle>
                    {getGhCliHelpTitle(ghCliHelp.variant)}
                  </AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>{ghCliHelp.message}</p>
                    <GhCliHelpInstructions variant={ghCliHelp.variant} t={t} />
                  </AlertDescription>
                </Alert>
              )}
              {error && <Alert variant="destructive">{error}</Alert>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelCreatePR}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreatePR}
              disabled={creatingPR || !prTitle.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creatingPR ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create PR'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

export { CreatePrDialog as CreatePRDialog };
