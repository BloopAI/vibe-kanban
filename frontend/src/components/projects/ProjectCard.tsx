import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Calendar,
  Edit,
  ExternalLink,
  FolderOpen,
  MoreHorizontal,
  Terminal,
  Trash2,
} from 'lucide-react';
import GithubIcon from '@/components/ui/github-icon';
import { Project } from 'shared/types';
import { useEffect, useRef } from 'react';
import { useOpenProjectInEditor } from '@/hooks/useOpenProjectInEditor';
import { useNavigateWithSearch } from '@/hooks';
import { projectsApi } from '@/lib/api';
import { GitHubSettingsDialog } from '@/components/dialogs/projects/GitHubSettingsDialog';
import { TerminalDialog } from '@/components/dialogs/terminal/TerminalDialog';
import { useTranslation } from 'react-i18next';
import { GitHubBadges } from './GitHubBadges';

type Props = {
  project: Project;
  isFocused: boolean;
  fetchProjects: () => void;
  setError: (error: string) => void;
  onEdit: (project: Project) => void;
};

function ProjectCard({
  project,
  isFocused,
  fetchProjects,
  setError,
  onEdit,
}: Props) {
  const navigate = useNavigateWithSearch();
  const ref = useRef<HTMLDivElement>(null);
  const handleOpenInEditor = useOpenProjectInEditor(project);
  const { t } = useTranslation('projects');

  useEffect(() => {
    if (isFocused && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      ref.current.focus();
    }
  }, [isFocused]);

  const handleDelete = async (id: string, name: string) => {
    if (
      !confirm(
        `Are you sure you want to delete "${name}"? This action cannot be undone.`
      )
    )
      return;

    try {
      await projectsApi.delete(id);
      fetchProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
      setError('Failed to delete project');
    }
  };

  const handleEdit = (project: Project) => {
    onEdit(project);
  };

  const handleOpenInIDE = () => {
    handleOpenInEditor();
  };

  const handleOpenTerminal = async () => {
    try {
      await TerminalDialog.show({
        workingDir: project.git_repo_path,
        title: `Terminal - ${project.name}`,
      });
    } catch (error) {
      console.error('Failed to open terminal:', error);
    }
  };

  const handleGitHubSettings = async () => {
    try {
      const result = await GitHubSettingsDialog.show({
        project,
        onProjectUpdate: () => {
          fetchProjects();
        },
      });
      if (result.action === 'saved') {
        fetchProjects();
      }
    } catch (error) {
      console.error('Failed to open GitHub settings:', error);
    }
  };

  return (
    <Card
      className={`hover:shadow-md transition-shadow cursor-pointer focus:ring-2 focus:ring-primary outline-none border`}
      onClick={() => navigate(`/projects/${project.id}/tasks`)}
      tabIndex={isFocused ? 0 : -1}
      ref={ref}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-lg">{project.name}</CardTitle>
            {project.github_enabled && (
              <GitHubBadges
                project={project}
                compact
                onClick={handleGitHubSettings}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/projects/${project.id}`);
                  }}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('viewProject')}
                </DropdownMenuItem>
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
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(project);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  {t('common:buttons.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(project.id, project.name);
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('common:buttons.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <CardDescription className="flex items-center">
          <Calendar className="mr-1 h-3 w-3" />
          {t('createdDate', {
            date: new Date(project.created_at).toLocaleDateString(),
          })}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export default ProjectCard;
