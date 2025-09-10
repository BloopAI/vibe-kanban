import { Badge } from '@/components/ui/badge';
import type { ApprovalResponse } from '@/types/logs';

interface ApprovalResponseEntryProps {
  response: ApprovalResponse;
}

export const ApprovalResponseEntry: React.FC<ApprovalResponseEntryProps> = ({
  response,
}) => {
  const getStatusInfo = () => {
    switch (response.status) {
      case 'approved':
        return {
          color: 'border-l-green-500 bg-green-50',
          badge: 'bg-green-100 text-green-800',
          text: 'Approved',
        };
      case 'denied':
        return {
          color: 'border-l-red-500 bg-red-50',
          badge: 'bg-red-100 text-red-800',
          text: 'Denied',
        };
      case 'timed_out':
        return {
          color: 'border-l-gray-500 bg-gray-50',
          badge: 'bg-gray-100 text-gray-800',
          text: 'Timed Out',
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className={`border-l-4 ${statusInfo.color} p-3 my-1 rounded-r`}>
      <div className="flex items-center gap-2">
        <Badge className={statusInfo.badge}>
          {statusInfo.text}
        </Badge>
        {response.reason && (
          <span className="text-sm text-muted-foreground">
            {response.reason}
          </span>
        )}
      </div>
    </div>
  );
};

export default ApprovalResponseEntry;