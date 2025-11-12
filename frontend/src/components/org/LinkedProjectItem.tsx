import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Unlink } from 'lucide-react';
import type { Project } from 'shared/types';

interface LinkedProjectItemProps {
  project: Project;
  onUnlink: (projectId: string) => void;
  isUnlinking: boolean;
}

export function LinkedProjectItem({
  project,
  onUnlink,
  isUnlinking,
}: LinkedProjectItemProps) {
  const handleUnlinkClick = () => {
    const confirmed = window.confirm(
      `Are you sure you want to unlink "${project.name}"? The local project will remain, but it will no longer be linked to this organization.`
    );
    if (confirmed) {
      onUnlink(project.id);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <div>
          <div className="font-medium text-sm">{project.name}</div>
          <div className="text-xs text-muted-foreground">
            {project.git_repo_path}
          </div>
        </div>
        <Badge variant="default">Linked</Badge>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUnlinkClick}
          disabled={isUnlinking}
        >
          <Unlink className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
