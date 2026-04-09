import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Edit,
  ExternalLink,
  FolderOpen,
  Link2,
  MoreHorizontal,
  Terminal,
  Trash2,
} from 'lucide-react';
import GithubIcon from '@/components/ui/github-icon';
import type { MergedProject, Project } from 'shared/types';
import { useEffect, useRef } from 'react';
import { useNavigateWithSearch } from '@/hooks';
import { projectsApi } from '@/lib/api';
import { LinkToLocalFolderDialog } from '@/components/dialogs/projects/LinkToLocalFolderDialog';
import { GitHubSettingsDialog } from '@/components/dialogs/projects/GitHubSettingsDialog';
import { TerminalDialog } from '@/components/dialogs/terminal/TerminalDialog';
import { useTranslation } from 'react-i18next';
import { ProjectEditorSelectionDialog } from '@/components/dialogs/projects/ProjectEditorSelectionDialog';
import { GitHubBadges } from './GitHubBadges';
import { TaskCountPills } from './TaskCountPills';
import { LocationBadges } from './LocationBadges';
import { cn } from '@/lib/utils';

type Props = {
  project: MergedProject;
  isFocused: boolean;
  onRefresh: () => void;
  onEdit?: (project: MergedProject) => void;
};

/**
 * Redesigned project card with Nordic Clean aesthetic.
 *
 * Layout:
 * ┌─────────────────────────────────────────┐
 * │ Project Name                   [•••]    │ ← Header with dropdown
 * │ ○ local  ○ tardis  ○ macbook            │ ← Location badges (can show multiple)
 * ├─────────────────────────────────────────┤
 * │ GitHub: 3 issues • 1 PR                 │ ← GitHub row (if enabled)
 * ├─────────────────────────────────────────┤
 * │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐         │
 * │ │ 12  │ │  4  │ │  2  │ │ 28  │         │ ← Task count pills
 * │ │ Todo│ │ WIP │ │ Rev │ │Done │         │   (clickable)
 * │ └─────┘ └─────┘ └─────┘ └─────┘         │
 * └─────────────────────────────────────────┘
 */
function UnifiedProjectCard({ project, isFocused, onRefresh, onEdit }: Props) {
  const navigate = useNavigateWithSearch();
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation('projects');

  useEffect(() => {
    if (isFocused && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      ref.current.focus();
    }
  }, [isFocused]);

  const handleDelete = async () => {
    if (!project.has_local || !project.local_project_id) return;

    if (
      !confirm(
        `Are you sure you want to delete "${project.name}"? This action cannot be undone.`
      )
    )
      return;

    try {
      await projectsApi.delete(project.local_project_id);
      onRefresh();
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert(t('errors.deleteFailed', { name: project.name }));
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(project);
    }
  };

  const handleOpenInIDE = async () => {
    if (!project.has_local || !project.local_project_id) return;

    try {
      const response = await projectsApi.openEditor(project.local_project_id, {
        editor_type: null,
        file_path: null,
      });

      if (response.url) {
        window.open(response.url, '_blank');
      }
    } catch (err) {
      console.error('Failed to open project in editor:', err);
      // Show editor selection dialog on failure
      ProjectEditorSelectionDialog.show({
        selectedProject: {
          id: project.local_project_id,
          name: project.name,
          git_repo_path: project.git_repo_path,
          created_at: project.created_at,
          remote_project_id: project.remote_project_id,
        } as Project,
      });
    }
  };

  const handleCardClick = () => {
    // Navigate using the main ID (local if available, otherwise first remote)
    navigate(`/projects/${project.id}/tasks`);
  };

  const handleOpenTerminal = async () => {
    if (!project.has_local || !project.git_repo_path) return;
    try {
      await TerminalDialog.show({
        workingDir: project.git_repo_path,
        title: `Terminal - ${project.name}`,
      });
    } catch (error) {
      console.error('Failed to open terminal:', error);
      alert(t('errors.terminalFailed'));
    }
  };

  const handleGitHubSettings = async () => {
    if (!project.has_local || !project.local_project_id) return;
    try {
      const result = await GitHubSettingsDialog.show({
        project: {
          id: project.local_project_id,
          github_enabled: project.github_enabled,
          github_owner: project.github_owner,
          github_repo: project.github_repo,
          github_open_issues: project.github_open_issues,
          github_open_prs: project.github_open_prs,
          github_last_synced_at: project.github_last_synced_at,
        },
        onProjectUpdate: () => {
          onRefresh();
        },
      });
      if (result.action === 'saved') {
        onRefresh();
      }
    } catch (error) {
      console.error('Failed to open GitHub settings:', error);
      alert(t('errors.githubSettingsFailed'));
    }
  };

  // Check if we have any task counts to display
  const hasTaskCounts =
    project.task_counts.todo > 0 ||
    project.task_counts.in_progress > 0 ||
    project.task_counts.in_review > 0 ||
    project.task_counts.done > 0;

  return (
    <Card
      className={cn(
        'transition-all duration-200 cursor-pointer',
        'hover:shadow-md hover:border-primary/20',
        'focus:ring-2 focus:ring-primary focus:outline-none',
        'border bg-card'
      )}
      onClick={handleCardClick}
      tabIndex={isFocused ? 0 : -1}
      ref={ref}
    >
      <CardHeader className="pb-2">
        {/* Header row: Title + Dropdown */}
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base sm:text-lg font-semibold leading-tight line-clamp-1">
            {project.name}
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/projects/${project.id}`);
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('viewProject')}
              </DropdownMenuItem>

              {project.has_local && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenInIDE();
                    }}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    {t('openInIDE')}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenTerminal();
                    }}
                  >
                    <Terminal className="mr-2 h-4 w-4" />
                    {t('openTerminal')}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGitHubSettings();
                    }}
                  >
                    <GithubIcon className="mr-2 h-4 w-4" />
                    {t('github.settings')}
                  </DropdownMenuItem>
                </>
              )}

              {/* Local project actions */}
              {project.has_local && (
                <>
                  <DropdownMenuSeparator />
                  {onEdit && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit();
                      }}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      {t('common:buttons.edit')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('common:buttons.delete')}
                  </DropdownMenuItem>
                </>
              )}

              {/* Remote-only project actions */}
              {!project.has_local && project.remote_project_id && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const result = await LinkToLocalFolderDialog.show({
                          remoteProjectId: project.remote_project_id!,
                          projectName: project.name,
                        });
                        if (result.action === 'linked') {
                          onRefresh();
                        }
                      } catch (error) {
                        console.error('Failed to link to local folder:', error);
                        alert(t('errors.linkFolderFailed'));
                      }
                    }}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    {t('linkToLocalFolder')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Location badges row */}
        <div className="mt-1.5">
          <LocationBadges project={project} />
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-3 space-y-3">
        {/* GitHub row (if enabled) */}
        {project.github_enabled && project.has_local && (
          <div onClick={(e) => e.stopPropagation()}>
            <GitHubBadges
              project={{
                github_enabled: project.github_enabled,
                github_open_issues: project.github_open_issues,
                github_open_prs: project.github_open_prs,
              }}
              compact
              onClick={handleGitHubSettings}
            />
          </div>
        )}

        {/* Task count pills */}
        {hasTaskCounts && (
          <TaskCountPills counts={project.task_counts} projectId={project.id} />
        )}

        {/* Empty state for projects with no tasks */}
        {!hasTaskCounts && (
          <div className="text-xs text-muted-foreground/60 py-1">
            {t('tasks.empty')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default UnifiedProjectCard;
