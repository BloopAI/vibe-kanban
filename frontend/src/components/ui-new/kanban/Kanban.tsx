'use client';

import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DraggableProvided,
  type DraggableStateSnapshot,
  type DroppableProvided,
} from '@hello-pangea/dnd';
import { type ReactNode, type Ref, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import {
  PlusIcon,
  WarningCircleIcon,
  ArrowUpIcon,
  MinusIcon,
  ArrowDownIcon,
  UsersIcon,
} from '@phosphor-icons/react';
import type { IssuePriority } from 'shared/remote-types';
import { UserAvatar } from '@/components/tasks/UserAvatar';
import { RunningDots } from '@/components/ui-new/primitives/RunningDots';
import { Button } from '@/components/ui/button';

export type { DropResult } from '@hello-pangea/dnd';

export type Status = {
  id: string;
  name: string;
  color: string;
};

// =============================================================================
// Priority Icon Component
// =============================================================================

export type PriorityIconProps = {
  priority: IssuePriority;
  className?: string;
};

const priorityConfig: Record<
  IssuePriority,
  { icon: typeof WarningCircleIcon; colorClass: string }
> = {
  urgent: { icon: WarningCircleIcon, colorClass: 'text-error' },
  high: { icon: ArrowUpIcon, colorClass: 'text-brand' },
  medium: { icon: MinusIcon, colorClass: 'text-low' },
  low: { icon: ArrowDownIcon, colorClass: 'text-low' },
};

export const PriorityIcon = ({ priority, className }: PriorityIconProps) => {
  const { icon: IconComponent, colorClass } = priorityConfig[priority];

  return (
    <div
      className={cn(
        'flex items-center justify-center',
        'h-5 w-5',
        'bg-panel rounded-sm',
        className
      )}
      aria-label={`Priority: ${priority}`}
    >
      <IconComponent className={cn('size-icon-xs', colorClass)} weight="bold" />
    </div>
  );
};

// =============================================================================
// Kanban Badge Component
// =============================================================================

export type KanbanBadgeProps = {
  name: string;
  className?: string;
};

export const KanbanBadge = ({ name, className }: KanbanBadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        'h-5 px-base',
        'bg-panel rounded-sm',
        'text-sm text-low font-medium',
        'whitespace-nowrap',
        className
      )}
    >
      {name}
    </span>
  );
};

// =============================================================================
// Kanban Assignee Component
// =============================================================================

export type KanbanAssigneeProps = {
  assignee: {
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    imageUrl?: string | null;
  } | null;
  className?: string;
};

export const KanbanAssignee = ({
  assignee,
  className,
}: KanbanAssigneeProps) => {
  if (!assignee) {
    // Unassigned state - show users icon
    return (
      <div
        className={cn('flex items-center justify-center', 'h-5 w-5', className)}
        aria-label="Unassigned"
      >
        <UsersIcon className="size-icon-xs text-low" weight="bold" />
      </div>
    );
  }

  // Assigned state - show avatar with name
  const displayName =
    [assignee.firstName, assignee.lastName].filter(Boolean).join(' ') ||
    assignee.username ||
    '';

  return (
    <div className={cn('flex items-center gap-half h-5', className)}>
      <UserAvatar
        firstName={assignee.firstName}
        lastName={assignee.lastName}
        username={assignee.username}
        imageUrl={assignee.imageUrl}
        className="h-3 w-3 text-[8px] border-white"
      />
      {displayName && (
        <span className="text-sm text-normal truncate max-w-[80px]">
          {displayName}
        </span>
      )}
    </div>
  );
};

// =============================================================================
// Kanban Card Content Component
// =============================================================================

export type KanbanCardContentProps = {
  displayId: string;
  title: string;
  description?: string | null;
  priority: IssuePriority;
  tags: { id: string; name: string }[];
  assignee: KanbanAssigneeProps['assignee'];
  isLoading?: boolean;
  className?: string;
};

export const KanbanCardContent = ({
  displayId,
  title,
  description,
  priority,
  tags,
  assignee,
  isLoading = false,
  className,
}: KanbanCardContentProps) => {
  return (
    <div className={cn('flex flex-col gap-half', className)}>
      {/* Row 1: Task ID + loading dots */}
      <div className="flex items-center gap-half">
        <span className="font-ibm-plex-mono text-sm text-low">{displayId}</span>
        {isLoading && <RunningDots />}
      </div>

      {/* Row 2: Title */}
      <span className="text-base text-high">{title}</span>

      {/* Row 3: Description (optional, truncated) */}
      {description && (
        <p className="text-sm text-low m-0 leading-relaxed line-clamp-base">
          {description}
        </p>
      )}

      {/* Row 4: Priority, Tags, Assignee */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-half flex-wrap flex-1 min-w-0">
          <PriorityIcon priority={priority} />
          {tags.slice(0, 2).map((tag) => (
            <KanbanBadge key={tag.id} name={tag.name} />
          ))}
          {tags.length > 2 && (
            <span className="text-sm text-low">+{tags.length - 2}</span>
          )}
        </div>
        <KanbanAssignee assignee={assignee} />
      </div>
    </div>
  );
};

export type Feature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: Status;
};

