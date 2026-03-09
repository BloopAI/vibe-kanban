import { useMemo, useCallback } from 'react';
import { useRouter } from '@tanstack/react-router';
import { BellIcon, ChecksIcon } from '@phosphor-icons/react';
import type { Notification } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { UserAvatar } from '@vibe/ui/components/UserAvatar';
import { useNotifications } from '@/shared/hooks/useNotifications';
import { useOrganizationStore } from '@/shared/stores/useOrganizationStore';
import { useOrganizationMembers } from '@/shared/hooks/useOrganizationMembers';
import { makeRequest } from '@/shared/lib/remoteApi';
import {
  getNotificationSegments,
  getDeeplinkPath,
  resolveMember,
  type MessageSegment,
} from '@/shared/lib/notifications';
import { formatRelativeTime } from '@/shared/lib/date';
import { cn } from '@/shared/lib/utils';

function NotificationMessage({
  segments,
  members,
}: {
  segments: MessageSegment[];
  members: OrganizationMemberWithProfile[];
}) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <span key={i}>{seg.value}</span>;
        if (seg.type === 'bold') return <strong key={i}>{seg.value}</strong>;
        const member = resolveMember(seg.userId, members);
        if (member) {
          return (
            <UserAvatar
              key={i}
              user={member}
              className="inline-flex h-5 w-5 align-text-bottom text-[10px]"
            />
          );
        }
        return <span key={i}>Someone</span>;
      })}
    </>
  );
}

export function NotificationsPage() {
  const router = useRouter();
  const selectedOrgId = useOrganizationStore((s) => s.selectedOrgId);
  const { data, update, enabled } = useNotifications();
  const { data: members = [] } = useOrganizationMembers(
    selectedOrgId ?? undefined
  );
  const sorted = useMemo(
    () =>
      [...data].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [data]
  );

  const unseenCount = useMemo(() => data.filter((n) => !n.seen).length, [data]);

  const handleClick = useCallback(
    (n: Notification) => {
      if (!n.seen) {
        update(n.id, { seen: true });
      }
      const path = getDeeplinkPath(n);
      if (path) {
        router.navigate({ to: path as '/' });
      }
    },
    [update, router]
  );

  const handleMarkAllSeen = useCallback(async () => {
    if (!selectedOrgId) return;
    await makeRequest(
      `/v1/notifications/mark-all-seen?organization_id=${selectedOrgId}`,
      { method: 'POST' }
    );
  }, [selectedOrgId]);

  if (!enabled) {
    return (
      <div className="flex items-center justify-center h-full text-low">
        Sign in to view notifications
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-double py-base border-b border-border">
        <h1 className="text-xl font-medium text-high">Notifications</h1>
        {unseenCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllSeen}
            className="flex items-center gap-1 px-base py-half text-sm text-low hover:text-normal transition-colors cursor-pointer"
          >
            <ChecksIcon size={16} />
            Mark all as read
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-low">
            <BellIcon size={32} weight="light" />
            <p className="text-base">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sorted.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className={cn(
                  'w-full flex items-start gap-base px-double py-base text-left transition-colors cursor-pointer',
                  'hover:bg-secondary',
                  !n.seen && 'bg-brand/5'
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 shrink-0 w-2 h-2 rounded-full',
                    !n.seen && 'bg-brand'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-base truncate',
                      n.seen ? 'text-normal' : 'text-high font-medium'
                    )}
                  >
                    <NotificationMessage
                      segments={getNotificationSegments(n)}
                      members={members}
                    />
                  </p>
                  <p className="text-sm text-low mt-0.5">
                    {formatRelativeTime(n.created_at)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
