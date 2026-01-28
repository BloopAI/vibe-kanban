import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import { AlertCircle } from 'lucide-react';
import { Repo } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { repoApi } from '@/lib/api';

export interface CloneRepoDialogProps {
  title?: string;
  description?: string;
}

export type CloneRepoDialogResult = Repo | null;

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

const CloneRepoDialogImpl = NiceModal.create<CloneRepoDialogProps>(
  ({ title, description }) => {
    const { t } = useTranslation();
    const modal = useModal();
    const [gitUrl, setGitUrl] = useState('');
    const [error, setError] = useState<string | null>(null);

    const dialogTitle = title ?? t('dialogs.cloneRepo.title');
    const dialogDescription = description ?? t('dialogs.cloneRepo.description');

    const cloneRepo = useMutation({
      mutationFn: (url: string) => repoApi.clone({ url }),
      onSuccess: (repo) => {
        modal.resolve(repo);
        modal.hide();
      },
      onError: (error: Error) => {
        setError(error.message);
      },
    });

    // Reset form when dialog opens
    useEffect(() => {
      if (modal.visible) {
        setGitUrl('');
        setError(null);
      }
    }, [modal.visible]);

    const handleClone = async () => {
      const url = gitUrl.trim();
      if (!url) return;

      setError(null);
      cloneRepo.mutate(url);
    };

    const handleCancel = () => {
      modal.resolve(null);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && gitUrl.trim() && !cloneRepo.isPending) {
        e.preventDefault();
        handleClone();
      }
    };

    // Derive suggested repo name from URL
    const suggestedName = extractRepoNameFromUrl(gitUrl);

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="git-url">
                {t('dialogs.cloneRepo.gitUrlLabel')}
              </Label>
              <Input
                id="git-url"
                value={gitUrl}
                onChange={(e) => {
                  setGitUrl(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder={t('dialogs.cloneRepo.gitUrlPlaceholder')}
                autoFocus
                disabled={cloneRepo.isPending}
              />
              {suggestedName && (
                <p className="text-xs text-muted-foreground">
                  {t('dialogs.cloneRepo.repoName', { name: suggestedName })}
                </p>
              )}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={cloneRepo.isPending}
            >
              {t('buttons.cancel')}
            </Button>
            <Button
              onClick={handleClone}
              disabled={!gitUrl.trim() || cloneRepo.isPending}
            >
              {cloneRepo.isPending
                ? t('dialogs.cloneRepo.cloning')
                : t('dialogs.cloneRepo.clone')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const CloneRepoDialog = defineModal<
  CloneRepoDialogProps,
  CloneRepoDialogResult
>(CloneRepoDialogImpl);
