import { Link, useLocation, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/contexts/SidebarContext';
import { useProjects } from '@/hooks/useProjects';
import { useTeams } from '@/hooks/useTeams';
import { Button } from '@/components/ui/button';
import { getTeamSlug, getProjectSlug } from '@/lib/url-utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  ListTodo,
  FolderKanban,
  Layers,
  Users,
  UserPlus,
  Hash,
  Plus,
  CircleDot,
  MoreHorizontal,
  Settings,
  Trash2,
  FileText,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Team } from 'shared/types';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';
import { TeamFormDialog } from '@/components/dialogs/teams/TeamFormDialog';
import { InvitePeopleDialog } from '@/components/dialogs/teams/InvitePeopleDialog';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

interface SidebarSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  isCollapsed?: boolean;
  onAdd?: () => void;
}

function SidebarSection({
  title,
  isExpanded,
  onToggle,
  children,
  isCollapsed,
  onAdd,
}: SidebarSectionProps) {
  if (isCollapsed) {
    return <div className="py-2">{children}</div>;
  }

  return (
    <div className="py-1 group/section">
      <div className="flex items-center w-full px-3 py-1.5">
        <button
          onClick={onToggle}
          className="flex items-center flex-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 mr-1" />
          ) : (
            <ChevronRight className="h-3 w-3 mr-1" />
          )}
          {title}
        </button>
        {onAdd && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="opacity-0 group-hover/section:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-all"
            title={`Add new ${title.toLowerCase().replace('your ', '')}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {isExpanded && <div className="mt-1">{children}</div>}
    </div>
  );
}

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  to?: string;
  onClick?: () => void;
  isActive?: boolean;
  isCollapsed?: boolean;
  badge?: number;
  indent?: boolean;
}

function SidebarItem({
  icon: Icon,
  label,
  to,
  onClick,
  isActive,
  isCollapsed,
  badge,
  indent,
}: SidebarItemProps) {
  const content = (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer',
        indent && 'pl-7',
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isCollapsed && 'mx-auto')} />
      {!isCollapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </>
      )}
    </div>
  );

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            {to ? (
              <Link to={to} className="block">
                {content}
              </Link>
            ) : (
              <button onClick={onClick} className="w-full">
                {content}
              </button>
            )}
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {label}
            {badge !== undefined && badge > 0 && (
              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (to) {
    return <Link to={to}>{content}</Link>;
  }

  return (
    <button onClick={onClick} className="w-full">
      {content}
    </button>
  );
}

interface SidebarTeamItemProps {
  team: Team;
  isExpanded: boolean;
  onToggle: () => void;
  isCollapsed?: boolean;
  pathname: string;
  onEdit: (team: Team) => void;
  onInvite: (team: Team) => void;
}

function SidebarTeamItem({
  team,
  isExpanded,
  onToggle,
  isCollapsed,
  pathname,
  onEdit,
  onInvite,
}: SidebarTeamItemProps) {
  const teamSlug = getTeamSlug(team);
  const teamBasePath = `/teams/${teamSlug}`;
  // Check both slug-based and ID-based paths for active state
  const isTeamActive = pathname.startsWith(teamBasePath) || pathname.startsWith(`/teams/${team.id}`);

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to={`${teamBasePath}/issues`} className="block">
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer',
                  isTeamActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <span className="h-4 w-4 shrink-0 mx-auto text-base flex items-center justify-center">
                  {team.icon || '👥'}
                </span>
              </div>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{team.name}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-0.5 group/team">
      {/* Team header with expand/collapse */}
      <div
        className={cn(
          'flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md transition-colors',
          isTeamActive
            ? 'text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        )}
      >
        <button
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <span className="h-4 w-4 shrink-0 text-base flex items-center justify-center">
            {team.icon || '👥'}
          </span>
          <span className="flex-1 truncate text-left">{team.name}</span>
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-0 group-hover/team:opacity-100 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onInvite(team)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite people
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(team)}>
              <Settings className="h-4 w-4 mr-2" />
              Team settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onEdit(team)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete team
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sub-items */}
      {isExpanded && (
        <div className="space-y-0.5">
          <SidebarItem
            icon={CircleDot}
            label="Issues"
            to={`${teamBasePath}/issues`}
            isActive={pathname.includes('/issues') && isTeamActive}
            indent
          />
          <SidebarItem
            icon={FolderKanban}
            label="Projects"
            to={`${teamBasePath}/projects`}
            isActive={pathname.includes('/projects') && isTeamActive}
            indent
          />
          <SidebarItem
            icon={Layers}
            label="Views"
            to={`${teamBasePath}/views`}
            isActive={pathname.includes('/views') && isTeamActive}
            indent
          />
          <SidebarItem
            icon={FileText}
            label="Documents"
            to={`${teamBasePath}/documents`}
            isActive={pathname.includes('/documents') && isTeamActive}
            indent
          />
          <SidebarItem
            icon={Users}
            label="Members"
            to={`${teamBasePath}/members`}
            isActive={pathname.includes('/members') && isTeamActive}
            indent
          />
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const location = useLocation();
  const { projectId } = useParams();
  const { isCollapsed, toggleCollapsed, sections, toggleSection, expandedTeams, toggleTeamExpanded } = useSidebar();
  const { projects } = useProjects();
  const { teams } = useTeams();

  const handleCreateProject = async () => {
    try {
      await ProjectFormDialog.show({});
    } catch {
      // User cancelled
    }
  };

  const handleCreateTeam = async () => {
    try {
      await TeamFormDialog.show({});
    } catch {
      // User cancelled
    }
  };

  const handleEditTeam = async (team: Team) => {
    try {
      await TeamFormDialog.show({ editTeam: team });
    } catch {
      // User cancelled
    }
  };

  const handleInviteTeam = async (team: Team) => {
    try {
      await InvitePeopleDialog.show({ teamId: team.id, teamName: team.name });
    } catch {
      // User cancelled
    }
  };

  const isProjectActive = (id: string) => {
    return projectId === id;
  };

  return (
    <div
      className={cn(
        'h-full flex flex-col border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-200',
        isCollapsed ? 'w-14' : 'w-60'
      )}
    >
      {/* Header */}
      <div className="flex items-center h-12 px-2 border-b gap-1">
        <WorkspaceSwitcher isCollapsed={isCollapsed} />
        {!isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={toggleCollapsed}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        )}
        {isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 mx-auto"
            onClick={toggleCollapsed}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Top Items */}
        <div className="px-2 space-y-0.5">
          <SidebarItem
            icon={Inbox}
            label="Inbox"
            to="/inbox"
            isActive={location.pathname === '/inbox'}
            isCollapsed={isCollapsed}
          />
          <SidebarItem
            icon={ListTodo}
            label="My Issues"
            to="/my-issues"
            isActive={location.pathname === '/my-issues'}
            isCollapsed={isCollapsed}
          />
        </div>

        {/* Workspace Section */}
        <div className="mt-4 px-2">
          <SidebarSection
            title="Workspace"
            isExpanded={sections.workspace}
            onToggle={() => toggleSection('workspace')}
            isCollapsed={isCollapsed}
          >
            <div className="space-y-0.5">
              <SidebarItem
                icon={Users}
                label="Members"
                to="/settings/organizations"
                isActive={location.pathname === '/settings/organizations'}
                isCollapsed={isCollapsed}
              />
              <SidebarItem
                icon={FolderKanban}
                label="Projects"
                to="/projects"
                isActive={location.pathname === '/projects' && !projectId}
                isCollapsed={isCollapsed}
              />
              <SidebarItem
                icon={Layers}
                label="Views"
                to="/views"
                isActive={location.pathname === '/views'}
                isCollapsed={isCollapsed}
              />
            </div>
          </SidebarSection>
        </div>

        {/* Your Projects Section */}
        <div className="mt-2 px-2">
          <SidebarSection
            title="Your projects"
            isExpanded={sections.teams}
            onToggle={() => toggleSection('teams')}
            isCollapsed={isCollapsed}
            onAdd={handleCreateProject}
          >
            <div className="space-y-0.5">
              {projects.map((project) => (
                <SidebarItem
                  key={project.id}
                  icon={Hash}
                  label={project.name}
                  to={`/projects/${getProjectSlug(project)}/tasks`}
                  isActive={isProjectActive(project.id)}
                  isCollapsed={isCollapsed}
                />
              ))}
              {!isCollapsed && projects.length === 0 && (
                <div className="px-3 py-1.5 text-sm text-muted-foreground">
                  No projects yet
                </div>
              )}
            </div>
          </SidebarSection>
        </div>

        {/* Your Teams Section */}
        <div className="mt-2 px-2">
          <SidebarSection
            title="Your teams"
            isExpanded={sections.yourTeams}
            onToggle={() => toggleSection('yourTeams')}
            isCollapsed={isCollapsed}
            onAdd={handleCreateTeam}
          >
            <div className="space-y-0.5">
              {teams.map((team) => (
                <SidebarTeamItem
                  key={team.id}
                  team={team}
                  isExpanded={expandedTeams[team.id] ?? false}
                  onToggle={() => toggleTeamExpanded(team.id)}
                  isCollapsed={isCollapsed}
                  pathname={location.pathname}
                  onEdit={handleEditTeam}
                  onInvite={handleInviteTeam}
                />
              ))}
              {!isCollapsed && teams.length === 0 && (
                <div className="px-3 py-1.5 text-sm text-muted-foreground">
                  No teams yet
                </div>
              )}
            </div>
          </SidebarSection>
        </div>

      </div>

      {/* Footer */}
      {!isCollapsed && (
        <div className="p-3 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">vibe-kanban</span>
          </div>
        </div>
      )}
    </div>
  );
}
