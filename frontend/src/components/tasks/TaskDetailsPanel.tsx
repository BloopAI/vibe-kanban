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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Diff-related state
  const [diff, setDiff] = useState<WorktreeDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(true);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

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

  // Fetch diff when attempt changes
  const fetchDiff = useCallback(async () => {
    if (!projectId || !task?.id || !selectedAttempt?.id) {
      setDiff(null);
      setDiffLoading(false);
      return;
    }

    try {
      setDiffLoading(true);
      setDiffError(null);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${task.id}/attempts/${selectedAttempt.id}/diff`
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
      setDiffLoading(false);
    }
  }, [projectId, task?.id, selectedAttempt?.id]);

  useEffect(() => {
    if (isOpen) {
      fetchDiff();
    }
  }, [isOpen, fetchDiff]);

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

  // Auto-scroll to bottom when activities or execution processes change (for logs section)
  useEffect(() => {
    if (shouldAutoScrollLogs && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [attemptData.activities, attemptData.processes, shouldAutoScrollLogs]);

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
    const baseClass = 'font-mono text-sm whitespace-nowrap flex w-full';

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
    const baseClass = 'flex-shrink-0 w-16 px-2 text-xs border-r select-none min-h-[1.75rem] flex items-center';

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

  const handleDeleteFileClick = (filePath: string) => {
    setFileToDelete(filePath);
  };

  const handleConfirmDelete = async () => {
    if (!fileToDelete || !projectId || !task?.id || !selectedAttempt?.id) return;

    try {
      setDeletingFiles((prev) => new Set(prev).add(fileToDelete));
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${task.id}/attempts/${selectedAttempt.id}/delete-file?file_path=${encodeURIComponent(
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

              {/* Main Content - Split into two sections */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Top 2/3 - Code Changes */}
                <div className="flex-1 min-h-0 p-6 overflow-y-auto">
                  {diffLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
                      <p className="text-muted-foreground ml-4">Loading changes...</p>
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
                    <div className="space-y-6">
                      {diff.files.map((file, fileIndex) => (
                        <div
                          key={fileIndex}
                          className="border rounded-lg overflow-hidden"
                        >
                          <div className="bg-muted px-3 py-2 border-b flex items-center justify-between">
                            <p className="text-sm font-medium text-muted-foreground font-mono">
                              {file.path}
                            </p>
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
                                      <div key={`expand-${section.expandKey}`} className="w-full">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            toggleExpandSection(section.expandKey!)
                                          }
                                          className="w-full h-8 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 border-t border-b border-gray-200 dark:border-gray-700 rounded-none"
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
                                                toggleExpandSection(section.expandKey!)
                                              }
                                              className="w-full h-8 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 border-t border-b border-gray-200 dark:border-gray-700 rounded-none"
                                            >
                                              <ChevronUp className="h-3 w-3 mr-1" />
                                              Hide expanded lines
                                            </Button>
                                          </div>
                                        )}
                                      {section.lines.map((line, lineIndex) => (
                                        <div
                                          key={`${sectionIndex}-${lineIndex}`}
                                          className={getChunkClassName(line.chunkType)}
                                          style={{ minWidth: 'max-content' }}
                                        >
                                          <div className={getLineNumberClassName(line.chunkType)}>
                                            <span className="inline-block w-6 text-right">
                                              {line.oldLineNumber || ''}
                                            </span>
                                            <span className="inline-block w-6 text-right ml-1">
                                              {line.newLineNumber || ''}
                                            </span>
                                          </div>
                                          <div className="flex-1 px-3 min-h-[1.75rem] flex items-center">
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
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom 1/3 - Agent Logs */}
                <div className="h-1/3 min-h-0 border-t bg-muted/30">
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
                    ) : (() => {
                        // First, look for a running coding agent process
                        let codingAgentProcess = Object.values(attemptData.runningProcessDetails).find(
                          process => process.process_type === 'codingagent'
                        );
                        
                        // If no running process, look for any coding agent process in the summaries
                        if (!codingAgentProcess) {
                          const codingAgentSummary = attemptData.processes.find(
                            process => process.process_type === 'codingagent'
                          );
                          
                          if (codingAgentSummary) {
                            // Try to find it in running processes by ID (it might be there but completed)
                            codingAgentProcess = Object.values(attemptData.runningProcessDetails).find(
                              process => process.id === codingAgentSummary.id
                            );
                            
                            // If still not found, create a minimal ExecutionProcess from the summary
                            if (!codingAgentProcess) {
                              codingAgentProcess = {
                                ...codingAgentSummary,
                                stdout: null,
                                stderr: null,
                              } as any; // Cast since we're missing some fields but NormalizedConversationViewer only needs the ID
                            }
                          }
                        }
                        
                        if (codingAgentProcess) {
                          return (
                            <NormalizedConversationViewer
                              executionProcess={codingAgentProcess}
                              projectId={projectId}
                            />
                          );
                        }
                        
                        return (
                          <div className="text-center py-8 text-muted-foreground">
                            <p>No coding agent conversation to display</p>
                          </div>
                        );
                      })()}
                  </div>
                </div>
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
          <Dialog open={!!fileToDelete} onOpenChange={() => handleCancelDelete()}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete File</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete the file{' '}
                  <span className="font-mono font-medium">"{fileToDelete}"</span>?
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-800">
                    <strong>Warning:</strong> This action will permanently remove
                    the entire file from the worktree. This cannot be undone.
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
