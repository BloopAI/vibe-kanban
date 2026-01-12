import { useDraggable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import {
  Kanban,
  DotsThree,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { Project, ProjectGroup } from 'shared/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';

interface DraggableProjectCardProps {
  project: Project;
  groupId: string | null;
  groups: ProjectGroup[];
  isOverlay?: boolean;
  onMoveToGroup?: (projectId: string, groupId: string | null) => void;
}

export function DraggableProjectCard({
  project,
  groupId,
  groups,
  isOverlay = false,
  onMoveToGroup,
}: DraggableProjectCardProps) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: project.id,
      data: {
        type: 'project',
        project,
        sourceGroupId: groupId,
      },
      disabled: isOverlay,
    });

  const handleClick = () => {
    if (!isDragging) {
      navigate(`/projects/${project.id}/tasks`);
    }
  };

  const formattedDate = new Date(
    project.created_at as unknown as string
  ).toLocaleDateString();

  const style = isOverlay
    ? {
        transform: 'rotate(3deg) scale(1.02)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        cursor: 'grabbing',
      }
    : {
        transform: transform
          ? `translateX(${transform.x}px) translateY(${transform.y}px)`
          : undefined,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 1000 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
      };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'flex flex-col p-base bg-secondary rounded border border-panel',
        'hover:border-brand/50 transition-colors group',
        isDragging && 'shadow-lg'
      )}
      style={style}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-half mb-half">
        <div className="flex items-center gap-half min-w-0">
          <Kanban weight="fill" className="size-4 text-brand shrink-0" />
          <span className="font-medium text-normal truncate">{project.name}</span>
        </div>
        {onMoveToGroup && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-half rounded hover:bg-panel text-low hover:text-normal opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <DotsThree weight="bold" className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}/tasks`)}>
                Open board
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to group</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {groupId && (
                    <>
                      <DropdownMenuItem
                        onClick={() => onMoveToGroup(project.id, null)}
                      >
                        Remove from group
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {groups.map((group) => (
                    <DropdownMenuItem
                      key={group.id}
                      onClick={() => onMoveToGroup(project.id, group.id)}
                      disabled={group.id === groupId}
                    >
                      {group.name}
                    </DropdownMenuItem>
                  ))}
                  {groups.length === 0 && (
                    <div className="px-2 py-1 text-sm text-low">No groups</div>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="text-xs text-low">Created {formattedDate}</div>
    </div>
  );
}
