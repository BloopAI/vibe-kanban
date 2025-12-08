import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Calendar, Server, Circle, FolderKanban } from 'lucide-react';
import { RemoteNodeProject, CachedNodeStatus } from 'shared/types';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  project: RemoteNodeProject;
  isFocused: boolean;
};

function getStatusColor(status: CachedNodeStatus): string {
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

function RemoteProjectCard({ project, isFocused }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation('projects');
  const navigate = useNavigate();

  useEffect(() => {
    if (isFocused && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      ref.current.focus();
    }
  }, [isFocused]);

  const handleClick = () => {
    // Navigate to unified project tasks page
    // Uses local id (not remote project_id) for API compatibility
    navigate(`/projects/${project.id}/tasks`);
  };

  return (
    <Card
      className="transition-shadow hover:shadow-md cursor-pointer focus:ring-2 focus:ring-primary outline-none border"
      onClick={handleClick}
      tabIndex={isFocused ? 0 : -1}
      ref={ref}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-lg">{project.project_name}</CardTitle>
            <Badge variant="secondary" className="gap-1">
              <Server className="h-3 w-3" />
              {project.node_name}
              <Circle
                className={`h-2 w-2 fill-current ${getStatusColor(project.node_status)}`}
              />
            </Badge>
          </div>
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
        </div>
        <CardDescription className="flex items-center gap-3">
          <span className="flex items-center">
            <Calendar className="mr-1 h-3 w-3" />
            {t('createdDate', {
              date: new Date(project.created_at).toLocaleDateString(),
            })}
          </span>
          <span className="text-xs text-muted-foreground">
            {project.git_repo_path}
          </span>
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export default RemoteProjectCard;
