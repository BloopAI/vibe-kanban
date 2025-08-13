import { ExecutionProcess, ProfileVariant } from 'shared/types';

export type AttemptData = {
  processes: ExecutionProcess[];
  runningProcessDetails: Record<string, ExecutionProcess>;
  processProfiles: Record<string, ProfileVariant | null>;
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
