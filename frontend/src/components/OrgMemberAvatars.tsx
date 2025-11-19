import { useOrganizationMembers } from '@/hooks/useOrganizationMembers';
import { UserAvatar } from '@/components/tasks/UserAvatar';
import { useTranslation } from 'react-i18next';

interface OrgMemberAvatarsProps {
  limit?: number;
  className?: string;
  organizationId?: string;
}

export function OrgMemberAvatars({
  limit = 5,
  className = '',
  organizationId,
}: OrgMemberAvatarsProps) {
  const { t } = useTranslation('common');
  const { data: members, isPending } = useOrganizationMembers(organizationId);

  if (!organizationId || isPending || !members || members.length === 0) {
    return null;
  }

  const displayMembers = members.slice(0, limit);
  const remainingCount = members.length - limit;

  return (
    <div className={`flex items-center ${className}`}>
      <div className="flex -space-x-2">
        {displayMembers.map((member) => (
          <UserAvatar
            key={member.user_id}
            firstName={member.first_name}
            lastName={member.last_name}
            username={member.username}
            imageUrl={member.avatar_url}
            className="h-6 w-6 ring-2 ring-background"
          />
        ))}
      </div>
      {remainingCount > 0 && (
        <span className="ml-2 text-xs text-muted-foreground">
          {t('orgMembers.moreCount', { count: remainingCount })}
        </span>
      )}
    </div>
  );
}
