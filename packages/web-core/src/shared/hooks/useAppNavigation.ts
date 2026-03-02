import { createElement, type ReactNode, useContext } from 'react';
import { createHmrContext } from '@/shared/lib/hmrContext';
import type { AppNavigation } from '@/shared/lib/routes/appNavigation';

const AppNavigationContext = createHmrContext<AppNavigation | undefined>(
  'AppNavigationContext',
  undefined
);

export function AppNavigationProvider({
  value,
  children,
}: {
  value: AppNavigation;
  children: ReactNode;
}) {
  return createElement(AppNavigationContext.Provider, { value }, children);
}

export function useAppNavigation(): AppNavigation {
  const appNavigation = useContext(AppNavigationContext);

  if (!appNavigation) {
    throw new Error(
      'useAppNavigation must be used within an AppNavigationProvider'
    );
  }

  return appNavigation;
}
