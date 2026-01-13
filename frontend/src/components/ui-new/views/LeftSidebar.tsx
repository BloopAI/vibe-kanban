import { useState, useCallback } from 'react';
import {
  HouseIcon,
  StackIcon,
  CirclesFourIcon,
  FunnelIcon,
  CaretDownIcon,
  CaretRightIcon,
  FoldersIcon,
  SidebarSimpleIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  usePersistedExpanded,
  type PersistKey,
} from '@/stores/useUiPreferencesStore';

interface Team {
  id: string;
  name: string;
  icon?: string;
}

interface LeftSidebarProps {
  workspaceName: string;
  teams: Team[];
  selectedTeamId?: string | null;
  /** Selected nav item in format "teamId:itemId" or "home" */
  selectedNavItem?: string | null;
  onSelectTeam?: (teamId: string) => void;
  /** Handler for nav item selection, receives combined "teamId:itemId" format */
  onSelectNavItem?: (navItemKey: string) => void;
  onToggleSidebar?: () => void;
  className?: string;
}

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  indent?: boolean;
}

function NavItem({ icon: Icon, label, isActive, onClick, indent }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm transition-colors',
        indent && 'pl-7',
        isActive
          ? 'bg-panel text-high font-medium'
          : 'text-normal hover:bg-panel/50 hover:text-high'
      )}
    >
      <Icon className="size-icon-xs flex-shrink-0" weight={isActive ? 'fill' : 'regular'} />
      <span className="truncate">{label}</span>
    </button>
  );
}

interface TeamSectionProps {
  team: Team;
  persistKey: PersistKey;
  selectedNavItem?: string | null;
  onSelectNavItem?: (item: string) => void;
}

function TeamSection({
  team,
  persistKey,
  selectedNavItem,
  onSelectNavItem,
}: TeamSectionProps) {
  const [expanded, toggle] = usePersistedExpanded(persistKey, true);

  const navItems = [
    { id: 'issues', icon: CirclesFourIcon, label: 'Issues' },
    { id: 'cycles', icon: StackIcon, label: 'Cycles' },
    { id: 'projects', icon: FoldersIcon, label: 'Projects' },
    { id: 'views', icon: FunnelIcon, label: 'Views' },
  ];

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => toggle()}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm font-medium text-normal hover:bg-panel/50 hover:text-high transition-colors"
      >
        {expanded ? (
          <CaretDownIcon className="size-icon-xs flex-shrink-0" weight="fill" />
        ) : (
          <CaretRightIcon className="size-icon-xs flex-shrink-0" weight="fill" />
        )}
        <span className="truncate">{team.name}</span>
      </button>
      {expanded && (
        <div className="flex flex-col mt-0.5">
          {navItems.map((item) => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              indent
              isActive={selectedNavItem === `${team.id}:${item.id}`}
              onClick={() => onSelectNavItem?.(`${team.id}:${item.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function LeftSidebar({
  workspaceName,
  teams,
  selectedNavItem,
  onSelectNavItem,
  onToggleSidebar,
  className,
}: LeftSidebarProps) {
  const [localSelectedItem, setLocalSelectedItem] = useState<string | null>(null);

  const effectiveSelectedItem = selectedNavItem ?? localSelectedItem;
  const handleSelectNavItem = useCallback(
    (item: string) => {
      if (onSelectNavItem) {
        onSelectNavItem(item);
      } else {
        setLocalSelectedItem(item);
      }
    },
    [onSelectNavItem]
  );

  return (
    <div className={cn('w-full h-full bg-secondary flex flex-col', className)}>
      {/* Workspace Header */}
      <div className="flex items-center justify-between px-base py-2 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-6 rounded bg-brand flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">
              {workspaceName.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="font-semibold text-high truncate">{workspaceName}</span>
        </div>
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="text-low hover:text-normal p-1 rounded hover:bg-panel/50 transition-colors"
            title="Toggle sidebar"
          >
            <SidebarSimpleIcon className="size-icon-sm" />
          </button>
        )}
      </div>

      {/* Quick Navigation */}
      <div className="flex flex-col px-2 py-2 border-b gap-0.5">
        <NavItem
          icon={HouseIcon}
          label="Home"
          isActive={effectiveSelectedItem === 'home'}
          onClick={() => handleSelectNavItem('home')}
        />
      </div>

      {/* Teams Section */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="text-xs font-medium text-low uppercase tracking-wider px-2 mb-2">
          Teams
        </div>
        <div className="flex flex-col gap-1">
          {teams.map((team) => (
            <TeamSection
              key={team.id}
              team={team}
              persistKey={`left-sidebar-team-${team.id}` as PersistKey}
              selectedNavItem={effectiveSelectedItem}
              onSelectNavItem={handleSelectNavItem}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
