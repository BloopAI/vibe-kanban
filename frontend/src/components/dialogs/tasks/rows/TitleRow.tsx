import { Input } from '@/components/ui/input';
import { useTaskFormStore } from '@/stores/useTaskFormStore';

interface TitleRowProps {
  disabled?: boolean;
  autoFocus?: boolean;
}

export function TitleRow({ disabled, autoFocus }: TitleRowProps) {
  const title = useTaskFormStore((s) => s.title);
  const setTitle = useTaskFormStore((s) => s.setTitle);

  return (
    <div className="pr-8 pt-3">
      <Input
        id="task-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        className="text-lg font-medium border-none shadow-none px-0 placeholder:text-muted-foreground/60 focus-visible:ring-0"
        disabled={disabled}
        autoFocus={autoFocus}
      />
    </div>
  );
}
