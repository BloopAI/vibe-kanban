import type { Notification } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';

interface NotificationPayload {
  deeplink_path?: string;
  issue_title?: string;
  actor_user_id?: string;
  comment_preview?: string;
  old_status_id?: string;
  new_status_id?: string;
  old_status_name?: string;
  new_status_name?: string;
  old_title?: string;
  new_title?: string;
  assignee_user_id?: string;
}

export function getPayload(n: Notification): NotificationPayload {
  return (n.payload ?? {}) as NotificationPayload;
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

export function getNotificationSegments(n: Notification): MessageSegment[] {
  const payload = getPayload(n);
  const title = payload.issue_title ?? 'an issue';
  const actorId = payload.actor_user_id;

  switch (n.notification_type) {
    case 'issue_title_changed': {
      const actor = actorId ? [user(actorId)] : [text('Someone')];
      if (payload.old_title && payload.new_title) {
        return [
          ...actor,
          text(' changed the title '),
          bold(payload.old_title),
          text(' to '),
          bold(payload.new_title),
        ];
      }
      return [...actor, text(' changed the title on '), bold(title)];
    }
    case 'issue_assignee_changed': {
      const actor = actorId ? [user(actorId)] : [text('Someone')];
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
    case 'issue_description_changed': {
      const actor = actorId ? [user(actorId)] : [text('Someone')];
      return [
        text('Description updated on '),
        bold(title),
        text(' by '),
        ...actor,
      ];
    }
    case 'issue_comment_added': {
      const actor = actorId ? [user(actorId)] : [text('Someone')];
      return [...actor, text(' commented on '), bold(title)];
    }
    case 'issue_status_changed': {
      const actor = actorId ? [user(actorId)] : [text('Someone')];
      if (payload.old_status_name && payload.new_status_name) {
        return [
          ...actor,
          text(' changed status on '),
          bold(title),
          text(' from '),
          bold(payload.old_status_name),
          text(' to '),
          bold(payload.new_status_name),
        ];
      }
      return [...actor, text(' changed status on '), bold(title)];
    }
    case 'issue_deleted': {
      const actor = actorId ? [user(actorId)] : [text('Someone')];
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
