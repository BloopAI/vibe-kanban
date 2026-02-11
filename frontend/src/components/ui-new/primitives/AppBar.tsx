import {
  LayoutIcon,
  PlusIcon,
  SpinnerIcon,
  StarIcon,
} from '@phosphor-icons/react';
import { siDiscord, siGithub } from 'simple-icons';
import { cn } from '@/lib/utils';
import type { OrganizationWithRole } from 'shared/types';
import type { Project as RemoteProject } from 'shared/remote-types';
import { AppBarButton } from './AppBarButton';
import { AppBarSocialLink } from './AppBarSocialLink';
import { AppBarUserPopoverContainer } from '../containers/AppBarUserPopoverContainer';
import { Tooltip } from './Tooltip';
import { useDiscordOnlineCount } from '@/hooks/useDiscordOnlineCount';
import { useGitHubStars } from '@/hooks/useGitHubStars';

function formatStarCount(count: number): string {
  if (count < 1000) return String(count);
  const k = count / 1000;
  return k >= 10 ? `${Math.floor(k)}k` : `${k.toFixed(1)}k`;
}

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
  const { data: starCount } = useGitHubStars();

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

      {/* Bottom section: User popover + GitHub + Discord */}
      <div className="mt-auto pt-base flex flex-col items-center gap-4">
        <AppBarUserPopoverContainer
          organizations={organizations}
          selectedOrgId={selectedOrgId}
          onOrgSelect={onOrgSelect}
          onCreateOrg={onCreateOrg}
        />
        <AppBarSocialLink
          href="https://github.com/BloopAI/vibe-kanban"
          label="Star on GitHub"
          iconPath={siGithub.path}
          badge={
            starCount != null && (
              <>
                <StarIcon size={10} weight="fill" />
                {formatStarCount(starCount)}
              </>
            )
          }
        />
        <AppBarSocialLink
          href="https://discord.gg/AC4nwVtJM3"
          label="Join our Discord"
          iconPath={siDiscord.path}
          badge={
            onlineCount != null && (onlineCount > 999 ? '999+' : onlineCount)
          }
        />
      </div>
    </div>
  );
}
