import type { Workspace } from '@/components/ui-new/hooks/useWorkspaces';

interface WorkspacesMainProps {
  selectedWorkspace: Workspace | null;
  isLoading: boolean;
}

export function WorkspacesMain({
  selectedWorkspace,
  isLoading,
}: WorkspacesMainProps) {
  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-primary">
        <p className="text-low">Loading...</p>
      </main>
    );
  }

  if (!selectedWorkspace) {
    return (
      <main className="flex flex-1 items-center justify-center bg-primary">
        <p className="text-low">Select a workspace to get started</p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-primary p-base">
      <header className="mb-padding-double">
        <h1 className="text-2xl font-bold text-high">
          {selectedWorkspace.name}
        </h1>
        <p className="mt-1 text-normal">{selectedWorkspace.description}</p>
      </header>
      <section className="rounded-lg border border-low bg-secondary p-padding">
        <p className="text-low">
          Workspace content will appear here. This demonstrates the
          logic/presentation separation pattern.
        </p>
      </section>
    </main>
  );
}
