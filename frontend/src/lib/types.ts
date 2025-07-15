import {
  DiffChunkType,
  ExecutionProcess,
  ExecutionProcessSummary,
  TaskAttemptActivityWithPrompt,
} from 'shared/types.ts';

export type AttemptData = {
  activities: TaskAttemptActivityWithPrompt[];
  processes: ExecutionProcessSummary[];
  runningProcessDetails: Record<string, ExecutionProcess>;
};

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
