import { useCallback, useContext, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { ChevronDown, ChevronUp, GitCompare, Trash2 } from 'lucide-react';
import type { DiffChunk, DiffChunkType, WorktreeDiff } from 'shared/types.ts';
import { TaskDetailsContext } from '@/components/context/taskDetailsContext.ts';

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

interface DiffCardProps {
  diff: WorktreeDiff | null;
  deletable?: boolean;
  compact?: boolean;
  className?: string;
}

export function DiffCard({
  diff,
  deletable = false,
  compact = false,
  className = '',
}: DiffCardProps) {
  const { deletingFiles, setFileToDelete, isBackgroundRefreshing } =
    useContext(TaskDetailsContext);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );

  const onDeleteFile = useCallback(
    (filePath: string) => {
      setFileToDelete(filePath);
    },
    [setFileToDelete]
  );

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
    const CONTEXT_LINES = compact ? 2 : 3;
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

  if (!diff || diff.files.length === 0) {
    return (
      <div
        className={`bg-muted/30 border border-muted rounded-lg p-4 ${className}`}
      >
        <div className="text-center py-4 text-muted-foreground">
          <GitCompare className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No changes detected</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-background border border-border rounded-lg overflow-hidden shadow-sm flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">
            {diff.files.length} file{diff.files.length !== 1 ? 's' : ''} changed
          </div>
          {isBackgroundRefreshing && (
            <div className="flex items-center gap-1">
              <div className="animate-spin h-3 w-3 border border-blue-500 border-t-transparent rounded-full"></div>
              <span className="text-xs text-blue-600 dark:text-blue-400">
                Updating...
              </span>
            </div>
          )}
        </div>
        {!compact && diff.files.length > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={expandAllFiles}
              className="h-6 text-xs"
              disabled={collapsedFiles.size === 0}
            >
              Expand All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={collapseAllFiles}
              className="h-6 text-xs"
              disabled={collapsedFiles.size === diff.files.length}
            >
              Collapse All
            </Button>
          </div>
        )}
      </div>

      {/* Files */}
      <div
        className={`${compact ? 'max-h-80' : 'flex-1 min-h-0'} overflow-y-auto`}
      >
        <div className="space-y-2 p-3">
          {diff.files.map((file, fileIndex) => (
            <div
              key={fileIndex}
              className={`border rounded-lg overflow-hidden ${
                collapsedFiles.has(file.path) ? 'border-muted' : 'border-border'
              }`}
            >
              <div
                className={`bg-muted px-3 py-1.5 flex items-center justify-between ${
                  !collapsedFiles.has(file.path) ? 'border-b' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleFileCollapse(file.path)}
                    className="h-5 w-5 p-0 hover:bg-muted-foreground/10"
                    title={
                      collapsedFiles.has(file.path)
                        ? 'Expand diff'
                        : 'Collapse diff'
                    }
                  >
                    {collapsedFiles.has(file.path) ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronUp className="h-3 w-3" />
                    )}
                  </Button>
                  <p className="text-xs font-medium text-muted-foreground font-mono">
                    {file.path}
                  </p>
                  {collapsedFiles.has(file.path) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                      <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-1 py-0.5 rounded text-xs">
                        +
                        {file.chunks
                          .filter((c) => c.chunk_type === 'Insert')
                          .reduce(
                            (acc, c) => acc + c.content.split('\n').length - 1,
                            0
                          )}
                      </span>
                      <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-1 py-0.5 rounded text-xs">
                        -
                        {file.chunks
                          .filter((c) => c.chunk_type === 'Delete')
                          .reduce(
                            (acc, c) => acc + c.content.split('\n').length - 1,
                            0
                          )}
                      </span>
                    </div>
                  )}
                </div>
                {deletable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteFile(file.path)}
                    disabled={deletingFiles.has(file.path)}
                    className="text-red-600 hover:text-red-800 hover:bg-red-50 h-6 px-2 gap-1"
                    title={`Delete ${file.path}`}
                  >
                    <Trash2 className="h-3 w-3" />
                    {!compact && (
                      <span className="text-xs">
                        {deletingFiles.has(file.path)
                          ? 'Deleting...'
                          : 'Delete'}
                      </span>
                    )}
                  </Button>
                )}
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
                                  toggleExpandSection(section.expandKey!)
                                }
                                className="w-full h-5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 border-t border-b border-gray-200 dark:border-gray-700 rounded-none justify-start"
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
                                    className="w-full h-5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 border-t border-b border-gray-200 dark:border-gray-700 rounded-none justify-start"
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
                                <div
                                  className={getLineNumberClassName(
                                    line.chunkType
                                  )}
                                >
                                  <span className="inline-block w-4 text-right text-xs">
                                    {line.oldLineNumber || ''}
                                  </span>
                                  <span className="inline-block w-4 text-right ml-1 text-xs">
                                    {line.newLineNumber || ''}
                                  </span>
                                </div>
                                <div className="flex-1 px-2 min-h-[1rem] flex items-center">
                                  <span className="inline-block w-3 text-xs">
                                    {getChunkPrefix(line.chunkType)}
                                  </span>
                                  <span className="text-xs">
                                    {line.content}
                                  </span>
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
      </div>
    </div>
  );
}
