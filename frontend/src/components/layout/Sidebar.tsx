import { Link, useLocation, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/contexts/SidebarContext';
import { useProjects } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
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
  Import,
  UserPlus,
  Target,
  RotateCcw,
  Github,
  Hash,
  Plus,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';

interface SidebarSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  isCollapsed?: boolean;
}

function SidebarSection({
  title,
  isExpanded,
  onToggle,
  children,
  isCollapsed,
}: SidebarSectionProps) {
  if (isCollapsed) {
    return <div className="py-2">{children}</div>;
  }

  return (
    <div className="py-1">
      <button
        onClick={onToggle}
        className="flex items-center w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 mr-1" />
        ) : (
          <ChevronRight className="h-3 w-3 mr-1" />
        )}
        {title}
      </button>
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

export function Sidebar() {
  const location = useLocation();
  const { projectId } = useParams();
  const { isCollapsed, toggleCollapsed, sections, toggleSection } = useSidebar();
  const { projects } = useProjects();

  const handleCreateProject = async () => {
    try {
      await ProjectFormDialog.show({});
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
      <div className="flex items-center h-12 px-3 border-b">
        {!isCollapsed && (
          <Link to="/projects" className="flex items-center gap-2">
            <Logo />
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8 shrink-0', isCollapsed ? 'mx-auto' : 'ml-auto')}
          onClick={toggleCollapsed}
        >
          {isCollapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <ChevronsLeft className="h-4 w-4" />
          )}
        </Button>
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

        {/* Teams/Projects Section */}
        <div className="mt-2 px-2">
          <SidebarSection
            title="Your projects"
            isExpanded={sections.teams}
            onToggle={() => toggleSection('teams')}
            isCollapsed={isCollapsed}
          >
            <div className="space-y-0.5">
              {projects.map((project) => (
                <SidebarItem
                  key={project.id}
                  icon={Hash}
                  label={project.name}
                  to={`/projects/${project.id}/tasks`}
                  isActive={isProjectActive(project.id)}
                  isCollapsed={isCollapsed}
                />
              ))}
              {!isCollapsed && (
                <button
                  onClick={handleCreateProject}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>New project</span>
                </button>
              )}
            </div>
          </SidebarSection>
        </div>

        {/* Try Section */}
        <div className="mt-2 px-2">
          <SidebarSection
            title="Try"
            isExpanded={sections.trySection}
            onToggle={() => toggleSection('trySection')}
            isCollapsed={isCollapsed}
          >
            <div className="space-y-0.5">
              <SidebarItem
                icon={Import}
                label="Import issues"
                onClick={() => {}}
                isCollapsed={isCollapsed}
              />
              <SidebarItem
                icon={UserPlus}
                label="Invite people"
                to="/settings/organizations"
                isCollapsed={isCollapsed}
              />
              <SidebarItem
                icon={Target}
                label="Initiatives"
                onClick={() => {}}
                isCollapsed={isCollapsed}
              />
              <SidebarItem
                icon={RotateCcw}
                label="Cycles"
                onClick={() => {}}
                isCollapsed={isCollapsed}
              />
              <SidebarItem
                icon={Github}
                label="Link GitHub"
                onClick={() => {}}
                isCollapsed={isCollapsed}
              />
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
