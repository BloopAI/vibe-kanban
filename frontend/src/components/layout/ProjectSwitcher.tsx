import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUnifiedProjects } from '@/hooks/useUnifiedProjects';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';

/**
 * Extract short node name from FQDN (e.g., "justX.raverx.net" -> "justX")
 */
function getShortNodeName(nodeName: string): string {
  const dotIndex = nodeName.indexOf('.');
  return dotIndex > 0 ? nodeName.substring(0, dotIndex) : nodeName;
}

interface ProjectItem {
  id: string;
  name: string;
  type: 'local' | 'remote';
  nodeName?: string;
}

interface ProjectSwitcherProps {
  className?: string;
}

export function ProjectSwitcher({ className }: ProjectSwitcherProps) {
  const navigate = useNavigate();
  const { projectId, project } = useProject();
  const { data: unifiedData, isLoading } = useUnifiedProjects();

  // Flatten and sort all projects alphabetically
  const allProjects = useMemo<ProjectItem[]>(() => {
    if (!unifiedData) return [];

    const items: ProjectItem[] = [];

    // Add local projects
    unifiedData.local.forEach((p) => {
      items.push({
        id: p.id,
        name: p.name,
        type: 'local',
      });
    });

    // Add remote projects (grouped by node in the response)
    unifiedData.remote_by_node.forEach((nodeGroup) => {
      nodeGroup.projects.forEach((p) => {
        items.push({
          id: p.project_id,
          name: p.project_name,
          type: 'remote',
          nodeName: nodeGroup.node_name,
        });
      });
    });

    // Sort alphabetically by name (case-insensitive)
    return items.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, [unifiedData]);

  const handleSelect = (value: string) => {
    if (value === 'all') {
      navigate('/tasks/all');
    } else {
      navigate(`/projects/${value}/tasks`);
    }
  };

  // Determine display value
  const displayValue = project?.name ?? 'All Projects';

  return (
    <Select
      value={projectId ?? 'all'}
      onValueChange={handleSelect}
      disabled={isLoading}
    >
      <SelectTrigger
        className={cn(
          'w-auto max-w-[200px] h-8 text-sm border-none bg-transparent hover:bg-accent/50 focus:ring-0 focus:ring-offset-0',
          className
        )}
      >
        <SelectValue placeholder="Select project">
          <span className="truncate">{displayValue}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[50vh]">
        <SelectItem value="all">All Projects</SelectItem>
        {allProjects.length > 0 && <SelectSeparator />}
        {allProjects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="truncate">{p.name}</span>
            {/* Show short node name on desktop only */}
            {p.nodeName && (
              <span className="hidden md:inline ml-1 text-muted-foreground text-xs">
                ({getShortNodeName(p.nodeName)})
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
