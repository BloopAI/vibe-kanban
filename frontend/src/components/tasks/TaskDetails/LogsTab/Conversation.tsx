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
import { useTaskPlan } from '@/components/context/TaskPlanContext.ts';
import { Loader } from '@/components/ui/loader.tsx';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import Prompt from './Prompt';
import ConversationEntry from './ConversationEntry';
import { ConversationEntryDisplayType } from '@/lib/types';

function Conversation() {
  const { attemptData, isAttemptRunning } = useContext(TaskAttemptDataContext);
  const { isPlanningMode, latestProcessHasNoPlan } = useTaskPlan();
  const [shouldAutoScrollLogs, setShouldAutoScrollLogs] = useState(true);
  const [conversationUpdateTrigger, setConversationUpdateTrigger] = useState(0);
  const [visibleCount, setVisibleCount] = useState(100);
  const [visibleRunningEntriesCount, setVisibleRunningEntriesCount] =
    useState(0);

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
  }, [attemptData.allLogs, conversationUpdateTrigger, shouldAutoScrollLogs]);

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
  const mainCodingAgentLog = useMemo(
    () =>
      attemptData.allLogs.find(
        (log) =>
          log.process_type.toLowerCase() === 'codingagent' &&
          log.command === 'executor'
      ),
    [attemptData.allLogs]
  );
  const followUpLogs = useMemo(
    () =>
      attemptData.allLogs.filter(
        (log) =>
          log.process_type.toLowerCase() === 'codingagent' &&
          log.command === 'followup_executor'
      ),
    [attemptData.allLogs]
  );

  // Combine all logs in order (main first, then follow-ups)
  const allProcessLogs = useMemo(
    () =>
      [mainCodingAgentLog, ...followUpLogs].filter(Boolean) as Array<
        NonNullable<typeof mainCodingAgentLog>
      >,
    [mainCodingAgentLog, followUpLogs]
  );

  // Flatten all entries, keeping process info for each entry
  const allEntries = useMemo(() => {
    const entries: Array<ConversationEntryDisplayType> = [];
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
  }, [allProcessLogs]);

  // Identify running processes (main + follow-ups)
  const runningProcessLogs = useMemo(
    () => allProcessLogs.filter((log) => log.status === 'running'),
    [allProcessLogs]
  );

  // Paginate: show only the last visibleCount entries
  const visibleEntries = useMemo(
    () => allEntries.slice(-(visibleCount - visibleRunningEntriesCount)),
    [allEntries, visibleCount, visibleRunningEntriesCount]
  );

  const renderedVisibleEntries = useMemo(
    () =>
      visibleEntries.map((entry, index) => (
        <ConversationEntry
          key={entry.entry.timestamp || index}
          idx={index}
          item={entry}
          handleConversationUpdate={handleConversationUpdate}
          visibleEntriesLength={visibleEntries.length}
          runningProcessDetails={attemptData.runningProcessDetails}
        />
      )),
    [
      visibleEntries,
      handleConversationUpdate,
      attemptData.runningProcessDetails,
    ]
  );

  const renderedRunningProcessLogs = useMemo(() => {
    return runningProcessLogs.map((log, i) => {
      const runningProcess = attemptData.runningProcessDetails[String(log.id)];
      if (!runningProcess) return null;
      // Show prompt only if this is the first entry in the process (i.e., no completed entries for this process)
      const showPrompt =
        log.normalized_conversation.prompt &&
        !allEntries.some((e) => e.processId === String(log.id));
      return (
        <div key={String(log.id)} className={i > 0 ? 'mt-8' : ''}>
          {showPrompt && (
            <Prompt prompt={log.normalized_conversation.prompt || ''} />
          )}
          <NormalizedConversationViewer
            executionProcess={runningProcess}
            onConversationUpdate={handleConversationUpdate}
            diffDeletable
            visibleEntriesNum={visibleCount}
            onDisplayEntriesChange={setVisibleRunningEntriesCount}
          />
        </div>
      );
    });
  }, [
    runningProcessLogs,
    attemptData.runningProcessDetails,
    handleConversationUpdate,
    allEntries,
    visibleCount,
  ]);

  // Check if we should show the status banner - only if the most recent process failed/stopped
  const getMostRecentProcess = () => {
    if (followUpLogs.length > 0) {
      // Sort by creation time or use last in array as most recent
      return followUpLogs[followUpLogs.length - 1];
    }
    return mainCodingAgentLog;
  };

  const mostRecentProcess = getMostRecentProcess();
  const showStatusBanner =
    mostRecentProcess &&
    (mostRecentProcess.status === 'failed' ||
      mostRecentProcess.status === 'killed');

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleLogsScroll}
      className="h-full overflow-y-auto"
    >
      {visibleCount - visibleRunningEntriesCount < allEntries.length && (
        <div className="flex justify-center mb-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setVisibleCount((c) => c + 100)}
          >
            Load previous logs
          </Button>
        </div>
      )}
      {visibleEntries.length > 0 && (
        <div className="space-y-2">{renderedVisibleEntries}</div>
      )}
      {/* Render live viewers for running processes (after paginated list) */}
      {renderedRunningProcessLogs}
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

      {/* Status banner for failed/stopped states - shown at bottom */}
      {showStatusBanner && mostRecentProcess && (
        <div className="mt-4 p-4 rounded-lg border">
          <p
            className={`text-lg font-semibold mb-2 ${
              mostRecentProcess.status === 'failed'
                ? 'text-destructive'
                : 'text-orange-600'
            }`}
          >
            {mostRecentProcess.status === 'failed'
              ? 'Coding Agent Failed'
              : 'Coding Agent Stopped'}
          </p>
          <p className="text-muted-foreground">
            {mostRecentProcess.status === 'failed'
              ? 'The coding agent encountered an error.'
              : 'The coding agent was stopped.'}
          </p>
        </div>
      )}

      {/* Warning banner for planning mode without plan */}
      {isPlanningMode && latestProcessHasNoPlan && !isAttemptRunning && (
        <div className="mt-4 p-4 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            <p className="text-lg font-semibold text-orange-800 dark:text-orange-300">
              No Plan Generated
            </p>
          </div>
          <p className="text-orange-700 dark:text-orange-400">
            The last execution attempt did not produce a plan. Task creation is
            disabled until a plan is available. Try providing more specific
            instructions or check the conversation for any errors.
          </p>
        </div>
      )}
    </div>
  );
}

export default Conversation;
