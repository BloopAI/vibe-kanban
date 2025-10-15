import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useUserSystem } from '@/components/config-provider';
import { IdeIcon } from './IdeIcon';
import { EditorType } from 'shared/types';

type OpenInIdeButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

function getIdeName(editorType: EditorType | undefined | null): string {
  switch (editorType) {
    case EditorType.VS_CODE:
      return 'VS Code';
    case EditorType.CURSOR:
      return 'Cursor';
    case EditorType.WINDSURF:
      return 'Windsurf';
    case EditorType.INTELLI_J:
      return 'IntelliJ IDEA';
    case EditorType.ZED:
      return 'Zed';
    case EditorType.XCODE:
      return 'Xcode';
    case EditorType.CUSTOM:
      return 'IDE';
    default:
      return 'IDE';
  }
}

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
