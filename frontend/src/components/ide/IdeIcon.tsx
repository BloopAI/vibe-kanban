import { Code2 } from 'lucide-react';
import { EditorType, ThemeMode } from 'shared/types';
import { useTheme } from '@/components/theme-provider';

type IdeIconProps = {
  editorType?: EditorType | null;
  className?: string;
};

function getResolvedTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === ThemeMode.SYSTEM) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === ThemeMode.DARK ? 'dark' : 'light';
}

export function IdeIcon({ editorType, className = "h-4 w-4" }: IdeIconProps) {
  const { theme } = useTheme();
  const resolvedTheme = getResolvedTheme(theme);

  if (editorType === EditorType.VS_CODE) {
    return (
      <img 
        src="/.vibe-images/ac5eb1a9-b988-499e-b94c-f11454175ec0.svg"
        alt="VS Code"
        className={className}
      />
    );
  }
  
  if (editorType === EditorType.CURSOR) {
    const cursorIcon = resolvedTheme === 'dark' 
      ? "/.vibe-images/ecec13ec-2d7f-4d4f-8dd6-b10cdf77601d.svg"  // dark
      : "/.vibe-images/81fee604-4430-4604-ad7b-3828faabd157.svg";  // light
    
    return (
      <img 
        src={cursorIcon}
        alt="Cursor"
        className={className}
      />
    );
  }
  
  // Generic fallback for other IDEs or no IDE configured
  return <Code2 className={className} />;
}
