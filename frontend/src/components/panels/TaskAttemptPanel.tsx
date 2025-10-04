interface TaskAttemptPanelProps {
  attemptId: string;
}

const TaskAttemptPanel = ({ attemptId }: TaskAttemptPanelProps) => {
  return (
    <div className="p-6">
      <p className="text-muted-foreground">Task Attempt Panel</p>
      <p className="mt-2">Attempt ID: {attemptId}</p>
    </div>
  );
};

export default TaskAttemptPanel;
