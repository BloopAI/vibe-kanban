import { useOrganizationMembers } from '@/hooks/useOrganizationMembers';
import { UserAvatar } from '@/components/tasks/UserAvatar';
import { useTranslation } from 'react-i18next';

interface OrgMemberAvatarsProps {
  limit?: number;
  className?: string;
}

export function OrgMemberAvatars({
  limit = 5,
  className = '',
}: OrgMemberAvatarsProps) {
  const { t } = useTranslation('common');
  const { data: members, isPending } = useOrganizationMembers();

  if (isPending || !members || members.length === 0) {
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
            firstName={null}
            lastName={null}
            username={null}
            imageUrl={null}
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
