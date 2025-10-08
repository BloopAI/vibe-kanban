import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useUserSystem } from '@/components/config-provider';
import { IdeIcon, getIdeName } from './IdeIcon';

type OpenInIdeButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

export function OpenInIdeButton({
  onClick,
  disabled = false,
  className,
}: OpenInIdeButtonProps) {
  const { config } = useUserSystem();
  const editorType = config?.editor?.editor_type ?? null;

  const label = useMemo(() => {
    const ideName = getIdeName(editorType);
    return `Open in ${ideName}`;
  }, [editorType]);

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-10 w-10 p-0 hover:opacity-70 transition-opacity ${className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <IdeIcon editorType={editorType} className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </Button>
  );
}
