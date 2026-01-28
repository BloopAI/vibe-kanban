import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WarningIcon } from '@phosphor-icons/react';
import { CreateProject, Project } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { defineModal } from '@/lib/modals';
import { repoApi } from '@/lib/api';

export interface CreateProjectDialogProps {}

export type CreateProjectDialogResult =
  | { status: 'saved'; project: Project }
  | { status: 'canceled' };

/**
 * Extract repository name from a git URL.
 * Handles both HTTPS and SSH URLs.
 */
function extractRepoNameFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Handle SSH format: git@github.com:user/repo.git
  let path: string;
  if (trimmed.includes(':') && !trimmed.startsWith('http')) {
    const parts = trimmed.split(':');
    path = parts[parts.length - 1] || '';
  } else {
    // Handle HTTPS format: https://github.com/user/repo.git
    const parts = trimmed.split('/');
    path = parts[parts.length - 1] || '';
  }

  // Remove .git suffix if present
  const name = path.endsWith('.git') ? path.slice(0, -4) : path;

  if (!name || name === '.' || name === '..') return null;

  return name;
}

const CreateProjectDialogImpl = NiceModal.create<CreateProjectDialogProps>(
  () => {
    const { t } = useTranslation(['tasks', 'common']);
    const modal = useModal();
    const [gitUrl, setGitUrl] = useState('');
    const [isCloning, setIsCloning] = useState(false);
    const [cloneError, setCloneError] = useState<string | null>(null);

    const { createProject } = useProjectMutations({
      onCreateSuccess: (project) => {
        modal.resolve({
          status: 'saved',
          project,
        } as CreateProjectDialogResult);
        modal.hide();
      },
      onCreateError: () => {
        setIsCloning(false);
      },
    });

    const cloneRepo = useMutation({
      mutationFn: (url: string) => repoApi.clone({ url }),
      onError: (error: Error) => {
        setCloneError(error.message);
        setIsCloning(false);
      },
    });

    // Reset form when dialog opens
    useEffect(() => {
      if (modal.visible) {
        setGitUrl('');
        setCloneError(null);
        setIsCloning(false);
      }
    }, [modal.visible]);

    const handleCreate = async () => {
      const url = gitUrl.trim();
      if (!url) return;

      setIsCloning(true);
      setCloneError(null);

      try {
        // Clone the repository
        const repo = await cloneRepo.mutateAsync(url);

        // Create the project with the cloned repository
        const projectName = repo.display_name || repo.name;
        const createData: CreateProject = {
          name: projectName,
          repositories: [{ display_name: projectName, git_repo_path: repo.path }],
        };

        createProject.mutate(createData);
      } catch {
        // Error already handled in onError
      }
    };

    const handleCancel = () => {
      modal.resolve({ status: 'canceled' } as CreateProjectDialogResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && gitUrl.trim() && !isCloning) {
        e.preventDefault();
        handleCreate();
      }
    };

    const isPending = isCloning || createProject.isPending;
    const error =
      cloneError ||
      (createProject.isError
        ? createProject.error instanceof Error
          ? createProject.error.message
          : t('projects.create.errors.createFailed')
        : null);

    // Derive suggested project name from URL
    const suggestedName = extractRepoNameFromUrl(gitUrl);

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('projects.create.dialog.title')}</DialogTitle>
            <DialogDescription>
              {t('common:dialogs.createProject.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="git-url">{t('common:dialogs.cloneRepo.gitUrlLabel')}</Label>
              <Input
                id="git-url"
                value={gitUrl}
                onChange={(e) => {
                  setGitUrl(e.target.value);
                  setCloneError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder={t('common:dialogs.cloneRepo.gitUrlPlaceholder')}
                autoFocus
                disabled={isPending}
              />
              {suggestedName && (
                <p className="text-xs text-muted-foreground">
                  {t('common:dialogs.createProject.projectName', { name: suggestedName })}
                </p>
              )}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <WarningIcon className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isPending}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!gitUrl.trim() || isPending}
            >
              {isPending
                ? isCloning
                  ? t('common:dialogs.cloneRepo.cloning')
                  : t('common:states.saving')
                : t('common:buttons.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const CreateProjectDialog = defineModal<
  CreateProjectDialogProps,
  CreateProjectDialogResult
>(CreateProjectDialogImpl);
