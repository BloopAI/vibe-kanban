import type { NormalizedEntry, ExecutorAction } from 'shared/types';

// Define approval types locally for now until TS generation works
export interface ApprovalRequest {
  id: string;
  tool_name: string;
  tool_input: any;
  message: string;
  session_id: string;
  created_at: string;
  timeout_at: string;
}

export interface ApprovalResponse {
  id: string;
  status: 'approved' | 'denied' | 'timed_out';
  reason?: string;
}

export interface UnifiedLogEntry {
  id: string;
  ts: number; // epoch-ms timestamp for sorting and react-window key
  processId: string;
  processName: string;
  channel: 'raw' | 'stdout' | 'stderr' | 'normalized' | 'process_start' | 'approval_request' | 'approval_response';
  payload: string | NormalizedEntry | ProcessStartPayload | ApprovalRequest | ApprovalResponse;
}

export interface ProcessStartPayload {
  processId: string;
  runReason: string;
  startedAt: string;
  status: string;
  action?: ExecutorAction;
}
