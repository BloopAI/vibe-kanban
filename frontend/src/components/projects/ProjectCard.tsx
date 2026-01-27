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
  Link2,
  MoreHorizontal,
  Trash2,
  Unlink,
} from 'lucide-react';
import { Project } from 'shared/types';
import { useEffect, useRef } from 'react';
import { useOpenProjectInEditor } from '@/hooks/useOpenProjectInEditor';
import { useNavigateWithSearch, useProjectRepos } from '@/hooks';
import { projectsApi } from '@/lib/api';
import { LinkProjectDialog } from '@/components/dialogs/projects/LinkProjectDialog';
import { useTranslation } from 'react-i18next';
import { useProjectMutations } from '@/hooks/useProjectMutations';

type Props = {
  project: Project;
  isFocused: boolean;
  setError: (error: string) => void;
  onEdit: (project: Project) => void;
};

function ProjectCard({ project, isFocused, setError, onEdit }: Props) {
  const navigate = useNavigateWithSearch();
  const ref = useRef<HTMLDivElement>(null);
  const handleOpenInEditor = useOpenProjectInEditor(project);
  const { t } = useTranslation('projects');

  const { data: repos } = useProjectRepos(project.id);
  const isSingleRepoProject = repos?.length === 1;

  const { unlinkProject } = useProjectMutations({
    onUnlinkError: (error) => {
      console.error('Failed to unlink project:', error);
      setError('Failed to unlink project');
    },
  });

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

  const handleLinkProject = async () => {
    try {
      await LinkProjectDialog.show({
        projectId: project.id,
        projectName: project.name,
      });
    } catch (error) {
      console.error('Failed to link project:', error);
    }
  };

  const handleUnlinkProject = () => {
    const confirmed = window.confirm(
      `Are you sure you want to unlink "${project.name}"? The local project will remain, but it will no longer be linked to the remote project.`
    );
    if (confirmed) {
      unlinkProject.mutate(project.id);
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
          <CardTitle className="text-lg">{project.name}</CardTitle>
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
                {isSingleRepoProject && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenInIDE();
                    }}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    {t('openInIDE')}
                  </DropdownMenuItem>
                )}
                {project.remote_project_id ? (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnlinkProject();
                    }}
                  >
                    <Unlink className="mr-2 h-4 w-4" />
                    {t('unlinkFromOrganization')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLinkProject();
                    }}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    {t('linkToOrganization')}
                  </DropdownMenuItem>
                )}
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
