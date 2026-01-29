import { Link } from 'react-router-dom';
import { useEntity } from '@/lib/electric/hooks';
import { ISSUE_ENTITY } from 'shared/remote-types';
import { LinkIcon } from '@phosphor-icons/react';

interface RemoteIssueLinkProps {
  projectId: string;
  issueId: string;
}

export function RemoteIssueLink({ projectId, issueId }: RemoteIssueLinkProps) {
  // Subscribe to issues for this project via Electric sync
  const { data: issues, isLoading } = useEntity(ISSUE_ENTITY, {
    project_id: projectId,
  });

  // Find the specific issue
  const issue = issues.find((i) => i.id === issueId);

  if (isLoading || !issue) {
    return null;
  }

  return (
    <Link
      to={`/projects/${projectId}/issues/${issueId}`}
      className="flex items-center gap-half px-base py-half text-sm text-low hover:text-normal hover:bg-secondary rounded-sm transition-colors"
    >
      <LinkIcon className="size-icon-xs" weight="bold" />
      <span>{issue.simple_id}</span>
    </Link>
  );
}
