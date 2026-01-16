import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useGitHubStatus,
  useGitHubLinks,
  useGitHubLinkMutations,
} from '@/hooks/useGitHubIntegration';
import { GitHubProjectSelectorDialog } from '@/components/dialogs/GitHubProjectSelectorDialog';
import type { GitHubLinkResponse, SyncResult } from 'shared/types';

interface GitHubSettingsProps {
  projectId: string;
  className?: string;
}

export function GitHubSettings({ projectId, className }: GitHubSettingsProps) {
  const [syncingLinkId, setSyncingLinkId] = useState<string | null>(null);
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showSyncResult, setShowSyncResult] = useState(false);

  // GitHub CLI status
  const {
    data: status,
    isLoading: statusLoading,
    error: statusError,
  } = useGitHubStatus();

  // GitHub project links for this project
  const {
    data: links,
    isLoading: linksLoading,
    error: linksError,
  } = useGitHubLinks(projectId);

  // Mutations
  const { createLink, deleteLink, syncLink, updateSyncEnabled } =
    useGitHubLinkMutations(projectId, {
      onSyncSuccess: (result) => {
        setSyncResult(result);
        setShowSyncResult(true);
        setSyncingLinkId(null);
        // Auto-hide after 5 seconds
        setTimeout(() => setShowSyncResult(false), 5000);
      },
      onSyncError: () => {
        setSyncingLinkId(null);
      },
    });

  const handleAddLink = async () => {
    const result = await GitHubProjectSelectorDialog.show({});

    if (result.status === 'selected' && result.project) {
      createLink.mutate({
        githubProjectId: result.project.id,
        githubOwner: result.project.ownerLogin,
        githubRepo: null,
        githubProjectNumber: result.project.number,
      });
    }
  };

  const handleDeleteLink = (linkId: string) => {
    if (window.confirm('このGitHub Projectとの連携を解除しますか？\n\n（インポート済みのタスクはそのまま残ります）')) {
      setDeletingLinkId(linkId);
      deleteLink.mutate(linkId, {
        onSuccess: () => {
          console.log('GitHub link deleted successfully');
          setDeletingLinkId(null);
        },
        onError: (err) => {
          console.error('Failed to delete GitHub link:', err);
          alert('削除に失敗しました。コンソールを確認してください。');
          setDeletingLinkId(null);
        },
      });
    }
  };

  const handleSync = (linkId: string) => {
    setSyncingLinkId(linkId);
    syncLink.mutate(linkId);
  };

  const handleToggleSync = (linkId: string, enabled: boolean) => {
    updateSyncEnabled.mutate({ linkId, syncEnabled: enabled });
  };

  const isGitHubAvailable = status?.available && status?.authenticated;

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              GitHub Integration
            </CardTitle>
            <CardDescription>
              Sync tasks with GitHub Projects and Issues
            </CardDescription>
          </div>
          <GitHubStatusBadge status={status} isLoading={statusLoading} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Error */}
        {statusError && (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to check GitHub CLI status. Make sure GitHub CLI is installed and authenticated.
            </AlertDescription>
          </Alert>
        )}

        {/* Not Available Warning */}
        {status && !isGitHubAvailable && (
          <Alert>
            <AlertDescription className="flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              {!status.available
                ? 'GitHub CLI is not installed. Install it with `brew install gh` or from github.com/cli/cli'
                : 'GitHub CLI is not authenticated. Run `gh auth login` to authenticate.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Sync Result Toast */}
        <AnimatePresence>
          {showSyncResult && syncResult && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Alert
                variant={syncResult.errors.length > 0 ? 'destructive' : 'success'}
              >
                <AlertDescription className="flex items-center gap-2">
                  {syncResult.errors.length > 0 ? (
                    <XCircle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>
                    Synced {syncResult.itemsSynced} items
                    {syncResult.itemsCreated > 0 &&
                      ` (${syncResult.itemsCreated} created)`}
                    {syncResult.itemsUpdated > 0 &&
                      ` (${syncResult.itemsUpdated} updated)`}
                    {syncResult.errors.length > 0 &&
                      ` with ${syncResult.errors.length} errors`}
                  </span>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Links List */}
        {linksLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading linked projects...
            </span>
          </div>
        ) : linksError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load GitHub project links.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {links?.map((link) => (
                <GitHubLinkCard
                  key={link.id}
                  link={link}
                  isSyncing={syncingLinkId === link.id}
                  isDeleting={deletingLinkId === link.id}
                  onSync={() => handleSync(link.id)}
                  onDelete={() => handleDeleteLink(link.id)}
                  onToggleSync={(enabled) => handleToggleSync(link.id, enabled)}
                />
              ))}
            </AnimatePresence>

            {links?.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No GitHub Projects linked yet</p>
                <p className="text-xs mt-1">
                  Link a GitHub Project to start syncing issues as tasks
                </p>
              </div>
            )}

            {/* Add Link Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddLink}
              disabled={!isGitHubAvailable || createLink.isPending}
              className="w-full"
            >
              {createLink.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Link GitHub Project
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface GitHubLinkCardProps {
  link: GitHubLinkResponse;
  isSyncing: boolean;
  isDeleting: boolean;
  onSync: () => void;
  onDelete: () => void;
  onToggleSync: (enabled: boolean) => void;
}

function GitHubLinkCard({
  link,
  isSyncing,
  isDeleting,
  onSync,
  onDelete,
  onToggleSync,
}: GitHubLinkCardProps) {
  const projectUrl = `https://github.com/orgs/${link.github_owner}/projects`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="border rounded-lg p-4 space-y-3 hover:border-foreground/20 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium truncate">
              {link.github_owner}
            </span>
            <a
              href={projectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
            <span>Project ID: {link.github_project_id.slice(0, 12)}...</span>
            <span>{link.issueCount} issues</span>
          </div>
        </div>

        {/* Actions - Responsive */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Desktop actions */}
          <div className="hidden sm:flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSync}
              disabled={isSyncing || !link.sync_enabled}
              title="Sync now"
            >
              <RefreshCw
                className={cn('h-4 w-4', isSyncing && 'animate-spin')}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              title="Remove link"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t">
        {/* Sync Toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id={`sync-${link.id}`}
            checked={link.sync_enabled}
            onCheckedChange={onToggleSync}
          />
          <Label htmlFor={`sync-${link.id}`} className="text-sm cursor-pointer">
            Auto-sync enabled
          </Label>
        </div>

        {/* Last Sync Time */}
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <span className="text-xs text-muted-foreground">
            {link.last_sync_at
              ? `Last synced: ${new Date(link.last_sync_at).toLocaleString()}`
              : 'Never synced'}
          </span>

          {/* Mobile actions */}
          <div className="flex sm:hidden items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSync}
              disabled={isSyncing || !link.sync_enabled}
            >
              <RefreshCw
                className={cn('h-4 w-4', isSyncing && 'animate-spin')}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface GitHubStatusBadgeProps {
  status: {
    available: boolean;
    authenticated: boolean;
    userLogin: string | null;
  } | undefined;
  isLoading: boolean;
}

function GitHubStatusBadge({ status, isLoading }: GitHubStatusBadgeProps) {
  if (isLoading) {
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking...
      </Badge>
    );
  }

  if (!status) {
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <XCircle className="h-3 w-3" />
        Error
      </Badge>
    );
  }

  if (!status.available) {
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <XCircle className="h-3 w-3" />
        CLI Not Found
      </Badge>
    );
  }

  if (!status.authenticated) {
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <XCircle className="h-3 w-3" />
        Not Authenticated
      </Badge>
    );
  }

  return (
    <Badge variant="default" className="flex items-center gap-1 bg-green-600">
      <CheckCircle2 className="h-3 w-3" />
      {status.userLogin || 'Connected'}
    </Badge>
  );
}

export default GitHubSettings;
