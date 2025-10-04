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
import { Alert } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import BranchSelector from '@/components/tasks/BranchSelector';
import { useCallback, useEffect, useState } from 'react';
import { attemptsApi } from '@/lib/api.ts';
import { useTranslation } from 'react-i18next';

import {
  GitBranch,
  GitHubServiceError,
  GitRemote,
  TaskAttempt,
  TaskWithAttemptStatus,
} from 'shared/types';
import { projectsApi } from '@/lib/api.ts';
import { Loader2 } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
const CreatePrDialog = NiceModal.create(() => {
  const modal = useModal();
  const data = modal.args as
    | { attempt: TaskAttempt; task: TaskWithAttemptStatus; projectId: string }
    | undefined;
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prBaseBranch, setPrBaseBranch] = useState('');
  const [creatingPR, setCreatingPR] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [remotes, setRemotes] = useState<GitRemote[]>([]);
  const [remotesLoading, setRemotesLoading] = useState(false);
  const [selectedRemote, setSelectedRemote] = useState<string | null>(null);
  const [selectedHeadRemote, setSelectedHeadRemote] = useState<string | null>(
    null
  );
  const { t } = useTranslation(['tasks']);

  const getRemoteFromBranchName = useCallback((branchName?: string | null) => {
    if (!branchName) return null;
    const separatorIndex = branchName.indexOf('/');
    if (separatorIndex <= 0) return null;
    return branchName.slice(0, separatorIndex);
  }, []);

  useEffect(() => {
    if (modal.visible && data) {
      setPrTitle(`${data.task.title} (vibe-kanban)`);
      setPrBody(data.task.description || '');
      setSelectedRemote(null);
      setSelectedHeadRemote(null);
      setRemotes([]);

      // Always fetch branches for dropdown population
      if (data.projectId) {
        setBranchesLoading(true);
        setRemotesLoading(true);
        Promise.all([
          projectsApi.getBranches(data.projectId),
          projectsApi.getRemotes(data.projectId),
        ])
          .then(([projectBranches, projectRemotes]) => {
            setBranches(projectBranches);
            setRemotes(projectRemotes);

            // Set smart default: task target branch OR current branch
            if (data.attempt.target_branch) {
              setPrBaseBranch(data.attempt.target_branch);
            } else {
              const currentBranch = projectBranches.find((b) => b.is_current);
              if (currentBranch) {
                setPrBaseBranch(currentBranch.name);
              }
            }

            if (!projectBranches.length && !data.attempt.target_branch) {
              setPrBaseBranch('');
            }

            const remoteFromTarget = getRemoteFromBranchName(
              data.attempt.target_branch
            );
            const originRemote = projectRemotes.find(
              (remote) => remote.name === 'origin'
            )?.name;

            const candidateOrder: (string | null | undefined)[] = [
              originRemote,
              remoteFromTarget,
              projectRemotes[0]?.name,
            ];

            const resolvedRemote = candidateOrder.find((candidate) => {
              if (!candidate) return false;
              return projectRemotes.some((remote) => remote.name === candidate);
            });

            setSelectedRemote(resolvedRemote ?? null);

            const remoteFromBranch = getRemoteFromBranchName(
              data.attempt.branch
            );
            const forkRemote = projectRemotes.find(
              (remote) => remote.name === 'fork'
            )?.name;
            const alternateRemote = projectRemotes.find(
              (remote) => remote.name !== (resolvedRemote ?? undefined)
            )?.name;

            const headCandidates: (string | null | undefined)[] = [
              remoteFromBranch,
              forkRemote,
              alternateRemote,
              resolvedRemote,
            ];

            const resolvedHeadRemote = headCandidates.find((candidate) => {
              if (!candidate) return false;
              return projectRemotes.some((remote) => remote.name === candidate);
            });

            setSelectedHeadRemote(resolvedHeadRemote ?? null);
          })
          .catch(console.error)
          .finally(() => {
            setBranchesLoading(false);
            setRemotesLoading(false);
          });
      }

      setError(null); // Reset error when opening
    }
  }, [modal.visible, data, getRemoteFromBranchName]);

  useEffect(() => {
    if (!modal.visible) return;
    if (selectedRemote && selectedHeadRemote) return;
    const remoteFromBranch = getRemoteFromBranchName(prBaseBranch);
    if (!remoteFromBranch) return;
    if (!remotes.some((remote) => remote.name === remoteFromBranch)) return;
    if (!selectedRemote) {
      setSelectedRemote(remoteFromBranch);
    }
    if (!selectedHeadRemote) {
      setSelectedHeadRemote(remoteFromBranch);
    }
  }, [
    modal.visible,
    prBaseBranch,
    remotes,
    selectedRemote,
    selectedHeadRemote,
    getRemoteFromBranchName,
  ]);

  const handleConfirmCreatePR = useCallback(async () => {
    if (!data?.projectId || !data?.attempt.id) return;

    setError(null);
    setCreatingPR(true);

    const result = await attemptsApi.createPR(data.attempt.id, {
      title: prTitle,
      body: prBody || null,
      target_branch: prBaseBranch || null,
      remote_name: selectedRemote || null,
      head_remote_name: selectedHeadRemote || null,
    });

    if (result.success) {
      setError(null); // Clear any previous errors on success
      // Reset form and close dialog
      setPrTitle('');
      setPrBody('');
      setPrBaseBranch('');
      setSelectedRemote(null);
      setSelectedHeadRemote(null);
      setRemotes([]);
      modal.hide();
    } else {
      if (result.error) {
        modal.hide();
        switch (result.error) {
          case GitHubServiceError.TOKEN_INVALID:
            NiceModal.show('github-login');
            break;
          case GitHubServiceError.INSUFFICIENT_PERMISSIONS:
            NiceModal.show('provide-pat');
            break;
          case GitHubServiceError.REPO_NOT_FOUND_OR_NO_ACCESS:
            NiceModal.show('provide-pat', {
              errorMessage:
                'Your token does not have access to this repository, or the repository does not exist. Please check the repository URL and/or provide a Personal Access Token with access.',
            });
            break;
        }
      } else if (result.message) {
        setError(result.message);
      } else {
        setError('Failed to create GitHub PR');
      }
    }
    setCreatingPR(false);
  }, [
    data,
    prBaseBranch,
    prBody,
    prTitle,
    selectedRemote,
    selectedHeadRemote,
    modal,
  ]);

  const handleCancelCreatePR = useCallback(() => {
    modal.hide();
    // Reset form to empty state
    setPrTitle('');
    setPrBody('');
    setPrBaseBranch('');
    setSelectedRemote(null);
    setSelectedHeadRemote(null);
    setRemotes([]);
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
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pr-title">
                {t('tasks:git.createPr.labels.title')}
              </Label>
              <Input
                id="pr-title"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                placeholder={t('tasks:git.createPr.placeholders.title')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-body">
                {t('tasks:git.createPr.labels.descriptionOptional')}
              </Label>
              <Textarea
                id="pr-body"
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                placeholder={t('tasks:git.createPr.placeholders.description')}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-remote">
                {t('tasks:git.createPr.labels.remote')}
              </Label>
              <Select
                value={selectedRemote ?? undefined}
                onValueChange={(value) => setSelectedRemote(value)}
                disabled={remotesLoading || remotes.length === 0}
              >
                <SelectTrigger
                  id="pr-remote"
                  className={
                    remotesLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }
                >
                  <SelectValue
                    placeholder={
                      remotesLoading
                        ? t('tasks:git.createPr.placeholders.remote.loading')
                        : remotes.length === 0
                          ? t('tasks:git.createPr.placeholders.remote.empty')
                          : t('tasks:git.createPr.placeholders.remote.default')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {remotes.map((remote) => (
                    <SelectItem key={remote.name} value={remote.name}>
                      {remote.url
                        ? `${remote.name} (${remote.url})`
                        : remote.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-head-remote">
                {t('tasks:git.createPr.labels.sourceRemote')}
              </Label>
              <Select
                value={selectedHeadRemote ?? undefined}
                onValueChange={(value) => setSelectedHeadRemote(value)}
                disabled={remotesLoading || remotes.length === 0}
              >
                <SelectTrigger
                  id="pr-head-remote"
                  className={
                    remotesLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }
                >
                  <SelectValue
                    placeholder={
                      remotesLoading
                        ? t('tasks:git.createPr.placeholders.remote.loading')
                        : remotes.length === 0
                          ? t('tasks:git.createPr.placeholders.remote.empty')
                          : t(
                              'tasks:git.createPr.placeholders.sourceRemote.default'
                            )
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {remotes.map((remote) => (
                    <SelectItem key={remote.name} value={remote.name}>
                      {remote.url
                        ? `${remote.name} (${remote.url})`
                        : remote.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-base">
                {t('tasks:git.createPr.labels.baseBranch')}
              </Label>
              <BranchSelector
                branches={branches}
                selectedBranch={prBaseBranch}
                onBranchSelect={setPrBaseBranch}
                placeholder={
                  branchesLoading
                    ? t('tasks:git.createPr.placeholders.baseBranch.loading')
                    : t('tasks:git.createPr.placeholders.baseBranch.default')
                }
                className={
                  branchesLoading ? 'opacity-50 cursor-not-allowed' : ''
                }
              />
            </div>
            {error && <Alert variant="destructive">{error}</Alert>}
          </div>
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
