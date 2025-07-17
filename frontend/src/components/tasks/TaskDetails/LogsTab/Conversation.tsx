import { NormalizedConversationViewer } from '@/components/tasks/TaskDetails/LogsTab/NormalizedConversationViewer.tsx';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TaskAttemptDataContext } from '@/components/context/taskDetailsContext.ts';
import { Loader } from '@/components/ui/loader.tsx';
import useNormalizedConversation from '@/hooks/useNormalizedConversation';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Hammer } from 'lucide-react';
import DisplayConversationEntry from '../DisplayConversationEntry';

function Conversation() {
  const { attemptData } = useContext(TaskAttemptDataContext);
  const [shouldAutoScrollLogs, setShouldAutoScrollLogs] = useState(true);
  const [conversationUpdateTrigger, setConversationUpdateTrigger] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Callback to trigger auto-scroll when conversation updates
  const handleConversationUpdate = useCallback(() => {
    setConversationUpdateTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (shouldAutoScrollLogs && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [
    attemptData.allLogs,
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

  // Find main and follow-up processes from allLogs
  const mainCodingAgentLog = attemptData.allLogs.find(
    (log) =>
      log.process_type.toLowerCase() === 'codingagent' &&
      log.command === 'executor'
  );
  const followUpLogs = attemptData.allLogs.filter(
    (log) =>
      log.process_type.toLowerCase() === 'codingagent' &&
      log.command === 'followup_executor'
  );

  // Helper to render a process log (hybrid: SSE for running, static for completed)
  const renderProcessLog = (log: typeof mainCodingAgentLog | typeof followUpLogs[number]) => {
    if (!log) return null;
    if (log.status === 'running') {
      // Find the full ExecutionProcess for this id (from runningProcessDetails)
      const runningProcess = attemptData.runningProcessDetails[log.id];
      if (runningProcess) {
        return (
          <NormalizedConversationViewer
            key={log.id}
            executionProcess={runningProcess}
            onConversationUpdate={handleConversationUpdate}
            diffDeletable
          />
        );
      }
      // Fallback: show loading if not found
      return <Loader message="Loading live logs..." size={24} className="py-4" />;
    } else {
      // Static log rendering (as before)
      return (
        <div key={log.id}>
          {log.normalized_conversation.prompt && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <Hammer className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm whitespace-pre-wrap text-foreground">
                  <MarkdownRenderer
                    content={log.normalized_conversation.prompt}
                    className="whitespace-pre-wrap break-words"
                  />
                </div>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {log.normalized_conversation.entries.map((entry, index) => (
              <DisplayConversationEntry
                key={entry.timestamp || index}
                entry={entry}
                index={index}
                diffDeletable
              />
            ))}
          </div>
        </div>
      );
    }
  };

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleLogsScroll}
      className="h-full overflow-y-auto"
    >
      {mainCodingAgentLog || followUpLogs.length > 0 ? (
        <div className="space-y-8">
          {mainCodingAgentLog && renderProcessLog(mainCodingAgentLog)}
          {followUpLogs.map((log) => (
            <div key={log.id}>
              <div className="border-t border-border mb-8"></div>
              {renderProcessLog(log)}
            </div>
          ))}
        </div>
      ) : (
        <Loader
          message={
            <>
              Coding Agent Starting
              <br />
              Initializing conversation...
            </>
          }
          size={48}
          className="py-8"
        />
      )}
    </div>
  );
}

export default Conversation;
