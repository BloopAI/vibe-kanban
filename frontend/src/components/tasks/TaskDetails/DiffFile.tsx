import { Button } from '@/components/ui/button.tsx';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import DiffChunkSection from '@/components/tasks/TaskDetails/DiffChunkSection.tsx';
import { FileDiff, DiffChunkType } from 'shared/types.ts';

// Types for processing diff content in the frontend
export interface ProcessedLine {
  content: string;
  chunkType: DiffChunkType;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface ProcessedSection {
  type: 'context' | 'change' | 'expanded';
  lines: ProcessedLine[];
  expandKey?: string;
  expandedAbove?: boolean;
  expandedBelow?: boolean;
}
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { TaskDeletingFilesContext } from '@/components/context/taskDetailsContext.ts';

type Props = {
  collapsedFiles: Set<string>;
  compact: boolean;
  deletable: boolean;
  file: FileDiff;
  fileIndex: number;
  setCollapsedFiles: Dispatch<SetStateAction<Set<string>>>;
};

function DiffFile({
  collapsedFiles,
  file,
  deletable,
  compact,
  fileIndex,
  setCollapsedFiles,
}: Props) {
  const { deletingFiles, setFileToDelete } = useContext(
    TaskDeletingFilesContext
  );
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );

  const onDeleteFile = useCallback(
    (filePath: string) => {
      setFileToDelete(filePath);
    },
    [setFileToDelete]
  );

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

  const processedFileChunks = useMemo(() => {
    const CONTEXT_LINES = compact ? 2 : 3;
    const lines: ProcessedLine[] = [];
    let oldLineNumber = 1;
    let newLineNumber = 1;

    // Convert chunks to lines with line numbers
    file.chunks.forEach((chunk) => {
      const chunkLines = chunk.content.split('\n');
      chunkLines.forEach((line, index) => {
        if (index < chunkLines.length - 1 || line !== '') {
          const processedLine: ProcessedLine = {
            content: line,
            chunkType: chunk.chunk_type,
            oldLineNumber: undefined,
            newLineNumber: undefined,
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
            expandKey: undefined,
            expandedAbove: undefined,
            expandedBelow: undefined,
          });
        } else {
          if (hasPrevChange) {
            sections.push({
              type: 'context',
              lines: lines.slice(i, i + CONTEXT_LINES),
              expandKey: undefined,
              expandedAbove: undefined,
              expandedBelow: undefined,
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
                  expandedAbove: undefined,
                  expandedBelow: undefined,
                });
              } else {
                sections.push({
                  type: 'context',
                  lines: [],
                  expandKey,
                  expandedAbove: undefined,
                  expandedBelow: undefined,
                });
              }
            }

            sections.push({
              type: 'context',
              lines: lines.slice(
                nextChangeIndex - CONTEXT_LINES,
                nextChangeIndex
              ),
              expandKey: undefined,
              expandedAbove: undefined,
              expandedBelow: undefined,
            });
          } else if (!hasPrevChange) {
            sections.push({
              type: 'context',
              lines: lines.slice(i, i + CONTEXT_LINES),
              expandKey: undefined,
              expandedAbove: undefined,
              expandedBelow: undefined,
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
          expandKey: undefined,
          expandedAbove: undefined,
          expandedBelow: undefined,
        });
      }
    }

    return sections;
  }, [file.chunks, expandedSections, compact, fileIndex]);

  return (
    <div
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
              collapsedFiles.has(file.path) ? 'Expand diff' : 'Collapse diff'
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
                {deletingFiles.has(file.path) ? 'Deleting...' : 'Delete'}
              </span>
            )}
          </Button>
        )}
      </div>
      {!collapsedFiles.has(file.path) && (
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {processedFileChunks.map((section, sectionIndex) => (
              <DiffChunkSection
                key={`expand-${sectionIndex}`}
                section={section}
                sectionIndex={sectionIndex}
                setExpandedSections={setExpandedSections}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DiffFile;
