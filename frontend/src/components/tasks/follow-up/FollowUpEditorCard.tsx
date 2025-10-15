import { Loader2 } from 'lucide-react';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import { cn } from '@/lib/utils';
import { useProject } from '@/contexts/project-context';
import { useCallback } from 'react';

type Props = {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<Element>) => void;
  disabled: boolean;
  // Loading overlay
  showLoadingOverlay: boolean;
  onPasteFiles?: (files: File[]) => void;
  textareaClassName?: string;
  onFocusChange?: (isFocused: boolean) => void;
};

export function FollowUpEditorCard({
  placeholder,
  value,
  onChange,
  onKeyDown,
  disabled,
  showLoadingOverlay,
  onPasteFiles,
  textareaClassName,
  onFocusChange,
}: Props) {
  const { projectId } = useProject();

  const handleFocus = useCallback(() => {
    onFocusChange?.(true);
  }, [onFocusChange]);

  const handleBlur = useCallback(() => {
    onFocusChange?.(false);
  }, [onFocusChange]);

  return (
    <div className="relative">
      <FileSearchTextarea
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn('flex-1 min-h-[40px] resize-none', textareaClassName)}
        disabled={disabled}
        projectId={projectId}
        rows={1}
        maxRows={30}
        onPasteFiles={onPasteFiles}
      />
      {showLoadingOverlay && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/60">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
    </div>
  );
}
