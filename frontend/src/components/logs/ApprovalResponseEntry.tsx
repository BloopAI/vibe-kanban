import { Badge } from '@/components/ui/badge';
import type { ApprovalResponse } from 'shared/types';

interface ApprovalResponseEntryProps {
  response: ApprovalResponse;
}

export const ApprovalResponseEntry: React.FC<ApprovalResponseEntryProps> = ({
  response,
}) => {
  const getStatusInfo = () => {
    switch (response.status.status) {
      case 'approved':
        return {
          textClass: 'text-emerald-700',
          badgeVariant: 'secondary' as const,
          text: 'Approved',
          reason: null,
          reasonClass: '',
        };
      case 'denied':
        return {
          textClass: 'text-destructive',
          badgeVariant: 'secondary' as const,
          text: 'Denied',
          reason: response.status.reason,
          reasonClass: 'text-destructive',
        };
      case 'timed_out':
        return {
          textClass: 'text-destructive',
          badgeVariant: 'secondary' as const,
          text: 'Timed Out',
          reason: null,
          reasonClass: 'text-destructive',
        };
      case 'pending':
        return {
          textClass: 'text-muted-foreground',
          badgeVariant: 'secondary' as const,
          text: 'Pending',
          reason: null,
          reasonClass: '',
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="py-2">
      <div className="px-4 py-2 text-sm border shadow-sm rounded-lg">
        <div className="flex items-center gap-2">
          <Badge
            variant={statusInfo.badgeVariant}
            className={statusInfo.textClass}
          >
            {statusInfo.text}
          </Badge>
          {statusInfo.reason && (
            <span className={statusInfo.reasonClass}>{statusInfo.reason}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApprovalResponseEntry;
