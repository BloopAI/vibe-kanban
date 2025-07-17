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
import { Button } from '@/components/ui/button';

function Conversation() {
  const { attemptData } = useContext(TaskAttemptDataContext);
  const [shouldAutoScrollLogs, setShouldAutoScrollLogs] = useState(true);
  const [conversationUpdateTrigger, setConversationUpdateTrigger] = useState(0);
  const [visibleCount, setVisibleCount] = useState(100);

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

  // Combine all logs in order (main first, then follow-ups)
  const allProcessLogs = ([mainCodingAgentLog, ...followUpLogs].filter(Boolean) as Array<NonNullable<typeof mainCodingAgentLog>>);

  // Flatten all entries, keeping process info for each entry
  const allEntries = useMemo(() => {
    const entries: Array<{
      entry: any;
      processId: string;
      processPrompt?: string;
      processStatus: string;
      processIsRunning: boolean;
      process: any;
      isFirstInProcess: boolean;
      processIndex: number;
      entryIndex: number;
    }> = [];
    allProcessLogs.forEach((log, processIndex) => {
      if (!log) return;
      if (log.status === 'running') return; // Skip static entries for running processes
      const processId = String(log.id); // Ensure string
      const processPrompt = log.normalized_conversation.prompt || undefined; // Ensure undefined, not null
      const entriesArr = log.normalized_conversation.entries || [];
      entriesArr.forEach((entry, entryIndex) => {
        entries.push({
          entry,
          processId,
          processPrompt,
          processStatus: log.status,
          processIsRunning: false, // Only completed processes here
          process: log,
          isFirstInProcess: entryIndex === 0,
          processIndex,
          entryIndex,
        });
      });
    });
    // Sort by timestamp (entries without timestamp go last)
    entries.sort((a, b) => {
      if (a.entry.timestamp && b.entry.timestamp) {
        return a.entry.timestamp.localeCompare(b.entry.timestamp);
      }
      if (a.entry.timestamp) return -1;
      if (b.entry.timestamp) return 1;
      return 0;
    });
    return entries;
  }, [allProcessLogs, attemptData.runningProcessDetails]);

  // Identify running processes (main + follow-ups)
  const runningProcessLogs = allProcessLogs.filter(log => log.status === 'running');

  // Paginate: show only the last visibleCount entries
  const visibleEntries: typeof allEntries = allEntries.slice(-visibleCount);

  // Find the first entry for each process in the visible window
  const processFirstEntryMap = new Map<string, number>();
  visibleEntries.forEach((item, idx) => {
    if (!processFirstEntryMap.has(item.processId)) {
      processFirstEntryMap.set(item.processId, idx);
    }
  });

  // Helper to render a process log (hybrid: SSE for running, static for completed)
  const renderEntry = (item: typeof allEntries[number], idx: number) => {
    // Only show the prompt if this is the very first entry of the process
    const showPrompt = item.isFirstInProcess && item.processPrompt;
    // For running processes, render the live viewer below the static entries
    if (item.processIsRunning && idx === visibleEntries.length - 1) {
      // Only render the live viewer for the last entry of a running process
      const runningProcess = attemptData.runningProcessDetails[item.processId];
      if (runningProcess) {
        return (
          <div key={item.entry.timestamp || idx}>
            {showPrompt && (
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <Hammer className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm whitespace-pre-wrap text-foreground">
                    <MarkdownRenderer
                      content={item.processPrompt || ''}
                      className="whitespace-pre-wrap break-words"
                    />
                  </div>
                </div>
              </div>
            )}
            <NormalizedConversationViewer
              executionProcess={runningProcess}
              onConversationUpdate={handleConversationUpdate}
              diffDeletable
            />
          </div>
        );
      }
      // Fallback: show loading if not found
      return <Loader message="Loading live logs..." size={24} className="py-4" />;
    } else {
      return (
        <div key={item.entry.timestamp || idx}>
          {showPrompt && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <Hammer className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm whitespace-pre-wrap text-foreground">
                  <MarkdownRenderer
                    content={item.processPrompt || ''}
                    className="whitespace-pre-wrap break-words"
                  />
                </div>
              </div>
            </div>
          )}
          <DisplayConversationEntry
            entry={item.entry}
            index={idx}
            diffDeletable
          />
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
      {visibleCount < allEntries.length && (
        <div className="flex justify-center mb-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setVisibleCount(c => Math.min(c + 100, allEntries.length))}
          >
            Load previous logs
          </Button>
        </div>
      )}
      {visibleEntries.length > 0 && (
        <div className="space-y-2">
          {visibleEntries.map(renderEntry)}
        </div>
      )}
      {/* Render live viewers for running processes (after paginated list) */}
      {runningProcessLogs.map((log, i) => {
        const runningProcess = attemptData.runningProcessDetails[String(log.id)];
        if (!runningProcess) return null;
        // Show prompt only if this is the first entry in the process (i.e., no completed entries for this process)
        const showPrompt = log.normalized_conversation.prompt &&
          (!allEntries.some(e => e.processId === String(log.id)));
        return (
          <div key={String(log.id)} className={i > 0 ? 'mt-8' : ''}>
            {showPrompt && (
              <div className="flex items-start gap-3 mb-2">
                <div className="flex-shrink-0 mt-1">
                  <Hammer className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm whitespace-pre-wrap text-foreground">
                    <MarkdownRenderer
                      content={log.normalized_conversation.prompt || ''}
                      className="whitespace-pre-wrap break-words"
                    />
                  </div>
                </div>
              </div>
            )}
            <NormalizedConversationViewer
              executionProcess={runningProcess}
              onConversationUpdate={handleConversationUpdate}
              diffDeletable
            />
          </div>
        );
      })}
      {/* If nothing to show at all, show loader */}
      {visibleEntries.length === 0 && runningProcessLogs.length === 0 && (
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
