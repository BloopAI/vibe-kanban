import { type ReactNode, useContext } from 'react';
import { createHmrContext } from '@/shared/lib/hmrContext';

export type AppRuntime = 'local' | 'remote';

const AppRuntimeContext = createHmrContext<AppRuntime | undefined>(
  'AppRuntimeContext',
  undefined
);

export function AppRuntimeProvider({
  runtime,
  children,
}: {
  runtime: AppRuntime;
  children: ReactNode;
}) {
  return (
    <AppRuntimeContext.Provider value={runtime}>
      {children}
    </AppRuntimeContext.Provider>
  );
}

export function useAppRuntime(): AppRuntime {
  const runtime = useContext(AppRuntimeContext);

  if (!runtime) {
    throw new Error('useAppRuntime must be used within an AppRuntimeProvider');
  }

  return runtime;
}
