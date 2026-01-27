/**
 * Position Calculator for Task Ordering
 *
 * Uses a fractional positioning system similar to LexoRank for efficient
 * drag-and-drop reordering without requiring database updates for all tasks.
 */

const MIN_POSITION = -2147483648; // i32::MIN
const MAX_POSITION = 2147483647; // i32::MAX
const DEFAULT_GAP = 1000;

export interface TaskPosition {
  id: string;
  position: number;
}

/**
 * Calculate new position for a task being dropped
 * @param prevPosition Position of the task before the drop target (or null if dropping at top)
 * @param nextPosition Position of the task after the drop target (or null if dropping at bottom)
 * @returns New position for the dragged task
 */
export function calculateNewPosition(
  prevPosition: number | null,
  nextPosition: number | null
): number {
  // Dropping at the top
  if (prevPosition === null && nextPosition !== null) {
    return nextPosition - DEFAULT_GAP;
  }

  // Dropping at the bottom
  if (prevPosition !== null && nextPosition === null) {
    return prevPosition + DEFAULT_GAP;
  }

  // Dropping in the middle - calculate average
  if (prevPosition !== null && nextPosition !== null) {
    const gap = nextPosition - prevPosition;

    // If gap is too small (< 2), we need to rebalance
    if (gap < 2) {
      return prevPosition + 1; // Will trigger rebalancing on backend
    }

    return Math.floor((prevPosition + nextPosition) / 2);
  }

  // Default case: first task in empty column
  return 0;
}

/**
 * Get the new position for a task being moved to a specific index in a list
 * @param targetIndex The index where the task is being dropped
 * @param tasks The current list of tasks in the target column (sorted by position)
 * @param draggedTaskId ID of the task being dragged (to exclude from calculations)
 * @returns New position for the dragged task
 */
export function calculatePositionForIndex(
  targetIndex: number,
  tasks: TaskPosition[],
  draggedTaskId?: string
): number {
  // Filter out the dragged task if moving within the same column
  const filteredTasks = draggedTaskId
    ? tasks.filter((t) => t.id !== draggedTaskId)
    : tasks;

  const prevTask = filteredTasks[targetIndex - 1];
  const nextTask = filteredTasks[targetIndex];

  return calculateNewPosition(
    prevTask?.position ?? null,
    nextTask?.position ?? null
  );
}

/**
 * Check if positions need rebalancing (when gaps become too small)
 * @param tasks List of tasks to check
 * @returns true if rebalancing is recommended
 */
export function needsRebalancing(tasks: TaskPosition[]): boolean {
  if (tasks.length < 2) return false;

  const sortedTasks = [...tasks].sort((a, b) => a.position - b.position);

  for (let i = 1; i < sortedTasks.length; i++) {
    const gap = sortedTasks[i].position - sortedTasks[i - 1].position;
    if (gap < 10) {
      return true;
    }
  }

  return false;
}

/**
 * Rebalance positions for a list of tasks
 * Distributes tasks evenly across the available position space
 * @param tasks List of tasks to rebalance
 * @returns Array of position updates
 */
export function rebalancePositions(
  tasks: TaskPosition[]
): Array<{ task_id: string; position: number }> {
  if (tasks.length === 0) return [];

  const sortedTasks = [...tasks].sort((a, b) => a.position - b.position);
  const totalRange = MAX_POSITION - MIN_POSITION;
  const gap = Math.floor(totalRange / (sortedTasks.length + 1));

  return sortedTasks.map((task, index) => ({
    task_id: task.id,
    position: MIN_POSITION + gap * (index + 1),
  }));
}
