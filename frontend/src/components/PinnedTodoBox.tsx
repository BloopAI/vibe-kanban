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

  if (todos.length === 0) {
    return null;
  }

  return (
    <div className="sticky top-0 z-10 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 shadow-sm">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          <span className="font-medium text-purple-800 dark:text-purple-200">
            TODOs
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="border-t border-purple-200 dark:border-purple-800">
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
                  <span className="text-purple-900 dark:text-purple-100 break-words">
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
