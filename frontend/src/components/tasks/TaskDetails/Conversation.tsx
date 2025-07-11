import { NormalizedConversationViewer } from '@/components/tasks/TaskDetails/NormalizedConversationViewer.tsx';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TaskAttemptDataContext } from '@/components/context/taskDetailsContext.ts';

type Props = {
  conversationUpdateTrigger: number;
  handleConversationUpdate: () => void;
};

function Conversation({
  conversationUpdateTrigger,
  handleConversationUpdate,
}: Props) {
  const { attemptData } = useContext(TaskAttemptDataContext);
  const [shouldAutoScrollLogs, setShouldAutoScrollLogs] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shouldAutoScrollLogs && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [
    attemptData.activities,
    attemptData.processes,
    conversationUpdateTrigger,
    shouldAutoScrollLogs,
  ]);

  const handleLogsScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        scrollContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;

      if (isAtBottom && !shouldAutoScrollLogs) {
        setShouldAutoScrollLogs(true);
      } else if (!isAtBottom && shouldAutoScrollLogs) {
        setShouldAutoScrollLogs(false);
      }
    }
  }, [shouldAutoScrollLogs]);

  const mainCodingAgentProcess = useMemo(() => {
    let mainCAProcess = Object.values(attemptData.runningProcessDetails).find(
      (process) =>
        process.process_type === 'codingagent' && process.command === 'executor'
    );

    if (!mainCAProcess) {
      const mainCodingAgentSummary = attemptData.processes.find(
        (process) =>
          process.process_type === 'codingagent' &&
          process.command === 'executor'
      );

      if (mainCodingAgentSummary) {
        mainCAProcess = Object.values(attemptData.runningProcessDetails).find(
          (process) => process.id === mainCodingAgentSummary.id
        );

        if (!mainCAProcess) {
          mainCAProcess = {
            ...mainCodingAgentSummary,
            stdout: null,
            stderr: null,
          } as any;
        }
      }
    }
    return mainCAProcess;
  }, [attemptData.processes, attemptData.runningProcessDetails]);

  const followUpProcesses = useMemo(() => {
    return attemptData.processes
      .filter(
        (process) =>
          process.process_type === 'codingagent' &&
          process.command === 'followup_executor'
      )
      .map((summary) => {
        const detailedProcess = Object.values(
          attemptData.runningProcessDetails
        ).find((process) => process.id === summary.id);
        return (
          detailedProcess ||
          ({
            ...summary,
            stdout: null,
            stderr: null,
          } as any)
        );
      });
  }, [attemptData.processes, attemptData.runningProcessDetails]);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleLogsScroll}
      className="h-full overflow-y-auto"
    >
      {mainCodingAgentProcess || followUpProcesses.length > 0 ? (
        <div className="space-y-8">
          {mainCodingAgentProcess && (
            <div className="space-y-6">
              <NormalizedConversationViewer
                executionProcess={mainCodingAgentProcess}
                onConversationUpdate={handleConversationUpdate}
                diffDeletable
              />
            </div>
          )}
          {followUpProcesses.map((followUpProcess) => (
            <div key={followUpProcess.id}>
              <div className="border-t border-border mb-8"></div>
              <NormalizedConversationViewer
                executionProcess={followUpProcess}
                onConversationUpdate={handleConversationUpdate}
                diffDeletable
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg font-semibold mb-2">Coding Agent Starting</p>
          <p>Initializing conversation...</p>
        </div>
      )}
    </div>
  );
}

export default Conversation;
