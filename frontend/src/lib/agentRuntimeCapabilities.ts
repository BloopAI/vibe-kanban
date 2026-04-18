import type { BaseCodingAgent } from 'shared/types';

export interface AgentRuntimeModel {
  id: string;
  model: string;
  display_name: string;
  description: string;
  supported_reasoning_efforts: string[];
  default_reasoning_effort: string | null;
  is_default: boolean;
}

export interface AgentRuntimeCollaborationMode {
  value: string | null;
  label: string;
  model: string | null;
  reasoning_effort: string | null;
}

export interface AgentRuntimeCapabilities {
  executor: BaseCodingAgent;
  supports_interrupt: boolean;
  supports_review: boolean;
  supports_live_follow_up_messages: boolean;
  models: AgentRuntimeModel[];
  collaboration_modes: AgentRuntimeCollaborationMode[];
}
