import { WorkspacesLayout } from './WorkspacesLayout';

interface WorkspacesProps {
  isAppBarHovered?: boolean;
}

export function Workspaces({ isAppBarHovered = false }: WorkspacesProps) {
  return <WorkspacesLayout isAppBarHovered={isAppBarHovered} />;
}
