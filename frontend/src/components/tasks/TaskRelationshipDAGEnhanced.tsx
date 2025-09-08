import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { TaskRelationshipCard } from './TaskRelationshipCard';
import { attemptsApi } from '@/lib/api';
import type { Task, TaskAttempt, TaskRelationships } from 'shared/types';

interface TaskRelationshipDAGEnhancedProps {
  selectedAttempt: TaskAttempt | null;
  currentTask: Task;
  onNavigateToTask?: (taskId: string) => void;
}

// Simplified: just track children tasks directly

interface CardPosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// SVG Arrow Component
interface ArrowProps {
  from: CardPosition;
  to: CardPosition;
  isParentToChild?: boolean;
}

function Arrow({ from, to, isParentToChild = true }: ArrowProps) {
  const fromCenterX = from.x + from.width / 2;
  const toCenterX = to.x + to.width / 2;

  // Connection points with padding to avoid overlapping cards
  const padding = 5; // 5px padding from card edges
  const fromX = fromCenterX;
  const fromY = isParentToChild
    ? from.y + from.height + padding
    : from.y - padding;
  const toX = toCenterX;
  const toY = isParentToChild ? to.y - padding : to.y + to.height + padding;

  // Control point for curved arrow - create a nice bezier curve
  const controlX = fromX;
  const controlY = fromY + (toY - fromY) / 2;

  const path = `M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`;

  // Unique arrow marker
  const markerId = `arrowhead-${from.id}-${to.id}`;

  return (
    <g>
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon points="0,0 0,6 6,3" fill="hsl(var(--muted-foreground))" />
        </marker>
      </defs>
      <path
        d={path}
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="2"
        fill="none"
        markerEnd={`url(#${markerId})`}
        className="transition-all duration-200 hover:stroke-accent"
        opacity="0.7"
      />
    </g>
  );
}

export function TaskRelationshipDAGEnhanced({
  selectedAttempt,
  currentTask,
  onNavigateToTask,
}: TaskRelationshipDAGEnhancedProps) {
  const [relationships, setRelationships] = useState<TaskRelationships | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardPositions, setCardPositions] = useState<CardPosition[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedAttempt?.id) {
      setRelationships(null);
      return;
    }

    const fetchRelationships = async () => {
      setLoading(true);
      setError(null);
      try {
        // API returns complete relationship structure - much simpler!
        const relationshipData = await attemptsApi.getChildren(
          selectedAttempt.id
        );
        setRelationships(relationshipData);
      } catch (err) {
        console.error('Failed to fetch task relationships:', err);
        setError('Failed to load task relationships');
      } finally {
        setLoading(false);
      }
    };

    fetchRelationships();
  }, [selectedAttempt?.id]);

  // Calculate card positions after render - ALWAYS runs to show at least current task
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    // Much simpler with new structure!
    const parentTask = relationships?.parent_task;
    const childTasks = relationships?.children || [];

    const cardWidth = 280;
    const cardHeight = 80;
    const verticalSpacing = 40;
    const containerWidth = containerRef.current.offsetWidth;
    const cardX = Math.max(10, (containerWidth - cardWidth) / 2); // Center cards with minimum margin

    const positions: CardPosition[] = [];
    let currentY = 20; // Top padding

    // Position parent task if it exists
    if (parentTask) {
      positions.push({
        id: `parent-${parentTask.id}`,
        x: cardX,
        y: currentY,
        width: cardWidth,
        height: cardHeight,
      });
      currentY += cardHeight + verticalSpacing;
    }

    // ALWAYS position current task (this was the main bug!)
    const currentTaskPosition = {
      id: `current-${currentTask.id}`,
      x: cardX,
      y: currentY,
      width: cardWidth,
      height: cardHeight,
    };
    positions.push(currentTaskPosition);
    currentY += cardHeight + verticalSpacing;

    // Position child tasks (much simpler now!)
    childTasks.forEach((childTask) => {
      positions.push({
        id: `child-${childTask.id}`,
        x: cardX,
        y: currentY,
        width: cardWidth,
        height: cardHeight,
      });
      currentY += cardHeight + verticalSpacing;
    });

    setCardPositions(positions);
  }, [relationships, currentTask.id]);

  // Show component even if no relationships - at least show current task
  // Only hide if there's an error and no data to show

  const parentTask = relationships?.parent_task;
  const childTasks = relationships?.children || [];
  const hasParent = parentTask !== null;
  const hasChildren = childTasks.length > 0;
  const currentTaskPosition = cardPositions.find(
    (pos) => pos.id === `current-${currentTask.id}`
  );

  // Calculate container height
  const containerHeight =
    cardPositions.length > 0
      ? Math.max(...cardPositions.map((pos) => pos.y + pos.height)) + 20
      : 200;

  return (
    <Card className="mx-3 mb-4">
      <div className="p-4">
        <h3 className="text-sm font-medium mb-4 text-muted-foreground">
          {hasParent || hasChildren ? 'Task Relationships' : 'Current Task'}
        </h3>

        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Loading relationships...
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-8 text-center">
            {error}
          </div>
        ) : (
          <div
            ref={containerRef}
            className="relative"
            style={{ height: `${containerHeight}px`, minHeight: '200px' }}
          >
            {/* SVG Overlay for Arrows - positioned behind cards */}
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ zIndex: 1 }}
              width="100%"
              height="100%"
            >
              {/* Arrow from parent to current task */}
              {parentTask &&
                currentTaskPosition &&
                (() => {
                  const parentPos = cardPositions.find(
                    (pos) => pos.id === `parent-${parentTask.id}`
                  );
                  return parentPos ? (
                    <Arrow
                      key="parent-to-current"
                      from={parentPos}
                      to={currentTaskPosition}
                      isParentToChild={true}
                    />
                  ) : null;
                })()}

              {/* Arrows from current task to children */}
              {currentTaskPosition &&
                childTasks.map((childTask) => {
                  const childPos = cardPositions.find(
                    (pos) => pos.id === `child-${childTask.id}`
                  );
                  if (childPos) {
                    return (
                      <Arrow
                        key={`current-to-child-${childTask.id}`}
                        from={currentTaskPosition}
                        to={childPos}
                        isParentToChild={true}
                      />
                    );
                  }
                  return null;
                })}
            </svg>

            {/* Task Cards */}
            {cardPositions.map((position) => {
              const isCurrentTask = position.id.startsWith('current-');
              const isParentTask = position.id.startsWith('parent-');
              const isChildTask = position.id.startsWith('child-');

              let task;
              if (isCurrentTask) {
                task = currentTask;
              } else if (isChildTask) {
                const taskId = position.id.substring('child-'.length);
                task = childTasks.find((t) => t.id === taskId);
              } else if (isParentTask) {
                // Real parent task from the relationships data
                const taskId = position.id.substring('parent-'.length);
                task =
                  parentTask && parentTask.id === taskId ? parentTask : null;
              }

              if (!task) return null;

              return (
                <div
                  key={position.id}
                  className="absolute transition-all duration-300 ease-in-out"
                  style={{
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                    width: `${position.width}px`,
                    zIndex: 10, // Cards above arrows
                  }}
                >
                  <TaskRelationshipCard
                    task={task}
                    isCurrentTask={isCurrentTask}
                    onClick={() =>
                      !isCurrentTask && onNavigateToTask?.(task.id)
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
