import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { defineModal } from '@/lib/modals';
import { projectsApi } from '@/lib/api';
import type { Project } from 'shared/types';
import { Loader2, RefreshCw } from 'lucide-react';
import GithubIcon from '@/components/ui/github-icon';
import { formatDistanceToNow } from 'date-fns';

export type GitHubSettingsResult = {
  action: 'saved' | 'canceled';
  project?: Project;
};

// Minimal project interface needed by this dialog
export interface GitHubProject {
  id: string;
  github_enabled: boolean;
  github_owner: string | null;
  github_repo: string | null;
  github_open_issues: number;
  github_open_prs: number;
  github_last_synced_at: Date | null;
}

export interface GitHubSettingsDialogProps {
  project: GitHubProject;
  onProjectUpdate?: (project: Project) => void;
}

const GitHubSettingsDialogImpl = NiceModal.create<GitHubSettingsDialogProps>(
  ({ project, onProjectUpdate }) => {
    const modal = useModal();
    const { t } = useTranslation('projects');
    const { t: tCommon } = useTranslation('common');

    const [enabled, setEnabled] = useState(project.github_enabled);
    const [owner, setOwner] = useState(project.github_owner ?? '');
    const [repo, setRepo] = useState(project.github_repo ?? '');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [openIssues, setOpenIssues] = useState(project.github_open_issues);
    const [openPRs, setOpenPRs] = useState(project.github_open_prs);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(
      project.github_last_synced_at
        ? new Date(project.github_last_synced_at)
        : null
    );

    useEffect(() => {
      if (modal.visible) {
        // Reset form when dialog opens
        setEnabled(project.github_enabled);
        setOwner(project.github_owner ?? '');
        setRepo(project.github_repo ?? '');
        setOpenIssues(project.github_open_issues);
        setOpenPRs(project.github_open_prs);
        setLastSyncedAt(
          project.github_last_synced_at
            ? new Date(project.github_last_synced_at)
            : null
        );
        setError(null);
      }
    }, [modal.visible, project]);

    const handleSave = async () => {
      // Validate if enabling
      if (enabled) {
        if (!owner.trim()) {
          setError(t('github.errors.ownerRequired'));
          return;
        }
        if (!repo.trim()) {
          setError(t('github.errors.repoRequired'));
          return;
        }
      }

      setError(null);
      setIsSaving(true);

      try {
        const updatedProject = await projectsApi.setGitHubEnabled(project.id, {
          enabled,
          owner: enabled ? owner.trim() : undefined,
          repo: enabled ? repo.trim() : undefined,
        });

        onProjectUpdate?.(updatedProject);
        modal.resolve({
          action: 'saved',
          project: updatedProject,
        } as GitHubSettingsResult);
        modal.hide();
      } catch (err) {
        console.error('Failed to update GitHub settings:', err);
        setError(
          err instanceof Error ? err.message : t('github.errors.updateFailed')
        );
      } finally {
        setIsSaving(false);
      }
    };

    const handleSync = async () => {
      setError(null);
      setIsSyncing(true);

      try {
        const counts = await projectsApi.syncGitHubCounts(project.id);
        setOpenIssues(counts.open_issues);
        setOpenPRs(counts.open_prs);
        setLastSyncedAt(
          counts.last_synced_at ? new Date(counts.last_synced_at) : null
        );
      } catch (err) {
        console.error('Failed to sync GitHub counts:', err);
        setError(
          err instanceof Error ? err.message : t('github.errors.syncFailed')
        );
      } finally {
        setIsSyncing(false);
      }
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as GitHubSettingsResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    const formatLastSynced = () => {
      if (!lastSyncedAt) {
        return t('github.neverSynced');
      }
      return t('github.lastSynced', {
        time: formatDistanceToNow(lastSyncedAt, { addSuffix: false }),
      });
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GithubIcon className="h-5 w-5" />
              {t('github.title')}
            </DialogTitle>
            <DialogDescription>{t('github.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="github-enabled">{t('github.enabled')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('github.enabledDescription')}
                </p>
              </div>
              <Switch
                id="github-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={isSaving}
              />
            </div>

            {/* Repository Owner */}
            {enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="github-owner">{t('github.owner')}</Label>
                  <Input
                    id="github-owner"
                    type="text"
                    value={owner}
                    onChange={(e) => {
                      setOwner(e.target.value);
                      setError(null);
                    }}
                    placeholder={t('github.ownerPlaceholder')}
                    disabled={isSaving}
                  />
                </div>

                {/* Repository Name */}
                <div className="space-y-2">
                  <Label htmlFor="github-repo">{t('github.repo')}</Label>
                  <Input
                    id="github-repo"
                    type="text"
                    value={repo}
                    onChange={(e) => {
                      setRepo(e.target.value);
                      setError(null);
                    }}
                    placeholder={t('github.repoPlaceholder')}
                    disabled={isSaving}
                  />
                </div>
              </>
            )}

            {/* Counts Display (only when enabled and saved) */}
            {project.github_enabled && (
              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-semibold">{openIssues}</div>
                      <div className="text-xs text-muted-foreground">
                        {t('github.openIssues')}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-semibold">{openPRs}</div>
                      <div className="text-xs text-muted-foreground">
                        {t('github.openPRs')}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSync}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="ml-2">
                      {isSyncing ? t('github.syncing') : t('github.syncNow')}
                    </span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatLastSynced()}
                </p>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
            >
              {tCommon('buttons.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tCommon('buttons.saving')}
                </>
              ) : (
                tCommon('buttons.save')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const GitHubSettingsDialog = defineModal<
  GitHubSettingsDialogProps,
  GitHubSettingsResult
>(GitHubSettingsDialogImpl);
