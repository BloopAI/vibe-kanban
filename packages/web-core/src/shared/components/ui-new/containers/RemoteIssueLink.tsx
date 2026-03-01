import { useShape } from '@/shared/integrations/electric/hooks';
import { PROJECT_ISSUES_SHAPE } from 'shared/remote-types';
import { LinkIcon } from '@phosphor-icons/react';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';

interface RemoteIssueLinkProps {
  projectId: string;
  issueId: string;
}

export function RemoteIssueLink({ projectId, issueId }: RemoteIssueLinkProps) {
  const appNavigation = useAppNavigation();

  // Subscribe to issues for this project via Electric sync
  const { data: issues, isLoading } = useShape(PROJECT_ISSUES_SHAPE, {
    project_id: projectId,
  });

  // Find the specific issue
  const issue = issues.find((i) => i.id === issueId);

  if (isLoading || !issue) {
    return null;
  }

  return (
    <button
      type="button"
      className="flex items-center gap-half px-base text-sm text-low hover:text-normal hover:bg-secondary rounded-sm transition-colors"
      onClick={() => {
        appNavigation.navigate(
          appNavigation.toProjectIssue(projectId, issueId)
        );
      }}
    >
      <LinkIcon className="size-icon-xs" weight="bold" />
      <span>{issue.simple_id}</span>
    </button>
  );
}
