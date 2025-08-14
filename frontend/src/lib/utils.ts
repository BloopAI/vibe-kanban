import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ExecutorAction, ProfileVariantLabel } from 'shared/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractProfileVariant(
  executorAction: ExecutorAction
): ProfileVariantLabel | null {
  if (!executorAction?.typ) return null;

  const actionType = executorAction.typ;

  // Check if it's a CodingAgentInitialRequest or CodingAgentFollowUpRequest
  if ('type' in actionType) {
    if (
      actionType.type === 'CodingAgentInitialRequest' ||
      actionType.type === 'CodingAgentFollowUpRequest'
    ) {
      return actionType.profile_variant_label;
    }
  }
  return null;
}
