import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Unlink } from 'lucide-react';
import type { Project, RemoteProject } from 'shared/types';
import { useTranslation } from 'react-i18next';

interface RemoteProjectItemProps {
  remoteProject: RemoteProject;
  linkedLocalProject?: Project;
  availableLocalProjects: Project[];
  onLink: (remoteProjectId: string, localProjectId: string) => void;
  onUnlink: (localProjectId: string) => void;
  isLinking: boolean;
  isUnlinking: boolean;
}

export function RemoteProjectItem({
  remoteProject,
  linkedLocalProject,
  availableLocalProjects,
  onLink,
  onUnlink,
  isLinking,
  isUnlinking,
}: RemoteProjectItemProps) {
  const { t } = useTranslation('organization');
  const handleUnlinkClick = () => {
    if (!linkedLocalProject) return;

    const confirmed = window.confirm(
      `Are you sure you want to unlink "${linkedLocalProject.name}"? The local project will remain, but it will no longer be linked to this remote project.`
    );
    if (confirmed) {
      onUnlink(linkedLocalProject.id);
    }
  };

  const handleLinkSelect = (localProjectId: string) => {
    onLink(remoteProject.id, localProjectId);
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{remoteProject.name}</div>
          {linkedLocalProject ? (
            <div className="text-xs text-muted-foreground">
              {t('sharedProjects.linkedTo', {
                projectName: linkedLocalProject.name,
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {t('sharedProjects.notLinked')}
            </div>
          )}
        </div>
        {linkedLocalProject && (
          <Badge variant="default">{t('sharedProjects.linked')}</Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {linkedLocalProject ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUnlinkClick}
            disabled={isUnlinking}
          >
            <Unlink className="h-4 w-4 text-destructive" />
          </Button>
        ) : (
          <Select
            onValueChange={handleLinkSelect}
            disabled={isLinking || availableLocalProjects.length === 0}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('sharedProjects.linkProject')} />
            </SelectTrigger>
            <SelectContent>
              {availableLocalProjects.length === 0 ? (
                <SelectItem value="no-projects" disabled>
                  {t('sharedProjects.noAvailableProjects')}
                </SelectItem>
              ) : (
                availableLocalProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
