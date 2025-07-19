import SimpleTerminal from './SimpleTerminal';
import { TaskWithAttemptStatus } from 'shared/types';

interface TerminalTabProps {
  task: TaskWithAttemptStatus;
  projectId: string;
}

export default function TerminalTab({ task, projectId }: TerminalTabProps) {
  return <SimpleTerminal task={task} projectId={projectId} />;
}