// =============================================================================
// Kanban Board (Droppable Column)
// =============================================================================

export type KanbanBoardProps = {
  id: Status['id'];
  children: ReactNode;
  className?: string;
};

export const KanbanBoard = ({ id, children, className }: KanbanBoardProps) => {
  return (
    <Droppable droppableId={id}>
      {(provided: DroppableProvided) => (
        <div
          className={cn('flex flex-col min-h-40', className)}
          ref={provided.innerRef}
          {...provided.droppableProps}
        >
          {children}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
};

// =============================================================================
// Kanban Card (Draggable)
// =============================================================================

export type KanbanCardProps = Pick<Feature, 'id' | 'name'> & {
  index: number;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  tabIndex?: number;
  forwardedRef?: Ref<HTMLDivElement>;
  onKeyDown?: (e: KeyboardEvent) => void;
  isOpen?: boolean;
  dragDisabled?: boolean;
};

export const KanbanCard = ({
  id,
  name,
  index,
  children,
  className,
  onClick,
  tabIndex,
  forwardedRef,
  onKeyDown,
  isOpen,
  dragDisabled = false,
}: KanbanCardProps) => {
  return (
    <Draggable draggableId={id} index={index} isDragDisabled={dragDisabled}>
      {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => {
        // Combine DnD ref and forwarded ref
        const setRefs = (node: HTMLDivElement | null) => {
          provided.innerRef(node);
          if (typeof forwardedRef === 'function') {
            forwardedRef(node);
          } else if (forwardedRef && typeof forwardedRef === 'object') {
            (
              forwardedRef as React.MutableRefObject<HTMLDivElement | null>
            ).current = node;
          }
        };

        return (
          <Card
            className={cn(
              'p-base outline-none flex-col border -mt-[1px] -mx-[1px] bg-secondary',
              snapshot.isDragging && 'cursor-grabbing shadow-lg',
              isOpen && 'ring-2 ring-secondary-foreground ring-inset',
              className
            )}
            ref={setRefs}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            tabIndex={tabIndex}
            onClick={onClick}
            onKeyDown={onKeyDown}
          >
            {children ?? <p className="m-0 font-medium text-sm">{name}</p>}
          </Card>
        );
      }}
    </Draggable>
  );
};

// =============================================================================
// Kanban Cards Container
// =============================================================================

export type KanbanCardsProps = {
  children: ReactNode;
  className?: string;
};

export const KanbanCards = ({ children, className }: KanbanCardsProps) => (
  <div className={cn('flex flex-1 flex-col', className)}>{children}</div>
);

// =============================================================================
// Kanban Header
// =============================================================================

export type KanbanHeaderProps =
  | {
      children: ReactNode;
    }
  | {
      name: Status['name'];
      color: Status['color'];
      className?: string;
      onAddTask?: () => void;
    };

export const KanbanHeader = (props: KanbanHeaderProps) => {
  const { t } = useTranslation('tasks');

  if ('children' in props) {
    return props.children;
  }

  return (
    <Card
      className={cn(
        'sticky top-0 z-20 flex shrink-0 items-center gap-base p-base flex gap-base',
        'bg-background',
        props.className
      )}
      style={{
        backgroundImage: `linear-gradient(hsl(var(${props.color}) / 0.03), hsl(var(${props.color}) / 0.03))`,
      }}
    >
      <span className="flex-1 flex items-center gap-base">
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: `hsl(var(${props.color}))` }}
        />

        <p className="m-0 text-sm">{props.name}</p>
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              className="m-0 p-0 h-0 text-foreground/50 hover:text-foreground"
              onClick={props.onAddTask}
              aria-label={t('actions.addTask')}
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{t('actions.addTask')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </Card>
  );
};

// =============================================================================
// Kanban Provider (DragDropContext)
// =============================================================================

export type KanbanProviderProps = {
  children: ReactNode;
  onDragEnd: (result: DropResult) => void;
  className?: string;
};

export const KanbanProvider = ({
  children,
  onDragEnd,
  className,
}: KanbanProviderProps) => {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div
        className={cn(
          'inline-grid grid-flow-col auto-cols-[minmax(200px,400px)] divide-x border-t border-x items-stretch min-h-full',
          className
        )}
      >
        {children}
      </div>
    </DragDropContext>
  );
};
