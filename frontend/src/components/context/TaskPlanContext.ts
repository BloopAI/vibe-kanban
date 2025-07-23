import { createContext, useContext } from 'react';

interface TaskPlanContextValue {
  isPlanningMode: boolean;
  hasPlans: boolean;
  planCount: number;
  latestProcessHasNoPlan: boolean;
  canCreateTask: boolean;
}

export const TaskPlanContext = createContext<TaskPlanContextValue>({
  isPlanningMode: false,
  hasPlans: false,
  planCount: 0,
  latestProcessHasNoPlan: false,
  canCreateTask: true,
});

export const useTaskPlan = () => {
  const context = useContext(TaskPlanContext);
  if (!context) {
    // Return defaults when used outside of TaskPlanProvider (e.g., on project-tasks page)
    // In this case, we assume not in planning mode, so task creation should be allowed
    return {
      isPlanningMode: false,
      hasPlans: false,
      planCount: 0,
      latestProcessHasNoPlan: false,
      canCreateTask: true,
    };
  }
  return context;
};
