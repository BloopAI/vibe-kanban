import { type ReactNode } from 'react';
import {
  DndContext,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import type { Project, ProjectGroup } from 'shared/types';
import { DraggableProjectCard } from './DraggableProjectCard';

export type { DragEndEvent, DragStartEvent };

interface BoardsDndContextProps {
  children: ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart?: (event: DragStartEvent) => void;
  activeProject: Project | null;
  groups: ProjectGroup[];
}

export function BoardsDndContext({
  children,
  onDragEnd,
  onDragStart,
  activeProject,
  groups,
}: BoardsDndContextProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  return (
    <DndContext
      collisionDetection={rectIntersection}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      sensors={sensors}
    >
      {children}
      <DragOverlay>
        {activeProject && (
          <DraggableProjectCard
            project={activeProject}
            groupId={activeProject.group_id ?? null}
            groups={groups}
            isOverlay
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
