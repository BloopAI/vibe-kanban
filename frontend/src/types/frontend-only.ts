// Frontend-only types that are not shared with the backend
import type { 
  DiffChunkType, 
  TaskAttemptActivityWithPrompt, 
  ExecutionProcessSummary, 
  ExecutionProcess 
} from 'shared/types';

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

export interface AttemptData {
  activities: TaskAttemptActivityWithPrompt[];
  processes: ExecutionProcessSummary[];
  runningProcessDetails: Record<string, ExecutionProcess>;
}
