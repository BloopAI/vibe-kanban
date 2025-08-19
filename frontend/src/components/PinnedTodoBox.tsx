import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
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
    <div className="sticky top-0 z-10 border-b bg-muted/20">
      {isCollapsed && (
        <div
          className="flex items-center justify-between px-4 py-2 cursor-pointer"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-primary" />
            <span className="text-sm text-primary">TODOs</span>
          </div>
          <div className="flex items-center gap-2">
            <ChevronDown className="h-4 w-4 text-primary" />
          </div>
        </div>
      )}

      {!isCollapsed && (
        <div className="relative">
          <div className="absolute top-2 right-2 z-20">
            <button
              className="flex items-center justify-center p-1 cursor-pointer hover:bg-muted/40 rounded"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              <ChevronUp className="h-4 w-4 text-primary" />
            </button>
          </div>
          <div className="px-4 py-2 pr-10 space-y-2 max-h-64 overflow-y-auto">
            {todos.map((todo, index) => (
              <div
                key={`${todo.content}-${index}`}
                className="flex items-start gap-2 text-sm"
              >
                <span className="mt-0.5 flex-shrink-0">
                  {getStatusIcon(todo.status)}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="break-words text-primary">
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
