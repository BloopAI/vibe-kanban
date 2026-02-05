'use client';

import { cn } from '@/lib/utils';
import type { ProjectStatus, Issue, Tag } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { IssueListSection } from '@/components/ui-new/views/IssueListSection';

export interface IssueListViewProps {
  statuses: ProjectStatus[];
  items: Record<string, string[]>;
  issueMap: Record<string, Issue>;
  issueAssigneesMap: Record<string, OrganizationMemberWithProfile[]>;
  getTagObjectsForIssue: (issueId: string) => Tag[];
  onIssueClick: (issueId: string) => void;
  selectedIssueId: string | null;
  className?: string;
}

export function IssueListView({
  statuses,
  items,
  issueMap,
  issueAssigneesMap,
  getTagObjectsForIssue,
  onIssueClick,
  selectedIssueId,
  className,
}: IssueListViewProps) {
  return (
    <div className={cn('flex flex-col h-full overflow-y-auto', className)}>
      {statuses.map((status) => (
        <IssueListSection
          key={status.id}
          status={status}
          issueIds={items[status.id] ?? []}
          issueMap={issueMap}
          issueAssigneesMap={issueAssigneesMap}
          getTagObjectsForIssue={getTagObjectsForIssue}
          onIssueClick={onIssueClick}
          selectedIssueId={selectedIssueId}
        />
      ))}
    </div>
  );
}
