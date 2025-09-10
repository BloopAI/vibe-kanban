import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ApprovalRequest } from '@/types/logs';

interface ApprovalLogEntryProps {
  approval: ApprovalRequest;
  onRespond?: (approved: boolean, reason?: string) => void;
}

export const ApprovalLogEntry: React.FC<ApprovalLogEntryProps> = ({
  approval,
  onRespond,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = new Date(approval.timeout_at).getTime() - Date.now();
      setTimeLeft(Math.max(0, Math.floor(remaining / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [approval.timeout_at]);

  const handleApprove = async () => {
    if (hasResponded) return;
    
    setIsResponding(true);
    setHasResponded(true);
    
    try {
      await fetch(`/api/approvals/${approval.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true })
      });
      onRespond?.(true);
    } catch (error) {
      console.error('Failed to approve:', error);
      setHasResponded(false);
    } finally {
      setIsResponding(false);
    }
  };

  const handleDeny = async () => {
    if (hasResponded) return;
    
    setIsResponding(true);
    setHasResponded(true);
    
    try {
      await fetch(`/api/approvals/${approval.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          approved: false, 
          reason: 'User denied via web interface' 
        })
      });
      onRespond?.(false, 'User denied via web interface');
    } catch (error) {
      console.error('Failed to deny:', error);
      setHasResponded(false);
    } finally {
      setIsResponding(false);
    }
  };

  return (
    <div className="border-l-4 border-l-orange-500 bg-orange-50 p-4 my-2 rounded-r">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="bg-orange-100">
            {approval.tool_name}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Approval Required
          </span>
        </div>
        
        {!hasResponded && timeLeft > 0 && (
          <div className="text-sm text-muted-foreground">
            {timeLeft}s remaining
          </div>
        )}
      </div>

      <div className="mb-3">
        <p className="text-sm font-medium mb-1">Message:</p>
        <p className="text-sm">{approval.message}</p>
      </div>

      <details className="mb-3">
        <summary className="text-sm font-medium cursor-pointer">
          Tool Arguments
        </summary>
        <pre className="bg-gray-100 p-2 rounded text-xs mt-1 overflow-auto max-h-40">
          {JSON.stringify(approval.tool_input, null, 2)}
        </pre>
      </details>

      {!hasResponded && timeLeft > 0 && (
        <div className="flex gap-2">
          <Button 
            size="sm" 
            onClick={handleApprove}
            disabled={isResponding}
            className="bg-green-600 hover:bg-green-700"
          >
            {isResponding ? 'Approving...' : 'Approve'}
          </Button>
          <Button 
            size="sm" 
            variant="destructive"
            onClick={handleDeny}
            disabled={isResponding}
          >
            {isResponding ? 'Denying...' : 'Deny'}
          </Button>
        </div>
      )}

      {hasResponded && (
        <div className="text-sm text-muted-foreground">
          Response sent
        </div>
      )}

      {timeLeft === 0 && !hasResponded && (
        <div className="text-sm text-red-600">
          Request timed out
        </div>
      )}
    </div>
  );
};

export default ApprovalLogEntry;