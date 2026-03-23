import type { GroupedNotification } from '@/shared/lib/notifications';
import { getPayload } from '@/shared/lib/notifications';
import type { OrganizationMemberWithProfile } from 'shared/types';

export type MessageSegment =
  | { type: 'text'; value: string }
  | { type: 'emphasis'; value: string }
  | { type: 'issue'; value: string }
  | { type: 'user'; userId: string };

function text(value: string): MessageSegment {
  return { type: 'text', value };
}

function emphasis(value: string): MessageSegment {
  return { type: 'emphasis', value };
}

function issue(value: string): MessageSegment {
  return { type: 'issue', value };
}

function user(userId: string): MessageSegment {
  return { type: 'user', userId };
}

function getMemberLabel(member?: OrganizationMemberWithProfile): string | null {
  if (!member) return null;

  const fullName = [member.first_name, member.last_name]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ');

  if (fullName) return fullName;
  if (member.username?.trim()) return member.username;

  return null;
}

function formatPriority(priority?: string | null): string | null {
  if (!priority) return null;

  return priority
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getActorSegments(group: GroupedNotification): MessageSegment[] {
  const actorId = getPayload(group.latest).actor_user_id;
  return actorId ? [user(actorId)] : [text('Someone')];
}

function getIssueSegments(group: GroupedNotification): MessageSegment[] {
  const payload = getPayload(group.latest);
  if (payload.issue_simple_id) {
    return [issue(payload.issue_simple_id)];
  }

  return [emphasis(payload.issue_title ?? 'an issue')];
}

function formatCountLabel(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getGroupedNotificationSegments(
  group: GroupedNotification
): MessageSegment[] {
  const payload = getPayload(group.latest);
  const actor = getActorSegments(group);
  const issueSegments = getIssueSegments(group);

  if (group.kind !== 'single' && group.notificationCount > 1) {
    switch (group.kind) {
      case 'issue_changes':
        return [
          ...actor,
          text(' changed '),
          emphasis(formatCountLabel(group.issueChangeCount, 'field')),
          text(' on '),
          ...issueSegments,
        ];
      case 'comments':
        return [
          ...actor,
          text(' left '),
          emphasis(formatCountLabel(group.notificationCount, 'comment')),
          text(' on '),
          ...issueSegments,
        ];
      case 'status_changes':
        return [...actor, text(' changed status on '), ...issueSegments];
      case 'reactions':
        return [
          ...actor,
          text(' reacted '),
          emphasis(formatCountLabel(group.notificationCount, 'time')),
          text(' on '),
          ...issueSegments,
        ];
      case 'issue_deleted':
        return [
          ...actor,
          text(' deleted '),
          emphasis(formatCountLabel(group.notificationCount, 'issue')),
        ];
    }
  }

  switch (group.latest.notification_type) {
    case 'issue_title_changed': {
      const newTitle = payload.new_title;
      if (newTitle) {
        return [
          ...actor,
          text(' changed the title of '),
          ...issueSegments,
          text(' to '),
          emphasis(newTitle),
        ];
      }
      return [...actor, text(' changed the title of '), ...issueSegments];
    }
    case 'issue_assignee_changed': {
      const assigneeId = payload.assignee_user_id;
      const assignee = assigneeId ? [user(assigneeId)] : [text('Someone')];
      return [
        ...assignee,
        text(' was assigned to '),
        ...issueSegments,
        text(' by '),
        ...actor,
      ];
    }
    case 'issue_unassigned':
      return [...actor, text(' unassigned you from '), ...issueSegments];
    case 'issue_description_changed':
      return [...actor, text(' changed the description on '), ...issueSegments];
    case 'issue_priority_changed': {
      const oldPriority = formatPriority(payload.old_priority);
      const newPriority = formatPriority(payload.new_priority);

      if (oldPriority && newPriority) {
        return [
          ...actor,
          text(' changed the priority of '),
          ...issueSegments,
          text(' from '),
          emphasis(oldPriority),
          text(' to '),
          emphasis(newPriority),
        ];
      }

      if (newPriority) {
        return [
          ...actor,
          text(' changed the priority of '),
          ...issueSegments,
          text(' to '),
          emphasis(newPriority),
        ];
      }

      return [...actor, text(' cleared the priority of '), ...issueSegments];
    }
    case 'issue_comment_added':
      return [...actor, text(' commented on '), ...issueSegments];
    case 'issue_comment_reaction': {
      const emoji = payload.emoji;
      if (emoji) {
        return [
          ...actor,
          text(' reacted '),
          emphasis(emoji),
          text(' to your comment on '),
          ...issueSegments,
        ];
      }
      return [...actor, text(' reacted to your comment on '), ...issueSegments];
    }
    case 'issue_status_changed': {
      const oldStatusName = payload.old_status_name;
      const newStatusName = payload.new_status_name;

      if (oldStatusName && newStatusName) {
        return [
          ...actor,
          text(' changed status of '),
          ...issueSegments,
          text(' from '),
          emphasis(oldStatusName),
          text(' to '),
          emphasis(newStatusName),
        ];
      }

      return [...actor, text(' changed status of '), ...issueSegments];
    }
    case 'issue_deleted':
      return [...actor, text(' deleted '), ...issueSegments];
    default:
      return [text('New notification')];
  }
}

export function getGroupedNotificationText(
  group: GroupedNotification,
  membersByUserId?: Map<string, OrganizationMemberWithProfile>
): string {
  return getGroupedNotificationSegments(group)
    .map((segment) => {
      if (segment.type === 'user') {
        return (
          getMemberLabel(membersByUserId?.get(segment.userId)) ?? 'Someone'
        );
      }

      return segment.value;
    })
    .join('');
}
