import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ExecutorAction, ProfileVariant } from 'shared/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractProfileVariant(
  executorAction: ExecutorAction
): ProfileVariant | null {
  if (!executorAction?.typ) return null;

  const actionType = executorAction.typ;

  // Check if it's a CodingAgentInitialRequest or CodingAgentFollowUpRequest
  if ('type' in actionType) {
    if (
      actionType.type === 'CodingAgentInitialRequest' ||
      actionType.type === 'CodingAgentFollowUpRequest'
    ) {
      // Both these types have a profile field
      if ('profile' in actionType) {
        return actionType.profile;
      }
    }
  }

  return null;
}
