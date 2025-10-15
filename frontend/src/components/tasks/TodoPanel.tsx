import { Circle, Check, CircleDot, ChevronDown } from 'lucide-react';
import { useEntries } from '@/contexts/EntriesContext';
import { usePinnedTodos } from '@/hooks/usePinnedTodos';
import { Card } from '../ui/card';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const TODO_PANEL_OPEN_KEY = 'todo-panel-open';

function getStatusIcon(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'completed')
    return <Check aria-hidden className="h-4 w-4 text-success" />;
  if (s === 'in_progress' || s === 'in-progress')
    return <CircleDot aria-hidden className="h-4 w-4 text-blue-500" />;
  return <Circle aria-hidden className="h-4 w-4 text-muted-foreground" />;
}

function TodoPanel() {
  const { t } = useTranslation('tasks');
  const { entries } = useEntries();
  const { todos } = usePinnedTodos(entries);
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(TODO_PANEL_OPEN_KEY);
    return stored === null ? true : stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem(TODO_PANEL_OPEN_KEY, String(isOpen));
  }, [isOpen]);

  if (!todos || todos.length === 0) return null;

  return (
    <details
      className="group"
      open={isOpen}
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
    >
      <summary className="list-none cursor-pointer">
        <Card className="bg-muted p-3 text-sm flex items-center justify-between">
          <span>{t('todos.title', { count: todos.length })}</span>
          <ChevronDown
            aria-hidden
            className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </Card>
      </summary>
      <div className="px-3 pb-2">
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
    </details>
  );
}

export default TodoPanel;
