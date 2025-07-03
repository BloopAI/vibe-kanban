import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  GitBranch,
  Trash2,
  Eye,
  EyeOff,
  GitPullRequest,
} from 'lucide-react';
import { makeRequest } from '@/lib/api';
import type {
  WorktreeDiff,
  DiffChunkType,
  DiffChunk,
  BranchStatus,
} from 'shared/types';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
}

export function TaskAttemptComparePage() {
  const { projectId, taskId, attemptId } = useParams<{
    projectId: string;
    taskId: string;
    attemptId: string;
  }>();
  const navigate = useNavigate();

  const [diff, setDiff] = useState<WorktreeDiff | null>(null);
  const [branchStatus, setBranchStatus] = useState<BranchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchStatusLoading, setBranchStatusLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [rebaseSuccess, setRebaseSuccess] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );
  const [showAllUnchanged, setShowAllUnchanged] = useState(false);
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [showUncommittedWarning, setShowUncommittedWarning] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [showCreatePRDialog, setShowCreatePRDialog] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prBaseBranch, setPrBaseBranch] = useState('main');
  const [taskDetails, setTaskDetails] = useState<{
    title: string;
    description: string | null;
  } | null>(null);

  // Define callbacks first
  const fetchTaskDetails = useCallback(async () => {
    if (!projectId || !taskId) return;

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${taskId}`
      );
      if (response.ok) {
        const result: ApiResponse<any> = await response.json();
        if (result.success && result.data) {
          setTaskDetails({
            title: result.data.title,
            description: result.data.description,
          });
        }
      }
    } catch (err) {
      // Silently fail - not critical for the main functionality
    }
  }, [projectId, taskId]);

  const fetchDiff = useCallback(async () => {
    if (!projectId || !taskId || !attemptId) return;

    try {
      setLoading(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/diff`
      );

      if (response.ok) {
        const result: ApiResponse<WorktreeDiff> = await response.json();
        if (result.success && result.data) {
          setDiff(result.data);
        } else {
          setError('Failed to load diff');
        }
      } else {
        setError('Failed to load diff');
      }
    } catch (err) {
      setError('Failed to load diff');
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId, attemptId]);

  const fetchBranchStatus = useCallback(async () => {
    if (!projectId || !taskId || !attemptId) return;

    try {
      setBranchStatusLoading(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/branch-status`
      );

      if (response.ok) {
        const result: ApiResponse<BranchStatus> = await response.json();
        if (result.success && result.data) {
          setBranchStatus(result.data);
        } else {
          setError('Failed to load branch status');
        }
      } else {
        setError('Failed to load branch status');
      }
    } catch (err) {
      setError('Failed to load branch status');
    } finally {
      setBranchStatusLoading(false);
    }
  }, [projectId, taskId, attemptId]);

  useEffect(() => {
    if (projectId && taskId && attemptId) {
      fetchTaskDetails();
      fetchDiff();
      fetchBranchStatus();
    }
  }, [
    projectId,
    taskId,
    attemptId,
    fetchTaskDetails,
    fetchDiff,
    fetchBranchStatus,
  ]);

  const handleBackClick = () => {
    navigate(`/projects/${projectId}/tasks/${taskId}`);
  };

  const handleMergeClick = async () => {
    if (!projectId || !taskId || !attemptId) return;

    // Check for uncommitted changes and show warning dialog
    if (branchStatus?.has_uncommitted_changes) {
      setShowUncommittedWarning(true);
      return;
    }

    await performMerge();
  };

  const performMerge = async () => {
    if (!projectId || !taskId || !attemptId) return;

    try {
      setMerging(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/merge`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        const result: ApiResponse<string> = await response.json();
        if (result.success) {
          // Refetch both diff and branch status to show updated state
          fetchDiff();
          fetchBranchStatus();
        } else {
          setError('Failed to merge changes');
        }
      } else {
        setError('Failed to merge changes');
      }
    } catch (err) {
      setError('Failed to merge changes');
    } finally {
      setMerging(false);
    }
  };

  const handleConfirmMergeWithUncommitted = async () => {
    setShowUncommittedWarning(false);
    await performMerge();
  };

  const handleCancelMergeWithUncommitted = () => {
    setShowUncommittedWarning(false);
  };

  const handleRebaseClick = async () => {
    if (!projectId || !taskId || !attemptId) return;

    try {
      setRebasing(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/rebase`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        const result: ApiResponse<string> = await response.json();
        if (result.success) {
          setRebaseSuccess(true);
          // Refresh both diff and branch status after rebase
          fetchDiff();
          fetchBranchStatus();
        } else {
          setError(result.message || 'Failed to rebase branch');
        }
      } else {
        setError('Failed to rebase branch');
      }
    } catch (err) {
      setError('Failed to rebase branch');
    } finally {
      setRebasing(false);
    }
  };

  const handleCreatePRClick = async () => {
    if (!projectId || !taskId || !attemptId) return;

    // Auto-fill with task details if available
    if (taskDetails) {
      setPrTitle(`${taskDetails.title} (vibe-kanban)`);
      setPrBody(taskDetails.description || '');
    } else {
      // Fallback if task details aren't available
      setPrTitle('Task completion (vibe-kanban)');
      setPrBody('');
    }

    setShowCreatePRDialog(true);
  };

  const handleConfirmCreatePR = async () => {
    if (!projectId || !taskId || !attemptId) return;

    try {
      setCreatingPR(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/create-pr`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: prTitle,
            body: prBody || null,
            base_branch: prBaseBranch || null,
          }),
        }
      );

      if (response.ok) {
        const result: ApiResponse<string> = await response.json();
        if (result.success && result.data) {
          // Open the PR URL in a new tab
          window.open(result.data, '_blank');
          setShowCreatePRDialog(false);
          // Reset form
          setPrTitle('');
          setPrBody('');
          setPrBaseBranch('main');
        } else {
          setError(result.message || 'Failed to create GitHub PR');
        }
      } else {
        setError('Failed to create GitHub PR');
      }
    } catch (err) {
      setError('Failed to create GitHub PR');
    } finally {
      setCreatingPR(false);
    }
  };

  const handleCancelCreatePR = () => {
    setShowCreatePRDialog(false);
    // Reset form to empty state - will be auto-filled again when reopened
    setPrTitle('');
    setPrBody('');
    setPrBaseBranch('main');
  };

  const getChunkClassName = (chunkType: DiffChunkType) => {
    const baseClass = 'font-mono text-sm whitespace-pre py-1 flex';

    switch (chunkType) {
      case 'Insert':
        return `${baseClass} bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-l-2 border-green-400 dark:border-green-500`;
      case 'Delete':
        return `${baseClass} bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-l-2 border-red-400 dark:border-red-500`;
      case 'Equal':
      default:
        return `${baseClass} text-muted-foreground`;
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
          // Skip empty last line from split
          const processedLine: ProcessedLine = {
            content: line,
            chunkType: chunk.chunk_type,
          };

          // Set line numbers based on chunk type
          switch (chunk.chunk_type) {
            case 'Equal':
              processedLine.oldLineNumber = oldLineNumber++;
              processedLine.newLineNumber = newLineNumber++;
              break;
            case 'Delete':
              processedLine.oldLineNumber = oldLineNumber++;
              // No new line number for deletions
              break;
            case 'Insert':
              processedLine.newLineNumber = newLineNumber++;
              // No old line number for insertions
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
        // Look for the next change or end of file
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
          (!hasPrevChange && !hasNextChange) ||
          showAllUnchanged
        ) {
          // Show all context if it's short, no changes around it, or global toggle is on
          sections.push({
            type: 'context',
            lines: lines.slice(i, nextChangeIndex),
          });
        } else {
          // Split into context sections with expandable middle
          if (hasPrevChange) {
            // Add context after previous change
            sections.push({
              type: 'context',
              lines: lines.slice(i, i + CONTEXT_LINES),
            });
            i += CONTEXT_LINES;
          }

          if (hasNextChange) {
            // Add expandable section
            const expandStart = hasPrevChange ? i : i + CONTEXT_LINES;
            const expandEnd = nextChangeIndex - CONTEXT_LINES;

            if (expandEnd > expandStart) {
              const expandKey = `${fileIndex}-${expandStart}-${expandEnd}`;
              const isExpanded =
                expandedSections.has(expandKey) || showAllUnchanged;

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

            // Add context before next change
            sections.push({
              type: 'context',
              lines: lines.slice(
                nextChangeIndex - CONTEXT_LINES,
                nextChangeIndex
              ),
            });
          } else if (!hasPrevChange) {
            // No changes around, just show first few lines
            sections.push({
              type: 'context',
              lines: lines.slice(i, i + CONTEXT_LINES),
            });
          }
        }

        i = nextChangeIndex;
      } else {
        // Found a change, collect all consecutive changes
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
    if (!fileToDelete || !projectId || !taskId || !attemptId) return;

    try {
      setDeletingFiles((prev) => new Set(prev).add(fileToDelete));
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/delete-file?file_path=${encodeURIComponent(
          fileToDelete
        )}`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        const result: ApiResponse<null> = await response.json();
        if (result.success) {
          // Refresh the diff to show updated state
          fetchDiff();
        } else {
          setError(result.message || 'Failed to delete file');
        }
      } else {
        setError('Failed to delete file');
      }
    } catch (err) {
      setError('Failed to delete file');
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

  if (loading || branchStatusLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading diff...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={handleBackClick} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Task
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button onClick={handleBackClick} variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Task
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Compare Changes
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {/* Branch Status */}
          {!branchStatusLoading && branchStatus && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                {branchStatus.up_to_date ? (
                  <span className="text-green-600">Up to date</span>
                ) : branchStatus.is_behind === true && !branchStatus.merged ? (
                  <span className="text-orange-600">
                    {branchStatus.commits_behind} commit
                    {branchStatus.commits_behind !== 1 ? 's' : ''} behind{' '}
                    {branchStatus.base_branch_name}
                  </span>
                ) : !branchStatus.merged ? (
                  <span className="text-blue-600">
                    {branchStatus.commits_ahead} commit
                    {branchStatus.commits_ahead !== 1 ? 's' : ''} ahead of{' '}
                    {branchStatus.base_branch_name}
                  </span>
                ) : null}
              </div>
              {branchStatus.has_uncommitted_changes && (
                <div className="flex items-center gap-1 text-yellow-600">
                  <FileText className="h-4 w-4" />
                  <span>Uncommitted changes</span>
                </div>
              )}
            </div>
          )}

          {/* Status Messages */}
          {branchStatus?.merged && (
            <div className="text-green-600 text-sm font-medium">
              ✓ Changes have been merged
            </div>
          )}
          {rebaseSuccess && (
            <div className="text-green-600 text-sm">
              Branch rebased successfully!
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {branchStatus &&
              branchStatus.is_behind === true &&
              !branchStatus.merged && (
                <Button
                  onClick={handleRebaseClick}
                  disabled={rebasing || branchStatusLoading}
                  variant="outline"
                  className="border-orange-300 text-orange-700 hover:bg-orange-50"
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${rebasing ? 'animate-spin' : ''}`}
                  />
                  {rebasing
                    ? 'Rebasing...'
                    : `Rebase onto ${branchStatus.base_branch_name}`}
                </Button>
              )}
            {!branchStatus?.merged && (
              <>
                <Button
                  onClick={handleCreatePRClick}
                  disabled={
                    creatingPR ||
                    !diff ||
                    diff.files.length === 0 ||
                    Boolean(branchStatus?.is_behind)
                  }
                  variant="outline"
                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  <GitPullRequest className="mr-2 h-4 w-4" />
                  {creatingPR ? 'Creating PR...' : 'Create PR'}
                </Button>
                <Button
                  onClick={handleMergeClick}
                  disabled={
                    merging ||
                    !diff ||
                    diff.files.length === 0 ||
                    Boolean(branchStatus?.is_behind)
                  }
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                >
                  {merging ? 'Merging...' : 'Merge Changes'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                Diff: Base Commit vs. Current Worktree
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Shows changes made in the task attempt worktree compared to the
                base commit
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllUnchanged(!showAllUnchanged)}
              className="flex items-center gap-2"
            >
              {showAllUnchanged ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  Hide Unchanged
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Show All Unchanged
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!diff || diff.files.length === 0 ? (
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
                  <div className="max-h-[600px] overflow-y-auto">
                    {processFileChunks(file.chunks, fileIndex).map(
                      (section, sectionIndex) => {
                        if (
                          section.type === 'context' &&
                          section.lines.length === 0 &&
                          section.expandKey &&
                          !showAllUnchanged
                        ) {
                          // Render expand button (only when global toggle is off)
                          const lineCount =
                            parseInt(section.expandKey.split('-')[2]) -
                            parseInt(section.expandKey.split('-')[1]);
                          return (
                            <div key={`expand-${section.expandKey}`}>
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

                        // Render lines (context, change, or expanded)
                        return (
                          <div key={`section-${sectionIndex}`}>
                            {section.type === 'expanded' &&
                              section.expandKey &&
                              !showAllUnchanged && (
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
                              )}
                            {section.lines.map((line, lineIndex) => (
                              <div
                                key={`${sectionIndex}-${lineIndex}`}
                                className={getChunkClassName(line.chunkType)}
                              >
                                <div className="flex-shrink-0 w-16 px-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 select-none">
                                  <span className="inline-block w-6 text-right">
                                    {line.oldLineNumber || ''}
                                  </span>
                                  <span className="inline-block w-6 text-right ml-1">
                                    {line.newLineNumber || ''}
                                  </span>
                                </div>
                                <div className="flex-1 px-3">
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* Uncommitted Changes Warning Dialog */}
      <Dialog
        open={showUncommittedWarning}
        onOpenChange={() => handleCancelMergeWithUncommitted()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uncommitted Changes Detected</DialogTitle>
            <DialogDescription>
              There are uncommitted changes in the worktree that will be
              included in the merge.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-sm text-yellow-800">
                <strong>Warning:</strong> The worktree contains uncommitted
                changes (modified, added, or deleted files) that have not been
                committed to git. These changes will be permanently merged into
                the {branchStatus?.base_branch_name || 'base'} branch.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelMergeWithUncommitted}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmMergeWithUncommitted}
              disabled={merging}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {merging ? 'Merging...' : 'Merge Anyway'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create PR Dialog */}
      <Dialog
        open={showCreatePRDialog}
        onOpenChange={() => handleCancelCreatePR()}
      >
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Create GitHub Pull Request</DialogTitle>
            <DialogDescription>
              Create a pull request for this task attempt on GitHub.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pr-title">Title</Label>
              <Input
                id="pr-title"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                placeholder="Enter PR title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-body">Description (optional)</Label>
              <Textarea
                id="pr-body"
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                placeholder="Enter PR description"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-base">Base Branch</Label>
              <Input
                id="pr-base"
                value={prBaseBranch}
                onChange={(e) => setPrBaseBranch(e.target.value)}
                placeholder="main"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelCreatePR}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreatePR}
              disabled={creatingPR || !prTitle.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creatingPR ? 'Creating...' : 'Create PR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
