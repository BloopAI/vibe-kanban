import { memo, useCallback, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { TaskWithAttemptStatus, TaskDependency } from 'shared/types';
import { TaskDAGNode, type TaskNodeData } from './TaskDAGNode';
import { TaskDAGEdge } from './TaskDAGEdge';
import {
  useTaskDependencies,
  createEdgeIdFromDependency,
  getDependencyIdFromEdgeId,
} from '@/hooks/useTaskDependencies';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';

const nodeTypes = {
  task: TaskDAGNode,
} as const;

const edgeTypes = {
  dependency: TaskDAGEdge,
};

interface TaskDAGViewProps {
  tasks: TaskWithAttemptStatus[];
  projectId: string;
  onViewDetails: (task: TaskWithAttemptStatus) => void;
}

// Simple layout algorithm: arrange nodes in a grid, grouped by status
function layoutNodes(
  tasks: TaskWithAttemptStatus[],
  onViewDetails: (task: TaskWithAttemptStatus) => void
): Node<TaskNodeData>[] {
  const nodeWidth = 200;
  const nodeHeight = 80;
  const horizontalGap = 50;
  const verticalGap = 40;

  // Group tasks by status for initial layout
  const statusGroups: Record<string, TaskWithAttemptStatus[]> = {
    todo: [],
    inprogress: [],
    done: [],
  };

  tasks.forEach((task) => {
    const group = statusGroups[task.status] || statusGroups.todo;
    group.push(task);
  });

  const nodes: Node<TaskNodeData>[] = [];
  let columnIndex = 0;

  Object.entries(statusGroups).forEach(([, groupTasks]) => {
    groupTasks.forEach((task, rowIndex) => {
      // Use saved position if available, otherwise calculate
      const x =
        task.dag_position_x ?? columnIndex * (nodeWidth + horizontalGap);
      const y =
        task.dag_position_y ?? rowIndex * (nodeHeight + verticalGap);

      nodes.push({
        id: task.id,
        type: 'task',
        position: { x, y },
        data: {
          task,
          onViewDetails,
        },
      });
    });
    columnIndex++;
  });

  return nodes;
}

function createEdges(
  dependencies: TaskDependency[],
  onDelete: (edgeId: string) => void
): Edge[] {
  return dependencies.map((dep) => ({
    id: createEdgeIdFromDependency(dep),
    source: dep.depends_on_task_id,
    target: dep.task_id,
    type: 'dependency',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 15,
      height: 15,
    },
    data: {
      onDelete,
    },
  }));
}

export const TaskDAGView = memo(function TaskDAGView({
  tasks,
  projectId,
  onViewDetails,
}: TaskDAGViewProps) {
  const { t } = useTranslation('tasks');
  const {
    dependencies,
    createDependency,
    deleteDependency,
  } = useTaskDependencies(projectId);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [edgeToDelete, setEdgeToDelete] = useState<string | null>(null);

  const handleEdgeDelete = useCallback((edgeId: string) => {
    setEdgeToDelete(edgeId);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (edgeToDelete) {
      const dependencyId = getDependencyIdFromEdgeId(edgeToDelete);
      if (dependencyId) {
        deleteDependency.mutate(dependencyId);
      }
    }
    setDeleteDialogOpen(false);
    setEdgeToDelete(null);
  }, [edgeToDelete, deleteDependency]);

  const cancelDelete = useCallback(() => {
    setDeleteDialogOpen(false);
    setEdgeToDelete(null);
  }, []);

  // Create initial nodes and edges
  const initialNodes = useMemo(
    () => layoutNodes(tasks, onViewDetails),
    [tasks, onViewDetails]
  );

  const initialEdges = useMemo(
    () => createEdges(dependencies, handleEdgeDelete),
    [dependencies, handleEdgeDelete]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when dependencies or tasks change
  useEffect(() => {
    const newNodes = layoutNodes(tasks, onViewDetails);
    setNodes(newNodes);
  }, [tasks, onViewDetails, setNodes]);

  useEffect(() => {
    setEdges(createEdges(dependencies, handleEdgeDelete));
  }, [dependencies, handleEdgeDelete, setEdges]);

  // Handle new connections (creating dependencies)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // source = depends_on_task_id (the task that must be completed first)
      // target = task_id (the task that depends on source)
      createDependency.mutate({
        task_id: connection.target,
        depends_on_task_id: connection.source,
      });
    },
    [createDependency]
  );

  return (
    <>
      <div className="w-full h-full min-h-[500px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{
            type: 'dependency',
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          <Panel position="top-left" className="bg-card/80 backdrop-blur-sm rounded-lg p-2 text-xs text-muted-foreground">
            {t('dag.instructions', 'Drag from bottom handle to top handle to create dependencies')}
          </Panel>
        </ReactFlow>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('dag.deleteDialog.title', 'Delete Dependency')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'dag.deleteDialog.description',
                'Are you sure you want to delete this dependency? This action cannot be undone.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDelete}>
              {t('dag.deleteDialog.cancel', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
            >
              {t('dag.deleteDialog.confirm', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
