import { useTheme } from '@/shared/hooks/useTheme';

export function useStyleOverrideThemeSetter() {
  const { setTheme } = useTheme();
  return setTheme;
}
