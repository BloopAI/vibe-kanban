import { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useUnifiedProjects } from '@/hooks/useUnifiedProjects';
import { useProject } from '@/contexts/ProjectContext';

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
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
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
    // Use local id (not remote project_id) for API compatibility
    unifiedData.remote_by_node.forEach((nodeGroup) => {
      nodeGroup.projects.forEach((p) => {
        items.push({
          id: p.id,
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
    setOpen(false);
    if (value === 'all') {
      navigate('/tasks/all');
    } else {
      navigate(`/projects/${value}/tasks`);
    }
  };

  // Determine if we're on the all projects route
  const isAllProjectsRoute = location.pathname === '/tasks/all';

  // Determine display value
  const displayValue = isAllProjectsRoute
    ? 'All Projects'
    : project?.name ?? 'Select a Project';

  // Current selected value for checkmark display
  const selectedValue = isAllProjectsRoute ? 'all' : projectId ?? '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          disabled={isLoading}
          className={cn(
            'w-auto max-w-[200px] h-8 justify-between text-sm px-2',
            className
          )}
        >
          <span className="truncate">{displayValue}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects..." />
          <CommandList>
            <CommandEmpty>No projects found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all"
                onSelect={() => handleSelect('all')}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    selectedValue === 'all' ? 'opacity-100' : 'opacity-0'
                  )}
                />
                All Projects
              </CommandItem>
            </CommandGroup>
            {allProjects.length > 0 && <CommandSeparator />}
            <CommandGroup>
              {allProjects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => handleSelect(p.id)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedValue === p.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="truncate">{p.name}</span>
                  {/* Show short node name on desktop only */}
                  {p.nodeName && (
                    <span className="hidden md:inline ml-1 text-muted-foreground text-xs">
                      ({getShortNodeName(p.nodeName)})
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
