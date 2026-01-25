import { useTranslation } from 'react-i18next';
import type { IssuePriority, User } from 'shared/remote-types';
import { CollapsibleSectionHeader } from '@/components/ui-new/primitives/CollapsibleSectionHeader';
import { SubIssueRow } from '@/components/ui-new/primitives/SubIssueRow';
import { PERSIST_KEYS, type PersistKey } from '@/stores/useUiPreferencesStore';

export interface SubIssueData {
  id: string;
  simpleId: string;
  title: string;
  priority: IssuePriority;
  statusColor: string;
  assignees: User[];
  createdAt: string;
}

export interface IssueSubIssuesSectionProps {
  subIssues: SubIssueData[];
  onSubIssueClick: (issueId: string) => void;
  isLoading?: boolean;
}

export function IssueSubIssuesSection({
  subIssues,
  onSubIssueClick,
  isLoading,
}: IssueSubIssuesSectionProps) {
  const { t } = useTranslation('common');

  return (
    <CollapsibleSectionHeader
      title={t('kanban.subIssues', 'Sub-issues')}
      persistKey={PERSIST_KEYS.kanbanIssueSubIssues as PersistKey}
      defaultExpanded={true}
    >
      <div className="px-base pb-base flex flex-col">
        {isLoading ? (
          <p className="text-low py-half">
            {t('common.loading', 'Loading...')}
          </p>
        ) : subIssues.length === 0 ? (
          <p className="text-low py-half">
            {t('kanban.noSubIssues', 'No sub-issues')}
          </p>
        ) : (
          subIssues.map((subIssue) => (
            <SubIssueRow
              key={subIssue.id}
              simpleId={subIssue.simpleId}
              title={subIssue.title}
              priority={subIssue.priority}
              statusColor={subIssue.statusColor}
              assignees={subIssue.assignees}
              createdAt={subIssue.createdAt}
              onClick={() => onSubIssueClick(subIssue.id)}
            />
          ))
        )}
      </div>
    </CollapsibleSectionHeader>
  );
}
