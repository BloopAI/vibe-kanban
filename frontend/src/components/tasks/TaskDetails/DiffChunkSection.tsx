import { Button } from '@/components/ui/button.tsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DiffChunkType } from 'shared/types.ts';
import { Dispatch, SetStateAction } from 'react';
import { ProcessedSection } from '@/lib/types.ts';

type Props = {
  section: ProcessedSection;
  sectionIndex: number;
  setExpandedSections: Dispatch<SetStateAction<Set<string>>>;
};

function DiffChunkSection({
  section,
  sectionIndex,
  setExpandedSections,
}: Props) {
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

  if (
    section.type === 'context' &&
    section.lines.length === 0 &&
    section.expandKey
  ) {
    const lineCount =
      parseInt(section.expandKey.split('-')[2]) -
      parseInt(section.expandKey.split('-')[1]);
    return (
      <div className="w-full">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleExpandSection(section.expandKey!)}
          className="w-full h-5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 border-t border-b border-gray-200 dark:border-gray-700 rounded-none justify-start"
        >
          <ChevronDown className="h-3 w-3 mr-1" />
          Show {lineCount} more lines
        </Button>
      </div>
    );
  }

  return (
    <div>
      {section.type === 'expanded' && section.expandKey && (
        <div className="w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleExpandSection(section.expandKey!)}
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
          <div className={getLineNumberClassName(line.chunkType)}>
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
            <span className="text-xs">{line.content}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default DiffChunkSection;
