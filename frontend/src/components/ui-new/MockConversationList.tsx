import {
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  VirtuosoMessageListProps,
} from '@virtuoso.dev/message-list';
import { useMemo } from 'react';

import MockDisplayConversationEntry from './MockDisplayConversationEntry';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';
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
}

const INITIAL_TOP_ITEM = { index: 'LAST' as const, align: 'end' as const };

const ItemContent: VirtuosoMessageListProps<
  MockPatchEntry,
  undefined
>['ItemContent'] = ({ data }) => {
  if (data.type === 'NORMALIZED_ENTRY') {
    return (
      <MockDisplayConversationEntry
        expansionKey={data.patchKey}
        entry={data.content}
      />
    );
  }
  return null;
};

const computeItemKey: VirtuosoMessageListProps<
  MockPatchEntry,
  undefined
>['computeItemKey'] = ({ data }) => `mock-${data.patchKey}`;

export function MockConversationList({ entries }: MockConversationListProps) {
  const channelData = useMemo(() => ({ data: entries }), [entries]);

  return (
    <ApprovalFormProvider>
      <VirtuosoMessageListLicense
        licenseKey={import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}
      >
        <VirtuosoMessageList<MockPatchEntry, undefined>
          className="h-full"
          data={channelData}
          initialLocation={INITIAL_TOP_ITEM}
          computeItemKey={computeItemKey}
          ItemContent={ItemContent}
          Header={() => <div className="h-2" />}
          Footer={() => <div className="h-2" />}
        />
      </VirtuosoMessageListLicense>
    </ApprovalFormProvider>
  );
}

export default MockConversationList;
