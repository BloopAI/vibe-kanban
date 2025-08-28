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
import { useCallback, useEffect, useState } from 'react';
import { attemptsApi } from '@/lib/api.ts';
import { ProvidePatDialog } from '@/components/ProvidePatDialog';
import { GitHubLoginDialog } from '@/components/GitHubLoginDialog';
import { GitHubServiceError } from 'shared/types';
import { useCreatePRDialog } from '@/contexts/create-pr-dialog-context';
import { useProjectBranches } from '@/hooks';

function CreatePrDialog() {
  const { isOpen, data, closeCreatePRDialog } = useCreatePRDialog();
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prBaseBranch, setPrBaseBranch] = useState('main');
  const [showPatDialog, setShowPatDialog] = useState(false);
  const [patDialogError, setPatDialogError] = useState<string | null>(null);
  const [showGitHubLoginDialog, setShowGitHubLoginDialog] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch branches when dialog opens
  const { data: branches = [], isLoading: branchesLoading } =
    useProjectBranches(isOpen ? data?.projectId : undefined);

  useEffect(() => {
    if (isOpen && data) {
      setPrTitle(`${data.task.title} (vibe-kanban)`);
      setPrBody(data.task.description || '');
      setError(null); // Reset error when opening
    }
  }, [isOpen, data]);

  const handleConfirmCreatePR = useCallback(async () => {
    if (!data?.projectId || !data?.attempt.id) return;

    setCreatingPR(true);

    const result = await attemptsApi.createPR(data.attempt.id, {
      title: prTitle,
      body: prBody || null,
      base_branch: prBaseBranch || null,
    });

    if (result.success) {
      setError(null); // Clear any previous errors on success
      window.open(result.data, '_blank');
      // Reset form and close dialog
      setPrTitle('');
      setPrBody('');
      setPrBaseBranch('main');
      closeCreatePRDialog();
    } else {
      if (result.error) {
        closeCreatePRDialog();
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
    setCreatingPR(false);
  }, [
    data,
    prBaseBranch,
    prBody,
    prTitle,
    closeCreatePRDialog,
    setPatDialogError,
  ]);

  const handleCancelCreatePR = useCallback(() => {
    closeCreatePRDialog();
    // Reset form to empty state
    setPrTitle('');
    setPrBody('');
    setPrBaseBranch('main');
  }, [closeCreatePRDialog]);

  // Don't render if no data
  if (!data) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => handleCancelCreatePR()}>
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
              <Select
                value={prBaseBranch}
                onValueChange={setPrBaseBranch}
                disabled={branchesLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      branchesLoading
                        ? 'Loading branches...'
                        : 'Select base branch'
                    }
                  />
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
            {error && (
              <div className="text-sm text-destructive bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
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
