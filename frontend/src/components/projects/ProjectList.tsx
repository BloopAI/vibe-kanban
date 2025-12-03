import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Project } from 'shared/types';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';
import { projectsApi } from '@/lib/api';
import { AlertCircle, Loader2, Plus, Server, Circle } from 'lucide-react';
import ProjectCard from '@/components/projects/ProjectCard.tsx';
import RemoteProjectCard from '@/components/projects/RemoteProjectCard.tsx';
import { StatusSummaryBanner } from '@/components/dashboard/StatusSummaryBanner';
import { useKeyCreate, Scope } from '@/keyboard';
import { useUnifiedProjects } from '@/hooks/useUnifiedProjects';

function getStatusColor(status: string): string {
  switch (status) {
    case 'online':
      return 'text-green-500';
    case 'busy':
      return 'text-yellow-500';
    case 'offline':
      return 'text-gray-400';
    case 'draining':
      return 'text-orange-500';
    case 'pending':
    default:
      return 'text-gray-300';
  }
}

export function ProjectList() {
  const navigate = useNavigate();
  const { t } = useTranslation('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);

  // Fetch unified projects (includes remote nodes)
  const {
    data: unifiedData,
    isLoading: unifiedLoading,
    refetch: refetchUnified,
  } = useUnifiedProjects();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await projectsApi.getAll();
      setProjects(result);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setError(t('errors.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleCreateProject = async () => {
    try {
      const result = await ProjectFormDialog.show({});
      if (result === 'saved') {
        fetchProjects();
        refetchUnified();
      }
    } catch {
      // User cancelled - do nothing
    }
  };

  // Semantic keyboard shortcut for creating new project
  useKeyCreate(handleCreateProject, { scope: Scope.PROJECTS });

  const handleEditProject = (project: Project) => {
    navigate(`/settings/projects?projectId=${project.id}`);
  };

  // Set initial focus when projects are loaded
  useEffect(() => {
    if (projects.length > 0 && !focusedProjectId) {
      setFocusedProjectId(projects[0].id);
    }
  }, [projects, focusedProjectId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const isLoading = loading || unifiedLoading;
  const hasLocalProjects = projects.length > 0;
  const hasRemoteProjects =
    unifiedData?.remote_by_node && unifiedData.remote_by_node.length > 0;
  const hasAnyProjects = hasLocalProjects || hasRemoteProjects;

  return (
    <div className="space-y-6 p-8 pb-16 md:pb-8 h-full overflow-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={handleCreateProject}>
          <Plus className="mr-2 h-4 w-4" />
          {t('createProject')}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isLoading && hasLocalProjects && <StatusSummaryBanner />}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : !hasAnyProjects ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <Plus className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{t('empty.title')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('empty.description')}
            </p>
            <Button className="mt-4" onClick={handleCreateProject}>
              <Plus className="mr-2 h-4 w-4" />
              {t('empty.createFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Local Projects Section */}
          {hasLocalProjects && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                {t('sections.local')}
                <span className="text-sm font-normal text-muted-foreground">
                  ({projects.length})
                </span>
              </h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isFocused={focusedProjectId === project.id}
                    setError={setError}
                    onEdit={handleEditProject}
                    fetchProjects={() => {
                      fetchProjects();
                      refetchUnified();
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Remote Projects by Node */}
          {hasRemoteProjects &&
            unifiedData?.remote_by_node.map((nodeGroup) => (
              <section key={nodeGroup.node_id}>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  {nodeGroup.node_name}
                  <Circle
                    className={`h-2 w-2 fill-current ${getStatusColor(nodeGroup.node_status)}`}
                  />
                  <span className="text-sm font-normal text-muted-foreground">
                    ({nodeGroup.projects.length})
                  </span>
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {nodeGroup.projects.map((project) => (
                    <RemoteProjectCard
                      key={project.id}
                      project={project}
                      isFocused={false}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
