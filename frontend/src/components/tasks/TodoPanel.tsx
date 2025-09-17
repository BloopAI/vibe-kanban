import { Circle, CircleCheckBig, CircleDotDashed } from 'lucide-react';
import { useEntries } from '@/contexts/EntriesContext';
import { usePinnedTodos } from '@/hooks/usePinnedTodos';
import { Card } from '../ui/card';

function getStatusIcon(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'completed')
    return <CircleCheckBig aria-hidden className="h-4 w-4 text-success" />;
  if (s === 'in_progress' || s === 'in-progress')
    return <CircleDotDashed aria-hidden className="h-4 w-4 text-blue-500" />;
  return <Circle aria-hidden className="h-4 w-4 text-muted-foreground" />;
}

export function TodoPanel() {
  const { entries } = useEntries();
  const { todos } = usePinnedTodos(entries);

  // Only show once the agent has created subtasks
  if (!todos || todos.length === 0) return null;

  return (
    <div>
      <Card className="bg-background p-3 border border-dashed text-sm">
        Todos
      </Card>
      <div className="p-3">
        <ul className="space-y-2">
          {todos.map((todo, index) => (
            <li
              key={`${todo.content}-${index}`}
              className="flex items-start gap-2"
            >
              <span className="mt-0.5 h-4 w-4 flex items-center justify-center shrink-0">
                {getStatusIcon(todo.status)}
              </span>
              <span className="text-sm leading-5 break-words">
                {todo.content}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default TodoPanel;
