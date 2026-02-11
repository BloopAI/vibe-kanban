'use client';

import { cn } from '@/lib/utils';
import type { ProjectStatus, Issue, Tag } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import type { ResolvedRelationship } from '@/lib/resolveRelationships';
import { Droppable } from '@hello-pangea/dnd';
import { CaretDownIcon } from '@phosphor-icons/react';
import { StatusDot } from '@/components/ui-new/primitives/StatusDot';
import { KanbanBadge } from '@/components/ui-new/primitives/KanbanBadge';
import { IssueListRow } from '@/components/ui-new/views/IssueListRow';
import {
  usePersistedExpanded,
  type PersistKey,
} from '@/stores/useUiPreferencesStore';

export interface IssueListSectionProps {
  status: ProjectStatus;
  issueIds: string[];
  issueMap: Record<string, Issue>;
  issueAssigneesMap: Record<string, OrganizationMemberWithProfile[]>;
  getTagObjectsForIssue: (issueId: string) => Tag[];
  getResolvedRelationshipsForIssue?: (
    issueId: string
  ) => ResolvedRelationship[];
  onIssueClick: (issueId: string) => void;
  selectedIssueId: string | null;
  className?: string;
}

export function IssueListSection({
  status,
  issueIds,
  issueMap,
  issueAssigneesMap,
  getTagObjectsForIssue,
  getResolvedRelationshipsForIssue,
  onIssueClick,
  selectedIssueId,
  className,
}: IssueListSectionProps) {
  const persistKey = `list-section-${status.id}` as PersistKey;
  const [isExpanded, setExpanded] = usePersistedExpanded(persistKey, true);

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Section Header */}
      <button
        type="button"
        onClick={() => setExpanded(!isExpanded)}
        className={cn(
          'flex items-center justify-between',
          'h-8 px-double py-base',
          'bg-panel border-y border-border',
          'cursor-pointer transition-colors',
          'hover:bg-secondary'
        )}
      >
        <div className="flex items-center gap-base">
          <CaretDownIcon
            className={cn(
              'size-icon-xs text-low transition-transform',
              !isExpanded && '-rotate-90'
            )}
            weight="bold"
          />
          <StatusDot color={status.color} />
          <span className="text-base font-medium text-high">{status.name}</span>
        </div>
        <KanbanBadge name={String(issueIds.length)} />
      </button>

      {/* Section Content - Droppable area */}
      <Droppable droppableId={status.id}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex flex-col min-h-8"
          >
            {isExpanded &&
              issueIds.map((issueId, index) => {
                const issue = issueMap[issueId];
                if (!issue) return null;

                return (
                  <IssueListRow
                    key={issue.id}
                    issue={issue}
                    index={index}
                    statusColor={status.color}
                    tags={getTagObjectsForIssue(issue.id)}
                    relationships={getResolvedRelationshipsForIssue?.(issue.id)}
                    assignees={issueAssigneesMap[issue.id] ?? []}
                    onClick={() => onIssueClick(issue.id)}
                    isSelected={selectedIssueId === issue.id}
                  />
                );
              })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
