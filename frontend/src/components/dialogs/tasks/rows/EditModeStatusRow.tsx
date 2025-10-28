import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTaskFormStore } from '@/stores/useTaskFormStore';
import type { TaskStatus } from 'shared/types';

interface EditModeStatusRowProps {
  disabled?: boolean;
}

export function EditModeStatusRow({ disabled }: EditModeStatusRowProps) {
  const status = useTaskFormStore((s) => s.status);
  const setStatus = useTaskFormStore((s) => s.setStatus);

  return (
    <div className="space-y-2">
      <Label htmlFor="task-status" className="text-sm font-medium">
        Status
      </Label>
      <Select
        value={status}
        onValueChange={(value) => setStatus(value as TaskStatus)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todo">To Do</SelectItem>
          <SelectItem value="inprogress">In Progress</SelectItem>
          <SelectItem value="inreview">In Review</SelectItem>
          <SelectItem value="done">Done</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
