import { type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

interface DroppableGroupProps {
  groupId: string | null;
  children: ReactNode;
  className?: string;
}

export function DroppableGroup({
  groupId,
  children,
  className,
}: DroppableGroupProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: groupId ?? 'ungrouped',
    data: {
      type: 'group',
      groupId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'border rounded overflow-hidden transition-colors',
        isOver ? 'border-brand bg-brand/5' : 'border-panel',
        className
      )}
    >
      {children}
    </div>
  );
}

interface EmptyGroupDropZoneProps {
  isOver?: boolean;
}

export function EmptyGroupDropZone({ isOver }: EmptyGroupDropZoneProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center py-double border-2 border-dashed rounded transition-colors',
        isOver ? 'border-brand bg-brand/5' : 'border-panel'
      )}
    >
      <span className="text-sm text-low">
        {isOver ? 'Drop here to add to this group' : 'No boards in this group'}
      </span>
    </div>
  );
}
