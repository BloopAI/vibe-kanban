import type { Workspace } from '@/components/ui-new/hooks/useWorkspaces';
import { SessionChatBox } from '@/components/ui-new/primitives/SessionChatBox';

interface WorkspacesMainProps {
  selectedWorkspace: Workspace | null;
  isLoading: boolean;
  chatValue: string;
  onChatChange: (value: string) => void;
  onSend: () => void;
}

export function WorkspacesMain({
  selectedWorkspace,
  isLoading,
  chatValue,
  onChatChange,
  onSend,
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
    <main className="flex flex-1 flex-col bg-primary">
      <header className="p-base">
        <h1 className="text-xl font-semibold text-high">
          {selectedWorkspace.name}
        </h1>
        <p className="mt-1 text-normal">{selectedWorkspace.description}</p>
      </header>
      {/* Spacer to push chat to bottom */}
      <div className="flex-1" />
      {/* Chat box centered at bottom */}
      <div className="flex justify-center @container">
        <SessionChatBox
          filesChanged={19}
          linesAdded={10}
          linesRemoved={3}
          placeholder="Type some text here..."
          value={chatValue}
          onChange={onChatChange}
          onSend={onSend}
        />
      </div>
    </main>
  );
}
