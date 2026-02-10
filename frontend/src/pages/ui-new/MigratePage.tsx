import { ThemeMode } from 'shared/types';
import { useTheme } from '@/components/ThemeProvider';
import { MigrateLayout } from '@/components/ui-new/containers/MigrateLayout';

function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === ThemeMode.SYSTEM) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme === ThemeMode.DARK ? 'dark' : 'light';
}

export function MigratePage() {
  const { theme } = useTheme();

  const logoSrc =
    resolveTheme(theme) === 'dark'
      ? '/vibe-kanban-logo-dark.svg'
      : '/vibe-kanban-logo.svg';

  return (
    <div className="h-full overflow-auto bg-primary">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-base py-double">
        <div className="rounded-sm border border-border bg-secondary p-double space-y-double">
          <header className="space-y-double text-center">
            <div className="flex justify-center">
              <img
                src={logoSrc}
                alt="Vibe Kanban"
                className="h-8 w-auto logo"
              />
            </div>
            <p className="text-sm text-low">
              Migrate your local projects to cloud projects.
            </p>
          </header>
          <MigrateLayout />
        </div>
      </div>
    </div>
  );
}
