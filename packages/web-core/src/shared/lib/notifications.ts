import type { Notification, NotificationPayload } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';

export function getPayload(n: Notification): NotificationPayload {
  return n.payload ?? {};
}

export function getDeeplinkPath(n: Notification): string | null {
  return getPayload(n).deeplink_path ?? null;
}

/** A segment of a notification message — either plain/bold text or a user avatar. */
export type MessageSegment =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'user'; userId: string };

function text(value: string): MessageSegment {
  return { type: 'text', value };
}

function bold(value: string): MessageSegment {
  return { type: 'bold', value };
}

function user(userId: string): MessageSegment {
  return { type: 'user', userId };
}

function formatPriority(priority?: string | null): string | null {
  if (!priority) return null;
  return priority
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getNotificationSegments(n: Notification): MessageSegment[] {
  const payload = getPayload(n);
  const title = payload.issue_title ?? 'an issue';
  const actorId = payload.actor_user_id;

  const actor = actorId ? [user(actorId)] : [text('Someone')];

  switch (n.notification_type) {
    case 'issue_title_changed': {
      const newTitle = payload.new_title;
      if (newTitle) {
        return [...actor, text(' renamed the issue to '), bold(newTitle)];
      }
      return [...actor, text(' renamed '), bold(title)];
    }
    case 'issue_assignee_changed': {
      const assigneeId = payload.assignee_user_id;
      const assignee = assigneeId ? [user(assigneeId)] : [text('Someone')];
      return [
        ...assignee,
        text(' was assigned to '),
        bold(title),
        text(' by '),
        ...actor,
      ];
    }
    case 'issue_unassigned': {
      return [...actor, text(' unassigned you from '), bold(title)];
    }
    case 'issue_description_changed': {
      return [
        text('Description updated on '),
        bold(title),
        text(' by '),
        ...actor,
      ];
    }
    case 'issue_priority_changed': {
      const oldPriority = formatPriority(payload.old_priority);
      const newPriority = formatPriority(payload.new_priority);
      if (oldPriority && newPriority) {
        return [
          ...actor,
          text(' changed priority on '),
          bold(title),
          text(' from '),
          bold(oldPriority),
          text(' to '),
          bold(newPriority),
        ];
      }
      if (newPriority) {
        return [
          ...actor,
          text(' changed priority on '),
          bold(title),
          text(' to '),
          bold(newPriority),
        ];
      }
      return [...actor, text(' cleared priority on '), bold(title)];
    }
    case 'issue_comment_added': {
      return [...actor, text(' commented on '), bold(title)];
    }
    case 'issue_comment_reaction': {
      const emoji = payload.emoji;
      if (emoji) {
        return [
          ...actor,
          text(' reacted '),
          bold(emoji),
          text(' to your comment on '),
          bold(title),
        ];
      }
      return [...actor, text(' reacted to your comment on '), bold(title)];
    }
    case 'issue_status_changed': {
      const oldStatusName = payload.old_status_name;
      const newStatusName = payload.new_status_name;
      if (oldStatusName && newStatusName) {
        return [
          ...actor,
          text(' changed status on '),
          bold(title),
          text(' from '),
          bold(oldStatusName),
          text(' to '),
          bold(newStatusName),
        ];
      }
      return [...actor, text(' changed status on '), bold(title)];
    }
    case 'issue_deleted': {
      return [...actor, text(' deleted '), bold(title)];
    }
    default:
      return [text('New notification')];
  }
}

export function resolveMember(
  userId: string,
  members: OrganizationMemberWithProfile[]
): OrganizationMemberWithProfile | undefined {
  return members.find((m) => m.user_id === userId);
}
