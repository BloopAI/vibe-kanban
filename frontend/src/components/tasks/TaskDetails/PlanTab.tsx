import { useContext, useMemo, useState } from 'react';
import {
  FileText,
  Copy,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  TaskAttemptDataContext,
  TaskAttemptLoadingContext,
} from '@/components/context/taskDetailsContext.ts';
import { useTaskPlan } from '@/components/context/TaskPlanContext.ts';
import { Loader } from '@/components/ui/loader';
import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import { NormalizedEntry } from 'shared/types.ts';

interface PlanEntry {
  entry: NormalizedEntry;
  processId: string;
  processIndex: number;
  planIndex: number;
  isCurrent: boolean;
}

function PlanTab() {
  const { loading } = useContext(TaskAttemptLoadingContext);
  const { attemptData } = useContext(TaskAttemptDataContext);
  const { isPlanningMode, hasPlans, latestProcessHasNoPlan } = useTaskPlan();
  const [copiedPlan, setCopiedPlan] = useState<string | null>(null);
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());

  // Extract all plans from all processes
  const plans = useMemo(() => {
    if (!attemptData.allLogs) return [];

    const planEntries: PlanEntry[] = [];
    let globalPlanIndex = 1;

    attemptData.allLogs.forEach((processLog, processIndex) => {
      if (!processLog.normalized_conversation?.entries) return;

      let localPlanIndex = 1;
      processLog.normalized_conversation.entries.forEach((entry) => {
        if (
          entry.entry_type.type === 'tool_use' &&
          entry.entry_type.action_type.action === 'plan_presentation'
        ) {
          planEntries.push({
            entry,
            processId: processLog.id,
            processIndex,
            planIndex: localPlanIndex,
            isCurrent: globalPlanIndex === planEntries.length + 1, // Last plan is current
          });
          localPlanIndex++;
          globalPlanIndex++;
        }
      });
    });

    // Mark the last plan as current
    if (planEntries.length > 0) {
      planEntries.forEach((plan) => {
        plan.isCurrent = false;
      });
      planEntries[planEntries.length - 1].isCurrent = true;
    }

    return planEntries;
  }, [attemptData.allLogs]);

  const handleCopyPlan = async (planContent: string, planId: string) => {
    try {
      await navigator.clipboard.writeText(planContent);
      setCopiedPlan(planId);
      setTimeout(() => setCopiedPlan(null), 2000);
    } catch (error) {
      console.error('Failed to copy plan:', error);
    }
  };

  const togglePlanExpansion = (planId: string) => {
    setExpandedPlans((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(planId)) {
        newSet.delete(planId);
      } else {
        newSet.add(planId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader message="Loading..." size={32} />
      </div>
    );
  }

  if (!isPlanningMode) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium mb-2">Not in planning mode</p>
        <p className="text-sm">
          This tab is only available when using a planning executor
        </p>
      </div>
    );
  }

  if (!hasPlans && latestProcessHasNoPlan) {
    return (
      <div className="p-4">
        <div className="text-center py-8">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-orange-500" />
          <p className="text-lg font-medium mb-2 text-orange-800 dark:text-orange-300">
            No plan generated
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            The last execution attempt did not produce a plan. Task creation is
            disabled until a plan is available.
          </p>
        </div>
      </div>
    );
  }

  if (!hasPlans) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium mb-2">No plans available</p>
        <p className="text-sm">
          Plans will appear here once they are generated
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <h3 className="text-lg font-semibold">Plans ({plans.length})</h3>
        {latestProcessHasNoPlan && (
          <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 text-sm">
            <AlertTriangle className="h-4 w-4" />
            Last attempt produced no plan
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {plans.map((planEntry, index) => {
          const planId = `${planEntry.processId}-${planEntry.planIndex}`;
          const planContent =
            planEntry.entry.entry_type.type === 'tool_use' &&
            planEntry.entry.entry_type.action_type.action ===
              'plan_presentation'
              ? planEntry.entry.entry_type.action_type.plan
              : planEntry.entry.content;
          const isExpanded = expandedPlans.has(planId);

          return (
            <div
              key={planId}
              className={`border rounded-lg transition-all ${
                planEntry.isCurrent
                  ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/20 shadow-md'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-950/20 opacity-75'
              }`}
            >
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                onClick={() => togglePlanExpansion(planId)}
              >
                <div className="flex items-center gap-2">
                  <button
                    className="flex items-center justify-center w-5 h-5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlanExpansion(planId);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      planEntry.isCurrent
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    Plan {index + 1}
                  </span>
                  {planEntry.isCurrent && (
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-xs font-medium">Current</span>
                    </div>
                  )}
                  {planEntry.entry.timestamp && (
                    <span className="text-xs text-gray-500">
                      {new Date(planEntry.entry.timestamp).toLocaleString()}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyPlan(planContent, planId);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title="Copy plan as markdown"
                >
                  <Copy className="h-3 w-3" />
                  {copiedPlan === planId ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {isExpanded && (
                <div
                  className={`px-4 pb-4 border-t ${planEntry.isCurrent ? 'border-blue-200' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  <div
                    className={`mt-3 ${planEntry.isCurrent ? '' : 'opacity-80'}`}
                  >
                    <MarkdownRenderer
                      content={planContent}
                      className="whitespace-pre-wrap break-words"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {plans.length > 1 && (
        <div className="text-xs text-gray-500 text-center pt-4 border-t flex-shrink-0">
          Previous plans are shown with reduced emphasis. Click to
          expand/collapse plans.
        </div>
      )}
    </div>
  );
}

export default PlanTab;
