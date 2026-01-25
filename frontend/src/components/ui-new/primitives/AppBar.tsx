import { LayoutIcon, PlusIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { OrganizationWithRole, RemoteProject } from 'shared/types';
import { AppBarButton } from './AppBarButton';
import { AppBarUserPopoverContainer } from '../containers/AppBarUserPopoverContainer';
import { Tooltip } from './Tooltip';

function getProjectInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '??';

  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

interface AppBarProps {
  projects: RemoteProject[];
  organizations: OrganizationWithRole[];
  selectedOrgId: string;
  onOrgSelect: (orgId: string) => void;
  onCreateOrg: () => void;
  onCreateProject: () => void;
  onWorkspacesClick: () => void;
  onProjectClick: (projectId: string) => void;
  isWorkspacesActive: boolean;
  activeProjectId: string | null;
}

export function AppBar({
  projects,
  organizations,
  selectedOrgId,
  onOrgSelect,
  onCreateOrg,
  onCreateProject,
  onWorkspacesClick,
  onProjectClick,
  isWorkspacesActive,
  activeProjectId,
}: AppBarProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center h-full p-base gap-base',
        'bg-secondary border-r border-border'
      )}
    >
      {/* Top section: Workspaces button */}
      <div className="flex flex-col items-center gap-1">
        <AppBarButton
          icon={LayoutIcon}
          label="Workspaces"
          isActive={isWorkspacesActive}
          onClick={onWorkspacesClick}
        />
      </div>

      {/* Middle section: Project buttons */}
      {projects.map((project) => (
        <Tooltip key={project.id} content={project.name} side="right">
          <button
            type="button"
            onClick={() => onProjectClick(project.id)}
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-lg',
              'text-sm font-medium transition-colors cursor-pointer',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              activeProjectId === project.id
                ? ''
                : 'bg-primary text-normal hover:opacity-80'
            )}
            style={
              activeProjectId === project.id
                ? {
                    color: `hsl(${project.color})`,
                    backgroundColor: `hsl(${project.color} / 0.2)`,
                  }
                : undefined
            }
            aria-label={project.name}
          >
            {getProjectInitials(project.name)}
          </button>
        </Tooltip>
      ))}

      {/* Create project button */}
      <Tooltip content="Create project" side="right">
        <button
          type="button"
          onClick={onCreateProject}
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg',
            'text-sm font-medium transition-colors cursor-pointer',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            'bg-primary text-muted hover:text-normal hover:bg-tertiary'
          )}
          aria-label="Create project"
        >
          <PlusIcon size={20} />
        </button>
      </Tooltip>

      {/* Bottom section: User popover */}
      <div className="mt-auto pt-base">
        <AppBarUserPopoverContainer
          organizations={organizations}
          selectedOrgId={selectedOrgId}
          onOrgSelect={onOrgSelect}
          onCreateOrg={onCreateOrg}
        />
      </div>
    </div>
  );
}
