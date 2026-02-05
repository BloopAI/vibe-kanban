import { useMemo, useCallback } from 'react';
import { PlusIcon } from '@phosphor-icons/react';
import { useProjectContext } from '@/contexts/remote/ProjectContext';
import { useActions } from '@/contexts/ActionsContext';
import { useKanbanNavigation } from '@/hooks/useKanbanNavigation';
import { resolveRelationshipsForIssue } from '@/lib/resolveRelationships';
import { IssueRelationshipsSection } from '@/components/ui-new/views/IssueRelationshipsSection';
import type { SectionAction } from '@/components/ui-new/primitives/CollapsibleSectionHeader';

interface IssueRelationshipsSectionContainerProps {
  issueId: string;
}

export function IssueRelationshipsSectionContainer({
  issueId,
}: IssueRelationshipsSectionContainerProps) {
  const { projectId, openIssue } = useKanbanNavigation();
  const { openRelationshipSelection } = useActions();

  const {
    getRelationshipsForIssue,
    removeIssueRelationship,
    issuesById,
    isLoading,
  } = useProjectContext();

  const relationships = useMemo(
    () =>
      resolveRelationshipsForIssue(
        issueId,
        getRelationshipsForIssue(issueId),
        issuesById
      ),
    [issueId, getRelationshipsForIssue, issuesById]
  );

  const handleRelationshipClick = useCallback(
    (relatedIssueId: string) => {
      openIssue(relatedIssueId);
    },
    [openIssue]
  );

  const handleRemoveRelationship = useCallback(
    (relationshipId: string) => {
      removeIssueRelationship(relationshipId);
    },
    [removeIssueRelationship]
  );

  const handleAddRelationship = useCallback(() => {
    if (projectId) {
      openRelationshipSelection(projectId, issueId, 'related', 'forward');
    }
  }, [projectId, issueId, openRelationshipSelection]);

  const actions: SectionAction[] = useMemo(
    () => [
      {
        icon: PlusIcon,
        onClick: handleAddRelationship,
      },
    ],
    [handleAddRelationship]
  );

  return (
    <IssueRelationshipsSection
      relationships={relationships}
      onRelationshipClick={handleRelationshipClick}
      onRemoveRelationship={handleRemoveRelationship}
      isLoading={isLoading}
      actions={actions}
    />
  );
}
