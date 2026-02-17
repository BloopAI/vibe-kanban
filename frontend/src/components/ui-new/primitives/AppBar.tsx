import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  LayoutIcon,
  PlusIcon,
  KanbanIcon,
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
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
} from './Popover';
import { Tooltip } from './Tooltip';
import { useDiscordOnlineCount } from '@/hooks/useDiscordOnlineCount';
import { useGitHubStars } from '@/hooks/useGitHubStars';
import { useTranslation } from 'react-i18next';

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
  onProjectsDragEnd: (result: DropResult) => void;
  isSavingProjectOrder?: boolean;
  isWorkspacesActive: boolean;
  activeProjectId: string | null;
  isSignedIn?: boolean;
  isLoadingProjects?: boolean;
  onSignIn?: () => void;
  onMigrate?: () => void;
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
  onProjectsDragEnd,
  isSavingProjectOrder,
  isWorkspacesActive,
  activeProjectId,
  isSignedIn,
  isLoadingProjects,
  onSignIn,
  onMigrate,
}: AppBarProps) {
  const { t } = useTranslation('common');
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

      {/* Project management popover for unsigned users */}
      {!isSignedIn && (
        <Popover>
          <Tooltip content={t('appBar.kanban.tooltip')} side="right">
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center justify-center w-10 h-10 rounded-lg',
                  'transition-colors cursor-pointer',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  'bg-primary text-normal hover:bg-brand/10'
                )}
                aria-label={t('appBar.kanban.tooltip')}
              >
                <KanbanIcon className="size-icon-base" weight="bold" />
              </button>
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent side="right" sideOffset={8}>
            <p className="text-sm font-medium text-high">
              {t('appBar.kanban.title')}
            </p>
            <p className="text-xs text-low mt-1">
              {t('appBar.kanban.description')}
            </p>
            <div className="mt-base flex items-center gap-half">
              <PopoverClose asChild>
                <button
                  type="button"
                  onClick={onSignIn}
                  className={cn(
                    'px-base py-1 rounded-sm text-xs',
                    'bg-brand text-on-brand hover:bg-brand-hover cursor-pointer'
                  )}
                >
                  {t('signIn')}
                </button>
              </PopoverClose>
              <PopoverClose asChild>
                <button
                  type="button"
                  onClick={onMigrate}
                  className={cn(
                    'px-base py-1 rounded-sm text-xs',
                    'bg-secondary text-normal hover:bg-panel border border-border cursor-pointer'
                  )}
                >
                  {t('appBar.kanban.migrateOldProjects')}
                </button>
              </PopoverClose>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Loading spinner for projects */}
      {isLoadingProjects && (
        <div className="flex items-center justify-center w-10 h-10">
          <SpinnerIcon className="size-5 animate-spin text-muted" />
        </div>
      )}

      {/* Middle section: Project buttons */}
      <DragDropContext onDragEnd={onProjectsDragEnd}>
        <Droppable
          droppableId="app-bar-projects"
          direction="vertical"
          isDropDisabled={isSavingProjectOrder}
        >
          {(dropProvided) => (
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className="flex flex-col items-center -mb-base"
            >
              {projects.map((project, index) => (
                <Draggable
                  key={project.id}
                  draggableId={project.id}
                  index={index}
                  disableInteractiveElementBlocking
                  isDragDisabled={isSavingProjectOrder}
                >
                  {(dragProvided, snapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                      className="mb-base"
                      style={dragProvided.draggableProps.style}
                    >
                      <Tooltip content={project.name} side="right">
                        <button
                          type="button"
                          onClick={() => onProjectClick(project.id)}
                          className={cn(
                            'flex items-center justify-center w-10 h-10 rounded-lg',
                            'text-sm font-medium transition-colors cursor-grab',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                            snapshot.isDragging && 'shadow-lg',
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
                    </div>
                  )}
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

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
