import type { Workspace } from '@/components/ui-new/hooks/useWorkspaces';
import { SessionChatBox } from '@/components/ui-new/primitives/SessionChatBox';
import {
  MockConversationList,
  type MockPatchEntry,
} from '../MockConversationList';
import mockEntries from '@/mock/normalized_entries.json';

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
    <main className="flex flex-1 flex-col bg-primary max-h-screen">
      <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
        <div className="w-chat max-w-full h-full">
          <MockConversationList entries={mockEntries as MockPatchEntry[]} />
        </div>
      </div>
      {/* Chat box centered at bottom */}
      <div className="flex justify-center @container">
        <SessionChatBox
          filesChanged={19}
          linesAdded={10}
          linesRemoved={3}
          value={chatValue}
          onChange={onChatChange}
          onSend={onSend}
        />
      </div>
    </main>
  );
}
