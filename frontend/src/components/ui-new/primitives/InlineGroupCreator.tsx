import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface InlineGroupCreatorProps {
  isCreating: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  className?: string;
}

export function InlineGroupCreator({
  isCreating,
  value,
  onChange,
  onSubmit,
  onCancel,
  className,
}: InlineGroupCreatorProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      e.preventDefault();
      onSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  if (!isCreating) return null;

  return (
    <div
      className={cn(
        'border border-brand rounded p-base bg-secondary',
        className
      )}
    >
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Group name"
        className="w-full px-base py-half bg-primary rounded border border-panel text-sm text-normal placeholder:text-low focus:outline-none focus:ring-1 focus:ring-brand"
      />
      <div className="flex justify-end gap-half mt-half">
        <button
          type="button"
          onClick={onCancel}
          className="px-base py-half text-sm text-low hover:text-normal transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim()}
          className={cn(
            'px-base py-half text-sm rounded transition-colors',
            value.trim()
              ? 'bg-brand text-white hover:bg-brand/90'
              : 'bg-panel text-low cursor-not-allowed'
          )}
        >
          Create
        </button>
      </div>
    </div>
  );
}
