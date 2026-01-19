import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNavigateWithSearch } from '@/hooks';
import { paths } from '@/lib/paths';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { attemptsApi, repoApi } from '@/lib/api';
import type { OpenPrInfo } from 'shared/types';

export interface CreateWorkspaceFromPrDialogProps {}

const CreateWorkspaceFromPrDialogImpl =
  NiceModal.create<CreateWorkspaceFromPrDialogProps>(() => {
    const modal = useModal();
    const navigate = useNavigateWithSearch();
    const { t } = useTranslation('tasks');
    const queryClient = useQueryClient();

    const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
    const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(
      null
    );
    const [runSetup, setRunSetup] = useState(true);

    // Fetch all repos
    const { data: repos = [], isLoading: isLoadingRepos } = useQuery({
      queryKey: ['repos'],
      queryFn: () => repoApi.list(),
      enabled: modal.visible,
    });

    // Auto-select first repo if only one
    useEffect(() => {
      if (repos.length === 1 && !selectedRepoId) {
        setSelectedRepoId(repos[0].id);
      }
    }, [repos, selectedRepoId]);

    // Fetch open PRs for the selected repo
    const {
      data: prsResult,
      isLoading: isLoadingPrs,
      error: prsError,
    } = useQuery({
      queryKey: ['open-prs', selectedRepoId],
      queryFn: async () => {
        if (!selectedRepoId) return null;
        return repoApi.listOpenPrs(selectedRepoId);
      },
      enabled: modal.visible && !!selectedRepoId,
    });

    const openPrs: OpenPrInfo[] =
      prsResult?.success === true ? prsResult.data : [];

    // Create workspace mutation
    const createMutation = useMutation({
      mutationFn: async () => {
        if (!selectedRepoId || !selectedPrNumber) {
          throw new Error('Missing required fields');
        }
        const result = await attemptsApi.createFromPr({
          repo_id: selectedRepoId,
          pr_number: BigInt(selectedPrNumber),
          run_setup: runSetup,
        });
        if (!result.success) {
          throw new Error(result.message || 'Failed to create workspace');
        }
        return result.data;
      },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        modal.hide();
        navigate(
          paths.attempt(data.task.project_id, data.task.id, data.workspace.id)
        );
      },
    });

    // Reset state when modal closes
    useEffect(() => {
      if (!modal.visible) {
        setSelectedRepoId(null);
        setSelectedPrNumber(null);
        setRunSetup(true);
      }
    }, [modal.visible]);

    const handleOpenChange = (open: boolean) => {
      if (!open) modal.hide();
    };

    const canCreate =
      selectedRepoId &&
      selectedPrNumber &&
      !createMutation.isPending &&
      !isLoadingPrs;

    const handleCreate = () => {
      if (canCreate) {
        createMutation.mutate();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Workspace from PR</DialogTitle>
            <DialogDescription>
              Select an open pull request to create a workspace from. A task
              will be created automatically using the PR title.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Repo selector */}
            <div className="space-y-2">
              <Label>Repository</Label>
              {isLoadingRepos ? (
                <div className="text-sm text-muted-foreground">
                  Loading repositories...
                </div>
              ) : repos.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No repositories found
                </div>
              ) : (
                <Select
                  value={selectedRepoId ?? undefined}
                  onValueChange={(value) => {
                    setSelectedRepoId(value);
                    setSelectedPrNumber(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a repository" />
                  </SelectTrigger>
                  <SelectContent>
                    {repos.map((repo) => (
                      <SelectItem key={repo.id} value={repo.id}>
                        {repo.display_name || repo.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* PR selector */}
            <div className="space-y-2">
              <Label>Pull Request</Label>
              {isLoadingPrs ? (
                <div className="text-sm text-muted-foreground">
                  Loading pull requests...
                </div>
              ) : prsError ? (
                <div className="text-sm text-destructive">
                  Failed to load pull requests
                </div>
              ) : !selectedRepoId ? (
                <div className="text-sm text-muted-foreground">
                  Select a repository first
                </div>
              ) : openPrs.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No open pull requests found
                </div>
              ) : (
                <Select
                  value={selectedPrNumber?.toString() ?? undefined}
                  onValueChange={(value) => setSelectedPrNumber(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a pull request" />
                  </SelectTrigger>
                  <SelectContent>
                    {openPrs.map((pr) => (
                      <SelectItem key={pr.number} value={String(pr.number)}>
                        #{String(pr.number)}: {pr.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Run setup checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="run-setup"
                checked={runSetup}
                onCheckedChange={(checked) => setRunSetup(checked === true)}
              />
              <Label htmlFor="run-setup">Run setup script</Label>
            </div>

            {/* Error message */}
            {createMutation.error && (
              <div className="text-sm text-destructive">
                {createMutation.error.message}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => modal.hide()}
              disabled={createMutation.isPending}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!canCreate}>
              {createMutation.isPending ? 'Creating...' : 'Create Workspace'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });

export const CreateWorkspaceFromPrDialog = defineModal<
  CreateWorkspaceFromPrDialogProps,
  void
>(CreateWorkspaceFromPrDialogImpl);
