import { useTheme } from '@/app/providers/ThemeProvider';

export { AppWithStyleOverride } from '@/shared/lib/StyleOverride';

export function useStyleOverrideThemeSetter() {
  const { setTheme } = useTheme();
  return setTheme;
}
