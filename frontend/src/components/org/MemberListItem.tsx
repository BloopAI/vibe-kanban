import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import type { OrganizationMember, MemberRole } from 'shared/types';
import { MemberRole as MemberRoleEnum } from 'shared/types';
import { useTranslation } from 'react-i18next';

interface MemberListItemProps {
  member: OrganizationMember;
  currentUserId: string | null;
  isAdmin: boolean;
  onRemove: (userId: string) => void;
  onRoleChange: (userId: string, role: MemberRole) => void;
  isRemoving: boolean;
  isRoleChanging: boolean;
}

export function MemberListItem({
  member,
  currentUserId,
  isAdmin,
  onRemove,
  onRoleChange,
  isRemoving,
  isRoleChanging,
}: MemberListItemProps) {
  const { t } = useTranslation('organization');
  const isSelf = member.user_id === currentUserId;
  const canRemove = isAdmin && !isSelf;
  const canChangeRole = isAdmin && !isSelf;

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <div>
          <div className="font-mono text-sm">{member.user_id}</div>
          {isSelf && (
            <div className="text-xs text-muted-foreground">
              {t('memberList.you')}
            </div>
          )}
        </div>
        <Badge
          variant={
            member.role === MemberRoleEnum.ADMIN ? 'default' : 'secondary'
          }
        >
          {t('roles.' + member.role.toLowerCase())}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        {canChangeRole && (
          <Select
            value={member.role}
            onValueChange={(value) =>
              onRoleChange(member.user_id, value as MemberRole)
            }
            disabled={isRoleChanging}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MemberRoleEnum.ADMIN}>
                {t('roles.admin')}
              </SelectItem>
              <SelectItem value={MemberRoleEnum.MEMBER}>
                {t('roles.member')}
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(member.user_id)}
            disabled={isRemoving}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}
