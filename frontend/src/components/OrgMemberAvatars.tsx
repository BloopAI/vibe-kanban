import { useOrganization } from '@clerk/clerk-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/tasks/UserAvatar';

interface OrgMemberAvatarsProps {
  limit?: number;
  className?: string;
}

export function OrgMemberAvatars({
  limit = 5,
  className,
}: OrgMemberAvatarsProps) {
  const { isLoaded, organization, memberships } = useOrganization({
    memberships: {
      pageSize: limit + 1,
      keepPreviousData: true,
    },
  });

  if (!isLoaded || !organization || !memberships) return null;

  const visible = memberships.data?.slice(0, limit) ?? [];
  const accurateRemaining =
    typeof organization.membersCount === 'number'
      ? Math.max(0, organization.membersCount - visible.length)
      : null;
  const hasMore =
    (memberships.data?.length ?? 0) > limit || (accurateRemaining ?? 0) > 0;

  return (
    <div
      className={cn('flex -space-x-2 items-center', className)}
      aria-label="Organization members"
    >
      {visible.map((m) => {
        const pud = m.publicUserData;
        return (
          <UserAvatar
            key={m.id}
            userId={pud?.userId}
            firstName={pud?.firstName}
            lastName={pud?.lastName}
            username={pud?.identifier}
            imageUrl={pud?.imageUrl}
            className="h-6 w-6 hover:z-10"
          />
        );
      })}
      {hasMore && (
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-medium text-muted-foreground hover:z-10"
          title={
            accurateRemaining != null
              ? `+${accurateRemaining} more`
              : 'More members'
          }
        >
          {accurateRemaining != null ? `+${accurateRemaining}` : '+'}
        </div>
      )}
    </div>
  );
}
