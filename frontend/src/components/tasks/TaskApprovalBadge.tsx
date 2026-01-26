import { Check } from 'lucide-react';

interface TaskApprovalBadgeProps {
  approvalCount: number;
}

export function TaskApprovalBadge({ approvalCount }: TaskApprovalBadgeProps) {
  if (approvalCount === 0) return null;

  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400"
      title={`${approvalCount} approval(s)`}
    >
      <Check className="h-3 w-3" />
      {approvalCount}
    </span>
  );
}
