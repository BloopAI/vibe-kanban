'use client';

import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DragEndEvent, Modifier } from '@dnd-kit/core';
import {
  DndContext,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
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
import type { ClientRect } from '@dnd-kit/core';
import type { Transform } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
export type { DragEndEvent } from '@dnd-kit/core';

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
        <p className="text-sm text-low m-0 leading-relaxed line-clamp-2">
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

export type KanbanBoardProps = {
  id: Status['id'];
  children: ReactNode;
  className?: string;
};

export const KanbanBoard = ({ id, children, className }: KanbanBoardProps) => {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      className={cn(
        'flex min-h-40 flex-col',
        isOver ? 'outline-primary' : 'outline-black',
        className
      )}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
};

export type KanbanCardProps = Pick<Feature, 'id' | 'name'> & {
  index: number;
  parent: string;
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
  parent,
  children,
  className,
  onClick,
  tabIndex,
  forwardedRef,
  onKeyDown,
  isOpen,
  dragDisabled = false,
}: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data: { index, parent },
      disabled: dragDisabled,
    });

  // Combine DnD ref and forwarded ref
  const combinedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef && typeof forwardedRef === 'object') {
      (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
    }
  };

  return (
    <Card
      className={cn(
        'p-base outline-none border-b flex-col',
        isDragging && 'cursor-grabbing',
        isOpen && 'ring-2 ring-secondary-foreground ring-inset',
        className
      )}
      {...listeners}
      {...attributes}
      ref={combinedRef}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={{
        zIndex: isDragging ? 1000 : 1,
        transform: transform
          ? `translateX(${transform.x}px) translateY(${transform.y}px)`
          : 'none',
      }}
    >
      {children ?? <p className="m-0 font-medium text-sm">{name}</p>}
    </Card>
  );
};

export type KanbanCardsProps = {
  children: ReactNode;
  className?: string;
};

export const KanbanCards = ({ children, className }: KanbanCardsProps) => (
  <div className={cn('flex flex-1 flex-col', className)}>{children}</div>
);

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
        'sticky top-0 z-20 flex shrink-0 items-center gap-2 p-3 border-b border-dashed flex gap-2',
        'bg-background',
        props.className
      )}
      style={{
        backgroundImage: `linear-gradient(hsl(var(${props.color}) / 0.03), hsl(var(${props.color}) / 0.03))`,
      }}
    >
      <span className="flex-1 flex items-center gap-2">
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

function restrictToBoundingRectWithRightPadding(
  transform: Transform,
  rect: ClientRect,
  boundingRect: ClientRect,
  rightPadding: number
): Transform {
  const value = {
    ...transform,
  };

  if (rect.top + transform.y <= boundingRect.top) {
    value.y = boundingRect.top - rect.top;
  } else if (
    rect.bottom + transform.y >=
    boundingRect.top + boundingRect.height
  ) {
    value.y = boundingRect.top + boundingRect.height - rect.bottom;
  }

  if (rect.left + transform.x <= boundingRect.left) {
    value.x = boundingRect.left - rect.left;
  } else if (
    // branch that checks if the right edge of the dragged element is beyond
    // the right edge of the bounding rectangle
    rect.right + transform.x + rightPadding >=
    boundingRect.left + boundingRect.width
  ) {
    value.x =
      boundingRect.left + boundingRect.width - rect.right - rightPadding;
  }

  return {
    ...value,
    x: value.x,
  };
}

// An alternative to `restrictToFirstScrollableAncestor` from the dnd-kit library
const restrictToFirstScrollableAncestorCustom: Modifier = (args) => {
  const { draggingNodeRect, transform, scrollableAncestorRects } = args;
  const firstScrollableAncestorRect = scrollableAncestorRects[0];

  if (!draggingNodeRect || !firstScrollableAncestorRect) {
    return transform;
  }

  // Inset the right edge that the rect can be dragged to by this amount.
  // This is a workaround for the kanban board where dragging a card too far
  // to the right causes infinite horizontal scrolling if there are also
  // enough cards for vertical scrolling to be enabled.
  const rightPadding = 16;
  return restrictToBoundingRectWithRightPadding(
    transform,
    draggingNodeRect,
    firstScrollableAncestorRect,
    rightPadding
  );
};

export type KanbanProviderProps = {
  children: ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
  className?: string;
};

export const KanbanProvider = ({
  children,
  onDragEnd,
  className,
}: KanbanProviderProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  return (
    <DndContext
      collisionDetection={rectIntersection}
      onDragEnd={onDragEnd}
      sensors={sensors}
      modifiers={[restrictToFirstScrollableAncestorCustom]}
    >
      <div
        className={cn(
          'inline-grid grid-flow-col auto-cols-[minmax(200px,400px)] divide-x border-x items-stretch min-h-full',
          className
        )}
      >
        {children}
      </div>
    </DndContext>
  );
};
