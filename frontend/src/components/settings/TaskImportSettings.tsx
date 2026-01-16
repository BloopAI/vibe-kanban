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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Loader2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Download,
  LayoutGrid,
  CircleDot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useGitHubStatus,
  useGitHubLinks,
  useGitHubLinkMutations,
} from '@/hooks/useGitHubIntegration';
import { GitHubProjectSelectorDialog } from '@/components/dialogs/GitHubProjectSelectorDialog';
import type { GitHubLinkResponse, SyncResult } from 'shared/types';

// Import source icons
import { SiGithub, SiNotion, SiJira } from 'react-icons/si';

interface TaskImportSettingsProps {
  projectId: string;
  className?: string;
}

export function TaskImportSettings({ projectId, className }: TaskImportSettingsProps) {
  const [syncingLinkId, setSyncingLinkId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showSyncResult, setShowSyncResult] = useState(false);
  const [githubMenuOpen, setGithubMenuOpen] = useState(false);

  // GitHub CLI status
  const {
    data: status,
    isLoading: statusLoading,
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
        setTimeout(() => setShowSyncResult(false), 5000);
      },
      onSyncError: () => {
        setSyncingLinkId(null);
      },
    });

  const handleAddGitHubProjects = async () => {
    setGithubMenuOpen(false);
    const result = await GitHubProjectSelectorDialog.show({});

    if (result.status === 'selected' && result.project) {
      createLink.mutate({
        githubProjectId: result.project.id,
        githubOwner: result.project.ownerLogin,
        githubRepo: null,
        githubProjectNumber: BigInt(result.project.number),
      });
    }
  };

  const handleAddGitHubIssues = async () => {
    setGithubMenuOpen(false);
    // TODO: Implement GitHub Issues selector
    // For now, show coming soon message
    alert('GitHub Issues import is coming soon!');
  };

  const handleDeleteLink = (linkId: string) => {
    if (window.confirm('Are you sure you want to remove this import source?')) {
      deleteLink.mutate(linkId);
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
              <Download className="h-5 w-5" />
              Task Import
            </CardTitle>
            <CardDescription>
              Import tasks from external sources
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Import Source Cards */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Add Import Source</Label>
          <div className="grid grid-cols-3 gap-3">
            {/* GitHub Card with Dropdown */}
            <DropdownMenu open={githubMenuOpen} onOpenChange={setGithubMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={!isGitHubAvailable || createLink.isPending}
                  className={cn(
                    'relative flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all min-h-[140px]',
                    isGitHubAvailable
                      ? 'border-border hover:border-primary hover:bg-primary/5 cursor-pointer'
                      : 'border-border opacity-60 cursor-not-allowed'
                  )}
                >
                  <SiGithub className="h-8 w-8 mb-2 text-foreground" />
                  <span className="text-sm font-medium">GitHub</span>
                  <div className="mt-2">
                    {statusLoading ? (
                      <Badge variant="secondary" className="text-xs">
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Checking
                      </Badge>
                    ) : status?.authenticated ? (
                      <Badge variant="default" className="text-xs bg-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {status.userLogin || 'Connected'}
                      </Badge>
                    ) : status?.available === false ? (
                      <Badge variant="secondary" className="text-xs">
                        CLI Required
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Not Connected
                      </Badge>
                    )}
                  </div>
                  {createLink.isPending && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64" align="start">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Select import type
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={handleAddGitHubProjects} className="cursor-pointer">
                  <LayoutGrid className="h-4 w-4 mr-3 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">Projects</div>
                    <div className="text-xs text-muted-foreground">
                      Import from GitHub Projects board
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAddGitHubIssues} className="cursor-pointer">
                  <CircleDot className="h-4 w-4 mr-3 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-sm font-medium flex items-center gap-2">
                      Issues
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Soon
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Import from repository issues
                    </div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Notion Card */}
            <button
              disabled
              className="relative flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border min-h-[140px] opacity-60 cursor-not-allowed"
            >
              <Badge 
                variant="secondary" 
                className="absolute -top-2 -right-2 text-xs px-2 py-0.5"
              >
                Soon
              </Badge>
              <SiNotion className="h-8 w-8 mb-2 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Notion</span>
            </button>

            {/* Jira Card */}
            <button
              disabled
              className="relative flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border min-h-[140px] opacity-60 cursor-not-allowed"
            >
              <Badge 
                variant="secondary" 
                className="absolute -top-2 -right-2 text-xs px-2 py-0.5"
              >
                Soon
              </Badge>
              <SiJira className="h-8 w-8 mb-2 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Jira</span>
            </button>
          </div>
        </div>

        {/* GitHub CLI Warning */}
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
                    Imported {syncResult.itemsSynced} tasks
                    {syncResult.itemsCreated > 0 &&
                      ` (${syncResult.itemsCreated} new)`}
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

        {/* Connected Sources */}
        {linksLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading connected sources...
            </span>
          </div>
        ) : linksError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load connected sources.
            </AlertDescription>
          </Alert>
        ) : links && links.length > 0 ? (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Connected Sources</Label>
            <AnimatePresence mode="popLayout">
              {links.map((link) => (
                <GitHubLinkCard
                  key={link.id}
                  link={link}
                  isSyncing={syncingLinkId === link.id}
                  isDeleting={deleteLink.isPending}
                  onSync={() => handleSync(link.id)}
                  onDelete={() => handleDeleteLink(link.id)}
                  onToggleSync={(enabled) => handleToggleSync(link.id, enabled)}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : null}
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
  // Build project URL with number if available, otherwise fall back to projects list
  const projectUrl = link.github_project_number
    ? `https://github.com/orgs/${link.github_owner}/projects/${link.github_project_number}`
    : `https://github.com/orgs/${link.github_owner}/projects`;

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
            <SiGithub className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSync}
              disabled={isSyncing}
              title="Import now"
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
              title="Remove"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t">
        {/* Auto-sync Toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id={`sync-${link.id}`}
            checked={link.sync_enabled}
            onCheckedChange={onToggleSync}
          />
          <Label htmlFor={`sync-${link.id}`} className="text-sm cursor-pointer">
            Auto-import enabled
          </Label>
        </div>

        {/* Last Sync Time */}
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <span className="text-xs text-muted-foreground">
            {link.last_sync_at
              ? `Last imported: ${new Date(link.last_sync_at).toLocaleString()}`
              : 'Never imported'}
          </span>

          {/* Mobile actions */}
          <div className="flex sm:hidden items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSync}
              disabled={isSyncing}
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
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default TaskImportSettings;
