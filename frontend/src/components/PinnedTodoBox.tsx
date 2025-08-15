import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Circle,
  CircleCheck,
  CircleDotDashed,
} from 'lucide-react';
import type { TodoItem } from 'shared/types';

interface PinnedTodoBoxProps {
  todos: TodoItem[];
  lastUpdated: string | null;
}

const getStatusIcon = (status: string): React.ReactNode => {
  switch (status.toLowerCase()) {
    case 'completed':
      return <CircleCheck className="h-4 w-4 text-green-500" />;
    case 'in_progress':
    case 'in-progress':
      return <CircleDotDashed className="h-4 w-4 text-blue-500" />;
    case 'pending':
    case 'todo':
      return <Circle className="h-4 w-4 text-gray-400" />;
    default:
      return <Circle className="h-4 w-4 text-gray-400" />;
  }
};

export const PinnedTodoBox: React.FC<PinnedTodoBoxProps> = ({ todos }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (todos.length === 0) return null;

  return (
    <div className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900/60"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            TODOs
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
          ) : (
            <ChevronUp className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="px-4 py-3 space-y-2 max-h-64 overflow-y-auto">
            {todos.map((todo, index) => (
              <div
                key={`${todo.content}-${index}`}
                className="flex items-start gap-2 text-sm"
              >
                <span className="mt-0.5 flex-shrink-0">
                  {getStatusIcon(todo.status)}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-zinc-900 dark:text-zinc-100 break-words">
                    {todo.content}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
