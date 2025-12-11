import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { planStepsApi } from '@/lib/api';
import type {
  PlanStep,
  CreatePlanStepRequest,
  UpdatePlanStepRequest,
  ReorderPlanStepRequest,
  CreateSubtasksResponse,
} from 'shared/types';

// Query keys factory
export const planStepKeys = {
  all: ['planSteps'] as const,
  byAttempt: (attemptId: string | undefined) => ['planSteps', attemptId] as const,
};

interface UsePlanStepsOptions {
  enabled?: boolean;
}

export function usePlanSteps(attemptId: string | undefined, opts?: UsePlanStepsOptions) {
  const enabled = (opts?.enabled ?? true) && !!attemptId;

  return useQuery({
    queryKey: planStepKeys.byAttempt(attemptId),
    queryFn: () => planStepsApi.list(attemptId!),
    enabled,
  });
}

interface UsePlanStepsMutationsOptions {
  onCreateSuccess?: (steps: PlanStep[]) => void;
  onCreateError?: (err: unknown) => void;
  onUpdateSuccess?: (step: PlanStep) => void;
  onUpdateError?: (err: unknown) => void;
  onDeleteSuccess?: () => void;
  onDeleteError?: (err: unknown) => void;
  onReorderSuccess?: (steps: PlanStep[]) => void;
  onReorderError?: (err: unknown) => void;
  onCreateSubtasksSuccess?: (response: CreateSubtasksResponse) => void;
  onCreateSubtasksError?: (err: unknown) => void;
}

export function usePlanStepsMutations(
  attemptId: string | undefined,
  options?: UsePlanStepsMutationsOptions
) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    if (attemptId) {
      queryClient.invalidateQueries({ queryKey: planStepKeys.byAttempt(attemptId) });
    }
  };

  const createSteps = useMutation({
    mutationFn: (steps: CreatePlanStepRequest[]) => planStepsApi.createBulk(attemptId!, steps),
    onSuccess: (data) => {
      invalidate();
      options?.onCreateSuccess?.(data);
    },
    onError: (err) => {
      console.error('Failed to create plan steps:', err);
      options?.onCreateError?.(err);
    },
  });

  const updateStep = useMutation({
    mutationFn: ({ stepId, data }: { stepId: string; data: UpdatePlanStepRequest }) =>
      planStepsApi.update(stepId, data),
    onSuccess: (data) => {
      invalidate();
      options?.onUpdateSuccess?.(data);
    },
    onError: (err) => {
      console.error('Failed to update plan step:', err);
      options?.onUpdateError?.(err);
    },
  });

  const deleteStep = useMutation({
    mutationFn: (stepId: string) => planStepsApi.delete(stepId),
    onSuccess: () => {
      invalidate();
      options?.onDeleteSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to delete plan step:', err);
      options?.onDeleteError?.(err);
    },
  });

  const reorderSteps = useMutation({
    mutationFn: (order: ReorderPlanStepRequest[]) => planStepsApi.reorder(attemptId!, order),
    onSuccess: (data) => {
      invalidate();
      options?.onReorderSuccess?.(data);
    },
    onError: (err) => {
      console.error('Failed to reorder plan steps:', err);
      options?.onReorderError?.(err);
    },
  });

  const createSubtasks = useMutation({
    mutationFn: () => planStepsApi.createSubtasks(attemptId!),
    onSuccess: (data) => {
      invalidate();
      // Also invalidate tasks list
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      options?.onCreateSubtasksSuccess?.(data);
    },
    onError: (err) => {
      console.error('Failed to create subtasks:', err);
      options?.onCreateSubtasksError?.(err);
    },
  });

  return {
    createSteps,
    updateStep,
    deleteStep,
    reorderSteps,
    createSubtasks,
  };
}
