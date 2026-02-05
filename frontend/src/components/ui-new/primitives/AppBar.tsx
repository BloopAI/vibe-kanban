import { LayoutIcon, PlusIcon, SpinnerIcon } from '@phosphor-icons/react';
import { siDiscord } from 'simple-icons';
import { cn } from '@/lib/utils';
import type { OrganizationWithRole } from 'shared/types';
import type { Project as RemoteProject } from 'shared/remote-types';
import { AppBarButton } from './AppBarButton';
import { AppBarUserPopoverContainer } from '../containers/AppBarUserPopoverContainer';
import { Tooltip } from './Tooltip';
import { useDiscordOnlineCount } from '@/hooks/useDiscordOnlineCount';

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
  isSignedIn?: boolean;
  isLoadingProjects?: boolean;
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
  isSignedIn,
  isLoadingProjects,
}: AppBarProps) {
  const { data: onlineCount } = useDiscordOnlineCount();

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

      {/* Loading spinner for projects */}
      {isLoadingProjects && (
        <div className="flex items-center justify-center w-10 h-10">
          <SpinnerIcon className="size-5 animate-spin text-muted" />
        </div>
      )}

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
      {isSignedIn && (
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
      )}

      {/* Bottom section: User popover + Discord */}
      <div className="mt-auto pt-base flex flex-col items-center gap-base">
        <AppBarUserPopoverContainer
          organizations={organizations}
          selectedOrgId={selectedOrgId}
          onOrgSelect={onOrgSelect}
          onCreateOrg={onCreateOrg}
        />
        <Tooltip content="Join our Discord" side="right">
          <a
            href="https://discord.gg/AC4nwVtJM3"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'relative flex items-center justify-center w-10 h-10 rounded-lg',
              'text-sm font-medium transition-colors cursor-pointer',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              'bg-primary text-normal hover:opacity-80'
            )}
            aria-label="Join our Discord"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d={siDiscord.path} />
            </svg>
            {onlineCount != null && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-brand text-[10px] font-medium text-white">
                {onlineCount > 999 ? '999+' : onlineCount}
              </span>
            )}
          </a>
        </Tooltip>
      </div>
    </div>
  );
}
