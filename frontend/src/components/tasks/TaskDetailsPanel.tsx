import { useEffect, useRef, useCallback, useState } from 'react';
import { TaskDetailsHeader } from './TaskDetailsHeader';
import { TaskDetailsToolbar } from './TaskDetailsToolbar';
import { NormalizedConversationViewer } from './NormalizedConversationViewer';
import { TaskFollowUpSection } from './TaskFollowUpSection';
import { EditorSelectionDialog } from './EditorSelectionDialog';
import { useTaskDetails } from '@/hooks/useTaskDetails';
import {
  getTaskPanelClasses,
  getBackdropClasses,
} from '@/lib/responsive-config';
import { makeRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import type {
  TaskWithAttemptStatus,
  EditorType,
  Project,
  WorktreeDiff,
  DiffChunkType,
  DiffChunk,
} from 'shared/types';

interface TaskDetailsPanelProps {
  task: TaskWithAttemptStatus | null;
  project: Project | null;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onEditTask?: (task: TaskWithAttemptStatus) => void;
  onDeleteTask?: (taskId: string) => void;
  isDialogOpen?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
}

interface ProcessedLine {
  content: string;
  chunkType: DiffChunkType;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface ProcessedSection {
  type: 'context' | 'change' | 'expanded';
  lines: ProcessedLine[];
  expandKey?: string;
  expandedAbove?: boolean;
  expandedBelow?: boolean;
}

export function TaskDetailsPanel({
  task,
  project,
  projectId,
  isOpen,
  onClose,
  onEditTask,
  onDeleteTask,
  isDialogOpen = false,
}: TaskDetailsPanelProps) {
  const [showEditorDialog, setShowEditorDialog] = useState(false);
  const [shouldAutoScrollLogs, setShouldAutoScrollLogs] = useState(true);
  const [conversationUpdateTrigger, setConversationUpdateTrigger] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const setupScrollRef = useRef<HTMLDivElement>(null);

  // Diff-related state
  const [diff, setDiff] = useState<WorktreeDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(true);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [showDiffs, setShowDiffs] = useState(true);

  // Use the custom hook for all task details logic
  const {
    taskAttempts,
    selectedAttempt,
    attemptData,
    loading,
    selectedExecutor,
    isStopping,
    followUpMessage,
    isSendingFollowUp,
    followUpError,
    isStartingDevServer,
    devServerDetails,
    branches,
    selectedBranch,
    runningDevServer,
    isAttemptRunning,
    canSendFollowUp,
    processedDevServerLogs,
    executionState,
    setFollowUpMessage,
    setFollowUpError,
    setIsHoveringDevServer,
    handleAttemptChange,
    createNewAttempt,
    stopAllExecutions,
    startDevServer,
    stopDevServer,
    openInEditor,
    handleSendFollowUp,
  } = useTaskDetails(task, projectId, isOpen);

  // Use ref to track loading state to prevent dependency cycles
  const diffLoadingRef = useRef(false);

  // Fetch diff when attempt changes
  const fetchDiff = useCallback(async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) {
      setDiff(null);
      setDiffLoading(false);
      return;
    }

    // Prevent multiple concurrent requests
    if (diffLoadingRef.current) {
      return;
    }

    try {
      diffLoadingRef.current = true;
      setDiffLoading(true);
      setDiffError(null);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/diff`
      );

      if (response.ok) {
        const result: ApiResponse<WorktreeDiff> = await response.json();
        if (result.success && result.data) {
          setDiff(result.data);
        } else {
          setDiffError('Failed to load diff');
        }
      } else {
        setDiffError('Failed to load diff');
      }
    } catch (err) {
      setDiffError('Failed to load diff');
    } finally {
      diffLoadingRef.current = false;
      setDiffLoading(false);
    }
  }, [projectId, selectedAttempt?.id, selectedAttempt?.task_id]);

  useEffect(() => {
    if (isOpen) {
      fetchDiff();
    }
  }, [isOpen, fetchDiff]);

  // Refresh diff when coding agent is running and making changes
  useEffect(() => {
    if (!executionState || !isOpen || !selectedAttempt) return;

    const isCodingAgentRunning =
      executionState.execution_state === 'CodingAgentRunning';

    if (isCodingAgentRunning) {
      // Immediately refresh diff when coding agent starts running
      fetchDiff();

      // Then refresh diff every 2 seconds while coding agent is active
      const interval = setInterval(() => {
        fetchDiff();
      }, 2000);

      return () => {
        clearInterval(interval);
      };
    }
  }, [executionState, isOpen, selectedAttempt, fetchDiff]);

  // Refresh diff when coding agent completes or changes state
  useEffect(() => {
    if (!executionState || !isOpen || !selectedAttempt) return;

    const isCodingAgentComplete =
      executionState.execution_state === 'CodingAgentComplete';
    const isCodingAgentFailed =
      executionState.execution_state === 'CodingAgentFailed';
    const isComplete = executionState.execution_state === 'Complete';
    const hasChanges = executionState.has_changes;

    // Fetch diff when coding agent completes, fails, or task is complete and has changes
    if (
      (isCodingAgentComplete || isCodingAgentFailed || isComplete) &&
      hasChanges
    ) {
      fetchDiff();
    }
  }, [
    executionState?.execution_state,
    executionState?.has_changes,
    isOpen,
    selectedAttempt,
    fetchDiff,
  ]);

  // Handle ESC key locally to prevent global navigation
  useEffect(() => {
    if (!isOpen || isDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, isDialogOpen]);

  // Callback to trigger auto-scroll when conversation updates
  const handleConversationUpdate = useCallback(() => {
    setConversationUpdateTrigger((prev) => prev + 1);
  }, []);

  // Auto-scroll to bottom when activities, execution processes, or conversation changes (for logs section)
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

  // Auto-scroll setup script logs to bottom
  useEffect(() => {
    if (setupScrollRef.current) {
      setupScrollRef.current.scrollTop = setupScrollRef.current.scrollHeight;
    }
  }, [attemptData.runningProcessDetails]);

  // Handle scroll events to detect manual scrolling (for logs section)
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

  const handleOpenInEditor = async (editorType?: EditorType) => {
    try {
      await openInEditor(editorType);
    } catch (err) {
      if (!editorType) {
        setShowEditorDialog(true);
      }
    }
  };

  // Diff processing functions
  const getChunkClassName = (chunkType: DiffChunkType) => {
    const baseClass = 'font-mono text-sm whitespace-pre flex w-full';

    switch (chunkType) {
      case 'Insert':
        return `${baseClass} bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100`;
      case 'Delete':
        return `${baseClass} bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100`;
      case 'Equal':
      default:
        return `${baseClass} text-muted-foreground`;
    }
  };

  const getLineNumberClassName = (chunkType: DiffChunkType) => {
    const baseClass =
      'flex-shrink-0 w-12 px-1.5 text-xs border-r select-none min-h-[1.25rem] flex items-center';

    switch (chunkType) {
      case 'Insert':
        return `${baseClass} text-green-800 dark:text-green-200 bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-600`;
      case 'Delete':
        return `${baseClass} text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-600`;
      case 'Equal':
      default:
        return `${baseClass} text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700`;
    }
  };

  const getChunkPrefix = (chunkType: DiffChunkType) => {
    switch (chunkType) {
      case 'Insert':
        return '+';
      case 'Delete':
        return '-';
      case 'Equal':
      default:
        return ' ';
    }
  };

  const processFileChunks = (chunks: DiffChunk[], fileIndex: number) => {
    const CONTEXT_LINES = 3;
    const lines: ProcessedLine[] = [];
    let oldLineNumber = 1;
    let newLineNumber = 1;

    // Convert chunks to lines with line numbers
    chunks.forEach((chunk) => {
      const chunkLines = chunk.content.split('\n');
      chunkLines.forEach((line, index) => {
        if (index < chunkLines.length - 1 || line !== '') {
          const processedLine: ProcessedLine = {
            content: line,
            chunkType: chunk.chunk_type,
          };

          switch (chunk.chunk_type) {
            case 'Equal':
              processedLine.oldLineNumber = oldLineNumber++;
              processedLine.newLineNumber = newLineNumber++;
              break;
            case 'Delete':
              processedLine.oldLineNumber = oldLineNumber++;
              break;
            case 'Insert':
              processedLine.newLineNumber = newLineNumber++;
              break;
          }

          lines.push(processedLine);
        }
      });
    });

    const sections: ProcessedSection[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.chunkType === 'Equal') {
        let nextChangeIndex = i + 1;
        while (
          nextChangeIndex < lines.length &&
          lines[nextChangeIndex].chunkType === 'Equal'
        ) {
          nextChangeIndex++;
        }

        const contextLength = nextChangeIndex - i;
        const hasNextChange = nextChangeIndex < lines.length;
        const hasPrevChange =
          sections.length > 0 &&
          sections[sections.length - 1].type === 'change';

        if (
          contextLength <= CONTEXT_LINES * 2 ||
          (!hasPrevChange && !hasNextChange)
        ) {
          sections.push({
            type: 'context',
            lines: lines.slice(i, nextChangeIndex),
          });
        } else {
          if (hasPrevChange) {
            sections.push({
              type: 'context',
              lines: lines.slice(i, i + CONTEXT_LINES),
            });
            i += CONTEXT_LINES;
          }

          if (hasNextChange) {
            const expandStart = hasPrevChange ? i : i + CONTEXT_LINES;
            const expandEnd = nextChangeIndex - CONTEXT_LINES;

            if (expandEnd > expandStart) {
              const expandKey = `${fileIndex}-${expandStart}-${expandEnd}`;
              const isExpanded = expandedSections.has(expandKey);

              if (isExpanded) {
                sections.push({
                  type: 'expanded',
                  lines: lines.slice(expandStart, expandEnd),
                  expandKey,
                });
              } else {
                sections.push({
                  type: 'context',
                  lines: [],
                  expandKey,
                });
              }
            }

            sections.push({
              type: 'context',
              lines: lines.slice(
                nextChangeIndex - CONTEXT_LINES,
                nextChangeIndex
              ),
            });
          } else if (!hasPrevChange) {
            sections.push({
              type: 'context',
              lines: lines.slice(i, i + CONTEXT_LINES),
            });
          }
        }

        i = nextChangeIndex;
      } else {
        const changeStart = i;
        while (i < lines.length && lines[i].chunkType !== 'Equal') {
          i++;
        }

        sections.push({
          type: 'change',
          lines: lines.slice(changeStart, i),
        });
      }
    }

    return sections;
  };

  const toggleExpandSection = (expandKey: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(expandKey)) {
        newSet.delete(expandKey);
      } else {
        newSet.add(expandKey);
      }
      return newSet;
    });
  };

  const toggleFileCollapse = (filePath: string) => {
    setCollapsedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return newSet;
    });
  };

  const collapseAllFiles = () => {
    if (diff) {
      setCollapsedFiles(new Set(diff.files.map((file) => file.path)));
    }
  };

  const expandAllFiles = () => {
    setCollapsedFiles(new Set());
  };

  // Helper to check if all files with content are collapsed
  const areAllFilesCollapsed = () => {
    return (
      diff && diff.files.length > 0 && collapsedFiles.size === diff.files.length
    );
  };

  const handleDeleteFileClick = (filePath: string) => {
    setFileToDelete(filePath);
  };

  const handleConfirmDelete = async () => {
    if (!fileToDelete || !projectId || !task?.id || !selectedAttempt?.id)
      return;

    try {
      setDeletingFiles((prev) => new Set(prev).add(fileToDelete));
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/delete-file?file_path=${encodeURIComponent(
          fileToDelete
        )}`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        const result: ApiResponse<null> = await response.json();
        if (result.success) {
          fetchDiff();
        } else {
          setDiffError(result.message || 'Failed to delete file');
        }
      } else {
        setDiffError('Failed to delete file');
      }
    } catch (err) {
      setDiffError('Failed to delete file');
    } finally {
      setDeletingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileToDelete);
        return newSet;
      });
      setFileToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setFileToDelete(null);
  };

  // Determine what content to show based on execution state
  const renderMainContent = (): JSX.Element => {
    // Show loading spinner only when we're actually loading data
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
          <p className="text-muted-foreground ml-4">Loading...</p>
        </div>
      );
    }

    // If no attempt is selected, show message
    if (!selectedAttempt) {
      return (
        <div className="flex-1 min-h-0 p-6 overflow-y-auto">
          <div className="text-center py-8 text-muted-foreground">
            <p>No attempt selected</p>
          </div>
        </div>
      );
    }

    // If no execution state, execution hasn't started yet
    if (!executionState) {
      return (
        <div className="flex-1 min-h-0 p-6 overflow-y-auto">
          <div className="text-center py-8 text-muted-foreground">
            <p>Task execution not started yet</p>
          </div>
        </div>
      );
    }

    const isSetupRunning = executionState.execution_state === 'SetupRunning';
    const isSetupComplete = executionState.execution_state === 'SetupComplete';
    const isSetupFailed = executionState.execution_state === 'SetupFailed';
    const isCodingAgentRunning =
      executionState.execution_state === 'CodingAgentRunning';
    const isCodingAgentComplete =
      executionState.execution_state === 'CodingAgentComplete';
    const isCodingAgentFailed =
      executionState.execution_state === 'CodingAgentFailed';
    const isComplete = executionState.execution_state === 'Complete';
    const hasChanges = executionState.has_changes;

    // When setup script is running, show setup execution stdio
    if (isSetupRunning) {
      // Find the setup script process in runningProcessDetails first, then fallback to processes
      const setupProcess = executionState.setup_process_id
        ? attemptData.runningProcessDetails[executionState.setup_process_id]
        : Object.values(attemptData.runningProcessDetails).find(
            (process) => process.process_type === 'setupscript'
          );

      return (
        <div
          className="flex-1 min-h-0 p-6 overflow-y-auto"
          ref={setupScrollRef}
        >
          <div className="mb-4">
            <p className="text-lg font-semibold mb-2">Setup Script Running</p>
            <p className="text-muted-foreground mb-4">
              Preparing the environment for the coding agent...
            </p>
          </div>

          {setupProcess && (
            <div className="font-mono text-sm whitespace-pre-wrap text-muted-foreground">
              {(() => {
                const stdout = setupProcess.stdout || '';
                const stderr = setupProcess.stderr || '';
                const combined = [stdout, stderr].filter(Boolean).join('\n');
                return combined || 'Waiting for setup script output...';
              })()}
            </div>
          )}
        </div>
      );
    }

    // When setup failed, show error message and conversation
    if (isSetupFailed) {
      const setupProcess = executionState.setup_process_id
        ? attemptData.runningProcessDetails[executionState.setup_process_id]
        : Object.values(attemptData.runningProcessDetails).find(
            (process) => process.process_type === 'setupscript'
          );

      return (
        <div className="flex-1 min-h-0 p-6 overflow-y-auto">
          <div className="mb-4">
            <p className="text-lg font-semibold mb-2 text-destructive">
              Setup Script Failed
            </p>
            <p className="text-muted-foreground mb-4">
              The setup script encountered an error. Error details below:
            </p>
          </div>

          {setupProcess && (
            <NormalizedConversationViewer
              executionProcess={setupProcess}
              projectId={projectId}
              onConversationUpdate={handleConversationUpdate}
            />
          )}
        </div>
      );
    }

    // When coding agent failed, show error message and conversation
    if (isCodingAgentFailed) {
      const codingAgentProcess = executionState.coding_agent_process_id
        ? attemptData.runningProcessDetails[
            executionState.coding_agent_process_id
          ]
        : Object.values(attemptData.runningProcessDetails).find(
            (process) => process.process_type === 'codingagent'
          );

      return (
        <div className="flex-1 min-h-0 p-6 overflow-y-auto">
          <div className="mb-4">
            <p className="text-lg font-semibold mb-2 text-destructive">
              Coding Agent Failed
            </p>
            <p className="text-muted-foreground mb-4">
              The coding agent encountered an error. Error details below:
            </p>
          </div>

          {codingAgentProcess && (
            <NormalizedConversationViewer
              executionProcess={codingAgentProcess}
              projectId={projectId}
              onConversationUpdate={handleConversationUpdate}
            />
          )}
        </div>
      );
    }

    // When setup is complete but coding agent hasn't started, show waiting state
    if (
      isSetupComplete &&
      !isCodingAgentRunning &&
      !isCodingAgentComplete &&
      !isCodingAgentFailed &&
      !hasChanges
    ) {
      return (
        <div className="flex-1 min-h-0 p-6 overflow-y-auto">
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-lg font-semibold mb-2">Setup Complete</p>
            <p>Waiting for coding agent to start...</p>
          </div>
        </div>
      );
    }

    // When task is complete, show completion message
    if (isComplete) {
      return (
        <div className="flex-1 min-h-0 p-6 overflow-y-auto">
          <div className="text-center py-8 text-green-600">
            <p className="text-lg font-semibold mb-2">Task Complete</p>
            <p className="text-muted-foreground">
              The task has been completed successfully.
            </p>
          </div>
        </div>
      );
    }

    // When coding agent is running or complete but no changes yet, show just agent conversation (full height)
    if ((isCodingAgentRunning || isCodingAgentComplete) && !hasChanges) {
      return (
        <div className="flex-1 min-h-0 border-t bg-muted/30">
          <div
            ref={scrollContainerRef}
            onScroll={handleLogsScroll}
            className="h-full overflow-y-auto p-6"
          >
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : (
              (() => {
                // Find main coding agent process (command: "executor")
                let mainCodingAgentProcess = Object.values(
                  attemptData.runningProcessDetails
                ).find(
                  (process) =>
                    process.process_type === 'codingagent' &&
                    process.command === 'executor'
                );

                if (!mainCodingAgentProcess) {
                  const mainCodingAgentSummary = attemptData.processes.find(
                    (process) =>
                      process.process_type === 'codingagent' &&
                      process.command === 'executor'
                  );

                  if (mainCodingAgentSummary) {
                    mainCodingAgentProcess = Object.values(
                      attemptData.runningProcessDetails
                    ).find(
                      (process) => process.id === mainCodingAgentSummary.id
                    );

                    if (!mainCodingAgentProcess) {
                      mainCodingAgentProcess = {
                        ...mainCodingAgentSummary,
                        stdout: null,
                        stderr: null,
                      } as any;
                    }
                  }
                }

                // Find follow up executor processes (command: "followup_executor")
                const followUpProcesses = attemptData.processes
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

                if (mainCodingAgentProcess || followUpProcesses.length > 0) {
                  return (
                    <div className="space-y-8">
                      {mainCodingAgentProcess && (
                        <div>
                          <NormalizedConversationViewer
                            executionProcess={mainCodingAgentProcess}
                            projectId={projectId}
                            onConversationUpdate={handleConversationUpdate}
                          />
                        </div>
                      )}
                      {followUpProcesses.map((followUpProcess) => (
                        <div key={followUpProcess.id}>
                          <div className="border-t border-border mb-8"></div>
                          <NormalizedConversationViewer
                            executionProcess={followUpProcess}
                            projectId={projectId}
                            onConversationUpdate={handleConversationUpdate}
                          />
                        </div>
                      ))}
                    </div>
                  );
                }

                return (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-lg font-semibold mb-2">
                      Coding Agent Starting
                    </p>
                    <p>Initializing conversation...</p>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      );
    }

    // When changes appear, show them (2/3) and conversation (1/3) in split view
    if (hasChanges) {
      return (
        <>
          {/* Top area - Code Changes (responsive height) */}
          {showDiffs && (
            <div
              className={`${areAllFilesCollapsed() ? 'h-auto' : 'max-h-[66vh]'} min-h-0 ${areAllFilesCollapsed() ? 'p-2' : 'p-4'} overflow-y-auto`}
            >
              {diffLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
                  <p className="text-muted-foreground ml-4">
                    Loading changes...
                  </p>
                </div>
              ) : diffError ? (
                <div className="text-center py-8 text-destructive">
                  <p>{diffError}</p>
                </div>
              ) : !diff || diff.files.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No changes detected</p>
                  <p className="text-sm">
                    The worktree is identical to the base commit
                  </p>
                </div>
              ) : (
                <div
                  className={`${areAllFilesCollapsed() ? 'space-y-1' : 'space-y-3'}`}
                >
                  <div
                    className={`flex items-center justify-between ${areAllFilesCollapsed() ? 'mb-1' : 'mb-3'}`}
                  >
                    <div className="text-sm text-muted-foreground">
                      {diff.files.length} file
                      {diff.files.length !== 1 ? 's' : ''} changed
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDiffs(false)}
                        className="h-7 text-xs"
                      >
                        <EyeOff className="h-3 w-3 mr-1" />
                        Hide Diffs
                      </Button>
                      {diff.files.length > 1 && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={expandAllFiles}
                            className="h-7 text-xs"
                            disabled={collapsedFiles.size === 0}
                          >
                            Expand All
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={collapseAllFiles}
                            className="h-7 text-xs"
                            disabled={collapsedFiles.size === diff.files.length}
                          >
                            Collapse All
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {diff.files.map((file, fileIndex) => (
                    <div
                      key={fileIndex}
                      className={`border rounded-lg overflow-hidden ${collapsedFiles.has(file.path) ? 'border-muted' : ''}`}
                    >
                      <div
                        className={`bg-muted px-3 py-1.5 flex items-center justify-between ${!collapsedFiles.has(file.path) ? 'border-b' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFileCollapse(file.path)}
                            className="h-6 w-6 p-0 hover:bg-muted-foreground/10"
                            title={
                              collapsedFiles.has(file.path)
                                ? 'Expand diff'
                                : 'Collapse diff'
                            }
                          >
                            {collapsedFiles.has(file.path) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronUp className="h-4 w-4" />
                            )}
                          </Button>
                          <p className="text-sm font-medium text-muted-foreground font-mono">
                            {file.path}
                          </p>
                          {collapsedFiles.has(file.path) && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                              <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-1.5 py-0.5 rounded">
                                +
                                {file.chunks
                                  .filter((c) => c.chunk_type === 'Insert')
                                  .reduce(
                                    (acc, c) =>
                                      acc + c.content.split('\n').length - 1,
                                    0
                                  )}
                              </span>
                              <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-1.5 py-0.5 rounded">
                                -
                                {file.chunks
                                  .filter((c) => c.chunk_type === 'Delete')
                                  .reduce(
                                    (acc, c) =>
                                      acc + c.content.split('\n').length - 1,
                                    0
                                  )}
                              </span>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteFileClick(file.path)}
                          disabled={deletingFiles.has(file.path)}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 h-8 px-3 gap-1"
                          title={`Delete ${file.path}`}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="text-xs">
                            {deletingFiles.has(file.path)
                              ? 'Deleting...'
                              : 'Delete File'}
                          </span>
                        </Button>
                      </div>
                      {!collapsedFiles.has(file.path) && (
                        <div className="overflow-x-auto">
                          <div className="inline-block min-w-full">
                            {processFileChunks(file.chunks, fileIndex).map(
                              (section, sectionIndex) => {
                                if (
                                  section.type === 'context' &&
                                  section.lines.length === 0 &&
                                  section.expandKey
                                ) {
                                  const lineCount =
                                    parseInt(section.expandKey.split('-')[2]) -
                                    parseInt(section.expandKey.split('-')[1]);
                                  return (
                                    <div
                                      key={`expand-${section.expandKey}`}
                                      className="w-full"
                                    >
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          toggleExpandSection(
                                            section.expandKey!
                                          )
                                        }
                                        className="w-full h-6 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 border-t border-b border-gray-200 dark:border-gray-700 rounded-none justify-start"
                                      >
                                        <ChevronDown className="h-3 w-3 mr-1" />
                                        Show {lineCount} more lines
                                      </Button>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={`section-${sectionIndex}`}>
                                    {section.type === 'expanded' &&
                                      section.expandKey && (
                                        <div className="w-full">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              toggleExpandSection(
                                                section.expandKey!
                                              )
                                            }
                                            className="w-full h-6 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 border-t border-b border-gray-200 dark:border-gray-700 rounded-none justify-start"
                                          >
                                            <ChevronUp className="h-3 w-3 mr-1" />
                                            Hide expanded lines
                                          </Button>
                                        </div>
                                      )}
                                    {section.lines.map((line, lineIndex) => (
                                      <div
                                        key={`${sectionIndex}-${lineIndex}`}
                                        className={getChunkClassName(
                                          line.chunkType
                                        )}
                                        style={{ minWidth: 'max-content' }}
                                      >
                                        <div
                                          className={getLineNumberClassName(
                                            line.chunkType
                                          )}
                                        >
                                          <span className="inline-block w-5 text-right">
                                            {line.oldLineNumber || ''}
                                          </span>
                                          <span className="inline-block w-5 text-right ml-1">
                                            {line.newLineNumber || ''}
                                          </span>
                                        </div>
                                        <div className="flex-1 px-2 min-h-[1.25rem] flex items-center">
                                          <span className="inline-block w-4">
                                            {getChunkPrefix(line.chunkType)}
                                          </span>
                                          <span>{line.content}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Show Diffs button when diffs are hidden */}
          {!showDiffs && hasChanges && (
            <div className="p-2 border-b bg-muted/50">
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDiffs(true)}
                  className="h-7 text-xs"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Show Diffs
                </Button>
              </div>
            </div>
          )}

          {/* Bottom area - Agent Logs (responsive height) */}
          <div
            className={`${!showDiffs || areAllFilesCollapsed() ? 'flex-1' : 'flex-1'} min-h-0 ${showDiffs ? 'border-t' : ''} bg-muted/30`}
          >
            <div
              ref={scrollContainerRef}
              onScroll={handleLogsScroll}
              className="h-full overflow-y-auto p-4"
            >
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              ) : (
                (() => {
                  // Find main coding agent process (command: "executor")
                  let mainCodingAgentProcess = Object.values(
                    attemptData.runningProcessDetails
                  ).find(
                    (process) =>
                      process.process_type === 'codingagent' &&
                      process.command === 'executor'
                  );

                  if (!mainCodingAgentProcess) {
                    const mainCodingAgentSummary = attemptData.processes.find(
                      (process) =>
                        process.process_type === 'codingagent' &&
                        process.command === 'executor'
                    );

                    if (mainCodingAgentSummary) {
                      mainCodingAgentProcess = Object.values(
                        attemptData.runningProcessDetails
                      ).find(
                        (process) => process.id === mainCodingAgentSummary.id
                      );

                      if (!mainCodingAgentProcess) {
                        mainCodingAgentProcess = {
                          ...mainCodingAgentSummary,
                          stdout: null,
                          stderr: null,
                        } as any;
                      }
                    }
                  }

                  // Find follow up executor processes (command: "followup_executor")
                  const followUpProcesses = attemptData.processes
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

                  if (mainCodingAgentProcess || followUpProcesses.length > 0) {
                    return (
                      <div className="space-y-8">
                        {mainCodingAgentProcess && (
                          <div>
                            <NormalizedConversationViewer
                              executionProcess={mainCodingAgentProcess}
                              projectId={projectId}
                              onConversationUpdate={handleConversationUpdate}
                            />
                          </div>
                        )}
                        {followUpProcesses.map((followUpProcess) => (
                          <div key={followUpProcess.id}>
                            <div className="border-t border-border mb-8"></div>
                            <NormalizedConversationViewer
                              executionProcess={followUpProcess}
                              projectId={projectId}
                              onConversationUpdate={handleConversationUpdate}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  }

                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No coding agent conversation to display</p>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </>
      );
    }

    // Default case - unexpected state
    return (
      <div className="flex-1 min-h-0 p-6 overflow-y-auto">
        <div className="text-center py-8 text-muted-foreground">
          <p>Unknown execution state</p>
        </div>
      </div>
    );
  };

  if (!task) return null;

  return (
    <>
      {isOpen && (
        <>
          {/* Backdrop - only on smaller screens (overlay mode) */}
          <div className={getBackdropClasses()} onClick={onClose} />

          {/* Panel */}
          <div className={getTaskPanelClasses()}>
            <div className="flex flex-col h-full">
              {/* Header */}
              <TaskDetailsHeader
                task={task}
                onClose={onClose}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
              />

              {/* Toolbar */}
              <TaskDetailsToolbar
                task={task}
                project={project}
                projectId={projectId}
                selectedAttempt={selectedAttempt}
                taskAttempts={taskAttempts}
                isAttemptRunning={isAttemptRunning}
                isStopping={isStopping}
                selectedExecutor={selectedExecutor}
                runningDevServer={runningDevServer}
                isStartingDevServer={isStartingDevServer}
                devServerDetails={devServerDetails}
                processedDevServerLogs={processedDevServerLogs}
                branches={branches}
                selectedBranch={selectedBranch}
                onAttemptChange={handleAttemptChange}
                onCreateNewAttempt={createNewAttempt}
                onStopAllExecutions={stopAllExecutions}
                onStartDevServer={startDevServer}
                onStopDevServer={stopDevServer}
                onOpenInEditor={handleOpenInEditor}
                onSetIsHoveringDevServer={setIsHoveringDevServer}
              />

              {/* Main Content - Dynamic based on execution state */}
              <div className="flex-1 flex flex-col min-h-0">
                {renderMainContent()}
              </div>

              {/* Footer - Follow-up section */}
              {selectedAttempt && (
                <TaskFollowUpSection
                  followUpMessage={followUpMessage}
                  setFollowUpMessage={setFollowUpMessage}
                  isSendingFollowUp={isSendingFollowUp}
                  followUpError={followUpError}
                  setFollowUpError={setFollowUpError}
                  canSendFollowUp={canSendFollowUp}
                  projectId={projectId}
                  onSendFollowUp={handleSendFollowUp}
                />
              )}
            </div>
          </div>

          {/* Editor Selection Dialog */}
          <EditorSelectionDialog
            isOpen={showEditorDialog}
            onClose={() => setShowEditorDialog(false)}
            onSelectEditor={handleOpenInEditor}
          />

          {/* Delete File Confirmation Dialog */}
          <Dialog
            open={!!fileToDelete}
            onOpenChange={() => handleCancelDelete()}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete File</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete the file{' '}
                  <span className="font-mono font-medium">
                    "{fileToDelete}"
                  </span>
                  ?
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-800">
                    <strong>Warning:</strong> This action will permanently
                    remove the entire file from the worktree. This cannot be
                    undone.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCancelDelete}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmDelete}
                  disabled={deletingFiles.has(fileToDelete || '')}
                >
                  {deletingFiles.has(fileToDelete || '')
                    ? 'Deleting...'
                    : 'Delete File'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}
