import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { TaskStatus } from 'shared/types';

// ステータスアイコンのマッピング
const STATUS_ICONS: Record<TaskStatus, string> = {
  todo: '○',
  inprogress: '⏳',
  inreview: '👀',
  done: '✓',
  cancelled: '✕',
};

// ステータスに応じたノードの色分け（ボーダーと背景）
const STATUS_NODE_COLORS: Record<TaskStatus, string> = {
  todo: 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800',
  inprogress:
    'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/30',
  inreview:
    'border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-900/30',
  done: 'border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-900/30',
  cancelled:
    'border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-900/30',
};

// ステータスに応じたアイコンの色
const STATUS_ICON_COLORS: Record<TaskStatus, string> = {
  todo: 'text-slate-500 dark:text-slate-400',
  inprogress: 'text-blue-600 dark:text-blue-400',
  inreview: 'text-amber-600 dark:text-amber-400',
  done: 'text-emerald-600 dark:text-emerald-400',
  cancelled: 'text-red-500 dark:text-red-400',
};

// TaskNodeのデータ型
export interface TaskNodeData extends Record<string, unknown> {
  taskId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
}

// TaskNode用のNode型
export type TaskNodeType = Node<TaskNodeData, 'task'>;

function TaskNodeComponent({ data }: NodeProps<TaskNodeType>) {
  const { title, description, status } = data;
  const icon = STATUS_ICONS[status] || STATUS_ICONS.todo;
  const nodeColor = STATUS_NODE_COLORS[status] || STATUS_NODE_COLORS.todo;
  const iconColor = STATUS_ICON_COLORS[status] || STATUS_ICON_COLORS.todo;

  return (
    <>
      {/* 上部Handle（入力） */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !border-slate-300 dark:!bg-slate-500 dark:!border-slate-600"
      />

      {/* ノード本体 */}
      <div
        className={cn(
          'min-w-[180px] max-w-[240px] rounded-lg border-2 shadow-sm',
          'transition-all duration-200',
          'hover:shadow-md',
          nodeColor
        )}
      >
        <div className="p-3">
          {/* タイトル行 */}
          <div className="flex items-start gap-2">
            <span className={cn('text-base flex-shrink-0', iconColor)}>
              {icon}
            </span>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
              {title}
            </span>
          </div>

          {/* 詳細（あれば表示） */}
          {description && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1 pl-6">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* 下部Handle（出力） */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-400 !border-slate-300 dark:!bg-slate-500 dark:!border-slate-600"
      />
    </>
  );
}

// メモ化してパフォーマンス最適化
export const TaskNode = memo(TaskNodeComponent);
