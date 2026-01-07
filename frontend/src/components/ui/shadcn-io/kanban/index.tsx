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
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
} from 'lucide-react';
import type { ClientRect } from '@dnd-kit/core';
import type { Transform } from '@dnd-kit/utilities';
import { Button } from '../../button';
export type { DragEndEvent } from '@dnd-kit/core';

export type Status = {
  id: string;
  name: string;
  color: string;
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
  collapsed?: boolean;
};

export const KanbanBoard = ({ id, children, className, collapsed = false }: KanbanBoardProps) => {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      className={cn(
        'flex flex-col transition-all duration-200',
        collapsed ? 'w-[48px]' : 'min-w-[200px] max-w-[400px] min-h-40',
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
        'p-3 outline-none border-b flex-col space-y-2',
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
      onCollapseAll?: () => void;
      onExpandAll?: () => void;
      allCollapsed?: boolean;
      onToggleColumnCollapsed?: () => void;
      columnCollapsed?: boolean;
    };

export const KanbanHeader = (props: KanbanHeaderProps) => {
  const { t } = useTranslation('tasks');

  if ('children' in props) {
    return props.children;
  }

  const handleCollapseToggle = () => {
    if (props.allCollapsed) {
      props.onExpandAll?.();
    } else {
      props.onCollapseAll?.();
    }
  };

  return (
    <Card
      className={cn(
        'sticky z-20 flex shrink-0 items-center gap-2 p-3 border-b border-dashed transition-all duration-200',
        'bg-background',
        props.columnCollapsed ? 'flex-col rotate-180 origin-center writing-mode-vertical-rl top-0 left-0' : 'flex-row top-0',
        props.className
      )}
      style={{
        backgroundImage: `linear-gradient(hsl(var(${props.color}) / 0.03), hsl(var(${props.color}) / 0.03))`,
        ...(props.columnCollapsed && {
          writingMode: 'vertical-rl',
          width: '48px',
          height: 'auto',
        }),
      }}
    >
      <span className={cn(
        'flex items-center gap-2',
        props.columnCollapsed ? 'flex-col' : 'flex-1'
      )}>
        {props.onToggleColumnCollapsed && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "m-0 p-0 h-auto text-foreground/50 hover:text-foreground",
                    props.columnCollapsed && "rotate-180"
                  )}
                  onClick={props.onToggleColumnCollapsed}
                  aria-label={
                    props.columnCollapsed ? t('expand') : t('collapse')
                  }
                >
                  {props.columnCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {props.columnCollapsed ? t('expand') : t('collapse')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: `hsl(var(${props.color}))` }}
        />

        <p className="m-0 text-sm whitespace-nowrap">{props.name}</p>
      </span>
      {!props.columnCollapsed && (
        <TooltipProvider>
          {(props.onCollapseAll || props.onExpandAll) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="m-0 p-0 h-0 text-foreground/50 hover:text-foreground"
                  onClick={handleCollapseToggle}
                  aria-label={
                    props.allCollapsed
                      ? t('actions.expandAll')
                      : t('actions.collapseAll')
                  }
                >
                  {props.allCollapsed ? (
                    <ChevronsUpDown className="h-4 w-4" />
                  ) : (
                    <ChevronsDownUp className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {props.allCollapsed
                  ? t('actions.expandAll')
                  : t('actions.collapseAll')}
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="m-0 p-0 h-0 text-foreground/50 hover:text-foreground"
                onClick={props.onAddTask}
                aria-label={t('actions.addTask')}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('actions.addTask')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
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
          'inline-flex divide-x border-x items-stretch min-h-full',
          className
        )}
      >
        {children}
      </div>
    </DndContext>
  );
};
