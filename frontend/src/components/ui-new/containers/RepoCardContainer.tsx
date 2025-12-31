import { useState } from 'react';
import {
  RepoCard,
  type RepoAction,
} from '@/components/ui-new/primitives/RepoCard';

interface RepoCardContainerProps {
  name: string;
  targetBranch: string;
  commitsAhead?: number;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  branchDropdownContent?: React.ReactNode;
  onChangeTarget?: () => void;
  onRebase?: () => void;
  onActionsClick?: (action: RepoAction) => void;
}

export function RepoCardContainer(props: RepoCardContainerProps) {
  const [selectedAction, setSelectedAction] =
    useState<RepoAction>('pull-request');

  return (
    <RepoCard
      {...props}
      selectedAction={selectedAction}
      onSelectionChange={setSelectedAction}
    />
  );
}
