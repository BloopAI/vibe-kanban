import { Badge } from '@/components/ui/badge';
import type { Invitation } from 'shared/types';
import { MemberRole } from 'shared/types';
import { useTranslation } from 'react-i18next';

interface PendingInvitationItemProps {
  invitation: Invitation;
}

export function PendingInvitationItem({
  invitation,
}: PendingInvitationItemProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <div>
          <div className="font-medium text-sm">{invitation.email}</div>
          <div className="text-xs text-muted-foreground">
            {t('organization.invitationList.invited', {
              date: new Date(invitation.created_at).toLocaleDateString(),
            })}
          </div>
        </div>
        <Badge
          variant={
            invitation.role === MemberRole.ADMIN ? 'default' : 'secondary'
          }
        >
          {invitation.role}
        </Badge>
        <Badge variant="outline">
          {t('organization.invitationList.pending')}
        </Badge>
      </div>
    </div>
  );
}
