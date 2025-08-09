import { ExecutionProcess, ExecutionProcessSummary } from 'shared/types';

export type AttemptData = {
  processes: ExecutionProcessSummary[];
  runningProcessDetails: Record<string, ExecutionProcess>;
};

export interface ConversationEntryDisplayType {
  entry: any;
  processId: string;
  processPrompt?: string;
  processStatus: string;
  processIsRunning: boolean;
  process: any;
  isFirstInProcess: boolean;
  processIndex: number;
  entryIndex: number;
}
