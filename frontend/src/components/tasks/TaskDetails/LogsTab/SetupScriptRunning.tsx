import { useEffect, useMemo, useRef } from 'react';
import { ExecutionProcess } from 'shared/types';

type Props = {
  setupProcessId: string | null;
  runningProcessDetails: Record<string, ExecutionProcess>;
};

function SetupScriptRunning({ setupProcessId, runningProcessDetails }: Props) {
  const setupScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll setup script logs to bottom
  useEffect(() => {
    if (setupScrollRef.current) {
      setupScrollRef.current.scrollTop = setupScrollRef.current.scrollHeight;
    }
  }, [runningProcessDetails]);

  const setupProcess = useMemo(
    () =>
      setupProcessId
        ? runningProcessDetails[setupProcessId]
        : Object.values(runningProcessDetails).find(
        (process) => process.run_reason === 'setupscript'
        ),
    [setupProcessId, runningProcessDetails]
  );

  return (
    <div ref={setupScrollRef} className="h-full overflow-y-auto">
      <div className="mb-4">
        <p className="text-lg font-semibold mb-2">Setup Script Running</p>
        <p className="text-muted-foreground mb-4">
          Preparing the environment for the coding agent...
        </p>
      </div>

      {setupProcess && (
        <div className="font-mono text-sm whitespace-pre-wrap text-muted-foreground">
          {/* TODO: stdout/stderr fields need to be restored to ExecutionProcess type */}
          Setup script status: {setupProcess.status}
          {setupProcess.completed_at && <div>Completed: {setupProcess.completed_at}</div>}
          {setupProcess.exit_code !== null && <div>Exit code: {setupProcess.exit_code.toString()}</div>}
        </div>
      )}
    </div>
  );
}

export default SetupScriptRunning;
