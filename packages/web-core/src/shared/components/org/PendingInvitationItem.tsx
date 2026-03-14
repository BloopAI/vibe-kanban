import { Badge } from '@vibe/ui/components/Badge';
import { Button } from '@vibe/ui/components/Button';
import type { Invitation } from 'shared/types';
import { MemberRole } from 'shared/types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Trash2 } from 'lucide-react';
import { writeClipboardViaBridge } from '@/shared/lib/clipboard';
import { getRemoteApiUrl } from '@/shared/lib/remoteApi';

interface PendingInvitationItemProps {
  invitation: Invitation;
  onRevoke?: (invitationId: string) => void;
  onCopy?: (url: string) => void;
  isRevoking?: boolean;
}

export function PendingInvitationItem({
  invitation,
  onRevoke,
  onCopy,
  isRevoking,
}: PendingInvitationItemProps) {
  const { t } = useTranslation('organization');
  const [copied, setCopied] = useState(false);

  const handleRevoke = () => {
    const confirmed = window.confirm(
      `Are you sure you want to revoke the invitation for ${invitation.email}? This action cannot be undone.`
    );
    if (confirmed) {
      onRevoke?.(invitation.id);
    }
  };

  const handleCopy = async () => {
    const base = (getRemoteApiUrl() || window.location.origin).replace(/\/+$/, '');
    const url = `${base}/invitations/${invitation.token}/accept`;
    await writeClipboardViaBridge(url);
    setCopied(true);
    onCopy?.(url);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <div>
          <div className="font-medium text-sm">{invitation.email}</div>
          <div className="text-xs text-muted-foreground">
            {t('invitationList.invited', {
              date: new Date(invitation.created_at).toLocaleDateString(),
            })}
          </div>
        </div>
        <Badge
          variant={
            invitation.role === MemberRole.ADMIN ? 'default' : 'secondary'
          }
        >
          {t('roles.' + invitation.role.toLowerCase())}
        </Badge>
        <Badge variant="outline">{t('invitationList.pending')}</Badge>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void handleCopy()}
          title={t('invitationList.copyInvitationLink')}
        >
          {copied ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRevoke}
          disabled={isRevoking}
          title="Revoke invitation"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
