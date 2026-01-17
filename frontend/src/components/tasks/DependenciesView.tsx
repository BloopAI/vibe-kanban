import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  NodeTypes,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import { cn } from '@/lib/utils';

interface DependenciesViewProps {
  tasks: TaskWithAttemptStatus[];
  selectedTaskId?: string;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
}

// Status colors matching the kanban board
const statusColors: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-600',
  inprogress: 'bg-blue-50 border-blue-300 dark:bg-blue-900/30 dark:border-blue-600',
  inreview: 'bg-amber-50 border-amber-300 dark:bg-amber-900/30 dark:border-amber-600',
  done: 'bg-green-50 border-green-300 dark:bg-green-900/30 dark:border-green-600',
  cancelled: 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600',
};

const statusLabels: Record<TaskStatus, string> = {
  todo: 'Todo',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

// Custom node component for tasks
interface TaskNodeData {
  label: string;
  status: TaskStatus;
  task: TaskWithAttemptStatus;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  isSelected: boolean;
}

function TaskNode({ data }: { data: TaskNodeData }) {
  const handleClick = useCallback(() => {
    data.onViewTaskDetails(data.task);
  }, [data]);

  return (
    <div
      onClick={handleClick}
      className={cn(
        'px-4 py-3 rounded-lg border-2 cursor-pointer transition-all min-w-[180px] max-w-[250px]',
        'hover:shadow-md',
        statusColors[data.status],
        data.isSelected && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="font-medium text-sm truncate">{data.label}</div>
      <div className="text-xs text-muted-foreground mt-1">
        {statusLabels[data.status]}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  task: TaskNode,
};

export function DependenciesView({
  tasks,
  selectedTaskId,
  onViewTaskDetails,
}: DependenciesViewProps) {
  // Convert tasks to React Flow nodes
  const initialNodes: Node<TaskNodeData>[] = useMemo(() => {
    // Group tasks by status for layout
    const tasksByStatus: Record<TaskStatus, TaskWithAttemptStatus[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    tasks.forEach((task) => {
      const status = task.status.toLowerCase() as TaskStatus;
      tasksByStatus[status].push(task);
    });

    const nodes: Node<TaskNodeData>[] = [];
    const statusOrder: TaskStatus[] = ['todo', 'inprogress', 'inreview', 'done', 'cancelled'];
    const columnWidth = 300;
    const rowHeight = 120;

    statusOrder.forEach((status, colIndex) => {
      tasksByStatus[status].forEach((task, rowIndex) => {
        // Use saved position if available, otherwise calculate default position
        const x = task.dag_position_x ?? colIndex * columnWidth;
        const y = task.dag_position_y ?? rowIndex * rowHeight;

        nodes.push({
          id: task.id,
          type: 'task',
          position: { x, y },
          data: {
            label: task.title,
            status: status,
            task: task,
            onViewTaskDetails,
            isSelected: task.id === selectedTaskId,
          },
        });
      });
    });

    return nodes;
  }, [tasks, selectedTaskId, onViewTaskDetails]);

  // For now, edges are empty - will be populated when dependency relationships are implemented
  const initialEdges: Edge[] = useMemo(() => {
    // TODO: Implement edges based on task dependencies when the backend supports it
    return [];
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when tasks change
  useMemo(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useMemo(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 1,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}
