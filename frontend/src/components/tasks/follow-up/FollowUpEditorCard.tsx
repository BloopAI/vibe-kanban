import { Loader2 } from 'lucide-react';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { cn } from '@/lib/utils';

type Props = {
  placeholder: string;
  /** JSON string from the WYSIWYG editor */
  value: string;
  /** Receives JSON string from the WYSIWYG editor */
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<Element>) => void;
  disabled: boolean;
  showLoadingOverlay: boolean;
  onPasteFiles?: (files: File[]) => void;
  textareaClassName?: string;
  onFocusChange?: (isFocused: boolean) => void;
  projectId?: string;
};

export function FollowUpEditorCard({
  placeholder,
  value,
  onChange,
  disabled,
  showLoadingOverlay,
  onPasteFiles,
  textareaClassName,
  onFocusChange,
  projectId,
}: Props) {
  return (
    <div className="relative">
      <WYSIWYGEditor
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        onPasteFiles={onPasteFiles}
        onFocusChange={onFocusChange}
        className={cn('min-h-[40px]', textareaClassName)}
        projectId={projectId}
      />
      {showLoadingOverlay && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/60">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
    </div>
  );
}
