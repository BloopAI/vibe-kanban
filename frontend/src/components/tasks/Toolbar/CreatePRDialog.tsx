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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCallback, useContext, useEffect, useState } from 'react';
import {
  TaskAttemptDataContext,
  TaskDetailsContext,
  TaskSelectedAttemptContext,
} from '@/components/context/taskDetailsContext.ts';
import { attemptsApi } from '@/lib/api.ts';
import { ProvidePatDialog } from '@/components/ProvidePatDialog';
import { GitHubLoginDialog } from '@/components/GitHubLoginDialog';
import { GitBranch, GitHubServiceError } from 'shared/types';

type Props = {
  showCreatePRDialog: boolean;
  setShowCreatePRDialog: (show: boolean) => void;
  creatingPR: boolean;
  setCreatingPR: (creating: boolean) => void;
  setError: (error: string | null) => void;
  branches: GitBranch[];
};

function CreatePrDialog({
  showCreatePRDialog,
  setCreatingPR,
  setShowCreatePRDialog,
  creatingPR,
  setError,
  branches,
}: Props) {
  const { projectId, task } = useContext(TaskDetailsContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const { fetchAttemptData } = useContext(TaskAttemptDataContext);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prBaseBranch, setPrBaseBranch] = useState(
    selectedAttempt?.base_branch || 'main'
  );
  const [showPatDialog, setShowPatDialog] = useState(false);
  const [patDialogError, setPatDialogError] = useState<string | null>(null);
  const [showGitHubLoginDialog, setShowGitHubLoginDialog] = useState(false);

  useEffect(() => {
    if (showCreatePRDialog) {
      setPrTitle(`${task.title} (vibe-kanban)`);
      setPrBody(task.description || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreatePRDialog]);

  // Update PR base branch when selected attempt changes
  useEffect(() => {
    if (selectedAttempt?.base_branch) {
      setPrBaseBranch(selectedAttempt.base_branch);
    }
  }, [selectedAttempt?.base_branch]);

  const handleConfirmCreatePR = useCallback(async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    setCreatingPR(true);

    const result = await attemptsApi.createPR(selectedAttempt.id, {
      title: prTitle,
      body: prBody || null,
      base_branch: prBaseBranch || null,
    });

    if (result.success) {
      setError(null); // Clear any previous errors on success
      window.open(result.data, '_blank');
      // Reset form
      setPrTitle('');
      setPrBody('');
      setPrBaseBranch(selectedAttempt?.base_branch || 'main');
      // Refresh branch status to show the new PR
      fetchAttemptData(selectedAttempt.id);
    } else {
      if (result.error) {
        setShowCreatePRDialog(false);
        switch (result.error) {
          case GitHubServiceError.TOKEN_INVALID:
            setShowGitHubLoginDialog(true);
            break;
          case GitHubServiceError.INSUFFICIENT_PERMISSIONS:
            setPatDialogError(null);
            setShowPatDialog(true);
            break;
          case GitHubServiceError.REPO_NOT_FOUND_OR_NO_ACCESS:
            setPatDialogError(
              'Your token does not have access to this repository, or the repository does not exist. Please check the repository URL and/or provide a Personal Access Token with access.'
            );
            setShowPatDialog(true);
            break;
        }
      } else if (result.message) {
        setError(result.message);
      } else {
        setError('Failed to create GitHub PR');
      }
    }
    setShowCreatePRDialog(false);
    setCreatingPR(false);
  }, [
    projectId,
    selectedAttempt,
    prBaseBranch,
    prBody,
    prTitle,
    fetchAttemptData,
    setCreatingPR,
    setError,
    setShowCreatePRDialog,
    setPatDialogError,
    setShowPatDialog,
    setShowGitHubLoginDialog,
  ]);

  const handleCancelCreatePR = useCallback(() => {
    setShowCreatePRDialog(false);
    // Reset form to empty state
    setPrTitle('');
    setPrBody('');
    setPrBaseBranch('main');
  }, [setShowCreatePRDialog]);

  return (
    <>
      <Dialog
        open={showCreatePRDialog}
        onOpenChange={() => handleCancelCreatePR()}
      >
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Create GitHub Pull Request</DialogTitle>
            <DialogDescription>
              Create a pull request for this task attempt on GitHub.
            </DialogDescription>
          </DialogHeader>
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
              <Select value={prBaseBranch} onValueChange={setPrBaseBranch}>
                <SelectTrigger>
                  <SelectValue placeholder="Select base branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      {branch.name}
                      {branch.is_current && ' (current)'}
                    </SelectItem>
                  ))}
                  {/* Add common branches as fallback if not in the list */}
                  {!branches.some((b) => b.name === 'main' && !b.is_remote) && (
                    <SelectItem value="main">main</SelectItem>
                  )}
                  {!branches.some(
                    (b) => b.name === 'master' && !b.is_remote
                  ) && <SelectItem value="master">master</SelectItem>}
                </SelectContent>
              </Select>
            </div>
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
              {creatingPR ? 'Creating...' : 'Create PR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProvidePatDialog
        open={showPatDialog}
        onOpenChange={(open) => {
          setShowPatDialog(open);
          if (!open) setPatDialogError(null);
        }}
        errorMessage={patDialogError || undefined}
      />

      <GitHubLoginDialog
        open={showGitHubLoginDialog}
        onOpenChange={setShowGitHubLoginDialog}
      />
    </>
  );
}

export default CreatePrDialog;
