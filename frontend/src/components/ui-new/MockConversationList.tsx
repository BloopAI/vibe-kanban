import {
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  VirtuosoMessageListProps,
} from '@virtuoso.dev/message-list';
import { useMemo } from 'react';

import NewDisplayConversationEntry from './NewDisplayConversationEntry';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import type { NormalizedEntry } from 'shared/types';

// Type for mock data entries
export type MockPatchEntry = {
  type: 'NORMALIZED_ENTRY';
  content: NormalizedEntry;
  patchKey: string;
  executionProcessId: string;
};

interface MockConversationListProps {
  entries: MockPatchEntry[];
  attemptId?: string;
}

const INITIAL_TOP_ITEM = { index: 'LAST' as const, align: 'end' as const };

const ItemContent: VirtuosoMessageListProps<
  MockPatchEntry,
  undefined
>['ItemContent'] = ({ data }) => {
  if (data.type === 'NORMALIZED_ENTRY') {
    return (
      <NewDisplayConversationEntry
        expansionKey={data.patchKey}
        entry={data.content}
        executionProcessId={data.executionProcessId}
      />
    );
  }
  return null;
};

const computeItemKey: VirtuosoMessageListProps<
  MockPatchEntry,
  undefined
>['computeItemKey'] = ({ data }) => `mock-${data.patchKey}`;

export function MockConversationList({
  entries,
  attemptId,
}: MockConversationListProps) {
  const channelData = useMemo(() => ({ data: entries }), [entries]);

  return (
    <ExecutionProcessesProvider attemptId={attemptId}>
      <RetryUiProvider attemptId={attemptId}>
        <ApprovalFormProvider>
          <VirtuosoMessageListLicense
            licenseKey={import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}
          >
            <VirtuosoMessageList<MockPatchEntry, undefined>
              className="h-full scrollbar-none"
              data={channelData}
              initialLocation={INITIAL_TOP_ITEM}
              computeItemKey={computeItemKey}
              ItemContent={ItemContent}
              Header={() => <div className="h-2" />}
              Footer={() => <div className="h-2" />}
            />
          </VirtuosoMessageListLicense>
        </ApprovalFormProvider>
      </RetryUiProvider>
    </ExecutionProcessesProvider>
  );
}

export default MockConversationList;
