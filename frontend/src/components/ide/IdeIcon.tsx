import { Code2 } from 'lucide-react';
import { EditorType, ThemeMode } from 'shared/types';
import { useTheme } from '@/components/ThemeProvider';

type IdeIconProps = {
  editorType?: EditorType | null;
  className?: string;
};

function getResolvedTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === ThemeMode.SYSTEM) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme === ThemeMode.DARK ? 'dark' : 'light';
}

export function getIdeName(editorType: EditorType | undefined | null): string {
  if (!editorType) return 'IDE';
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
  }
}

export function IdeIcon({ editorType, className = 'h-4 w-4' }: IdeIconProps) {
  const { theme } = useTheme();
  const resolvedTheme = getResolvedTheme(theme);
  const isDark = resolvedTheme === 'dark';

  const ideName = getIdeName(editorType);
  let ideIconPath = '';

  if (!editorType || editorType === EditorType.CUSTOM) {
    // Generic fallback for other IDEs or no IDE configured
    return <Code2 className={className} />;
  }

  switch (editorType) {
    case EditorType.VS_CODE:
      ideIconPath = isDark ? '/ide/vscode-dark.svg' : '/ide/vscode-light.svg';
      break;
    case EditorType.CURSOR:
      ideIconPath = isDark ? '/ide/cursor-dark.svg' : '/ide/cursor-light.svg';
      break;
    case EditorType.WINDSURF:
      ideIconPath = isDark
        ? '/ide/windsurf-dark.svg'
        : '/ide/windsurf-light.svg';
      break;
    case EditorType.INTELLI_J:
      ideIconPath = '/ide/intellij.svg';
      break;
    case EditorType.ZED:
      ideIconPath = isDark ? '/ide/zed-dark.svg' : '/ide/zed-light.svg';
      break;
    case EditorType.XCODE:
      ideIconPath = '/ide/xcode.svg';
      break;
  }

  return <img src={ideIconPath} alt={ideName} className={className} />;
}
