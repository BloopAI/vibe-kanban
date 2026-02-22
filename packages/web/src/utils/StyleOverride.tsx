import { useTheme } from '@/shared/hooks/useTheme';

export { AppWithStyleOverride } from '@/shared/lib/StyleOverride';

export function useStyleOverrideThemeSetter() {
  const { setTheme } = useTheme();
  return setTheme;
}
