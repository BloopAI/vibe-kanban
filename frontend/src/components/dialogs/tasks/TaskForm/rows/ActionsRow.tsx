import { useRef } from 'react';
import { Plus, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTaskFormStore } from '@/stores/useTaskFormStore';

interface ActionsRowProps {
  mode: 'create' | 'edit';
  onFileSelect: (files: File[]) => void;
  onSubmit: () => void;
  onCreateAndStart: () => void;
  canSubmit: boolean;
}

export function ActionsRow({
  mode,
  onFileSelect,
  onSubmit,
  onCreateAndStart,
  canSubmit,
}: ActionsRowProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoStart = useTaskFormStore((s) => s.autoStart);
  const setAutoStart = useTaskFormStore((s) => s.setAutoStart);
  const isSubmitting = useTaskFormStore((s) => s.isSubmitting);
  const title = useTaskFormStore((s) => s.title);
  const selectedExecutorProfile = useTaskFormStore(
    (s) => s.selectedExecutorProfile
  );
  const selectedBranch = useTaskFormStore((s) => s.selectedBranch);

  const handleFileClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFileSelect(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  const isCreateDisabled =
    isSubmitting ||
    !title.trim() ||
    (autoStart && (!selectedExecutorProfile || !selectedBranch));

  return (
    <div className="border-t pt-3 flex items-center justify-between gap-3">
      {/* Left: Image attach button */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleFileClick}
          className="h-9 w-9 p-0 rounded-none"
          aria-label="Attach image"
        >
          <Image className="h-4 w-4" />
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {mode === 'create' && (
          <div className="flex items-center gap-2">
            <Switch
              id="autostart-switch"
              checked={autoStart}
              onCheckedChange={setAutoStart}
              disabled={isSubmitting}
            />
            <Label
              htmlFor="autostart-switch"
              className="text-sm cursor-pointer"
            >
              Start
            </Label>
          </div>
        )}

        {mode === 'edit' ? (
          <Button onClick={onSubmit} disabled={!canSubmit}>
            {isSubmitting ? 'Updating...' : 'Update Task'}
          </Button>
        ) : (
          <Button
            onClick={autoStart ? onCreateAndStart : onSubmit}
            disabled={isCreateDisabled}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {isSubmitting ? 'Creating...' : 'Create'}
          </Button>
        )}
      </div>
    </div>
  );
}
