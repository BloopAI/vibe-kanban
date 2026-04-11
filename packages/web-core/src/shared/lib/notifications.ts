import type {
  Notification,
  NotificationGroupKind,
  NotificationPayload,
  NotificationType,
} from 'shared/remote-types';

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function getPayload(n: Notification): NotificationPayload {
  return n.payload ?? {};
}

export function getDeeplinkPath(n: Notification): string | null {
  return getPayload(n).deeplink_path ?? null;
}

type IssueChangeField =
  | 'title'
  | 'description'
  | 'priority'
  | 'assignee'
  | 'unassigned';

type GroupableNotificationKind = Exclude<NotificationGroupKind, 'single'>;

export type GroupedNotification = {
  id: string;
  kind: NotificationGroupKind;
  latest: Notification;
  seen: boolean;
  deeplinkPath: string | null;
  notificationCount: number;
  unseenNotificationIds: string[];
  issueChangeCount: number;
};

type NotificationGroupingMeta = {
  groupKind: GroupableNotificationKind;
  issueChangeField?: IssueChangeField;
  scope: 'issue' | 'project';
};

type GroupAccumulator = {
  id: string;
  kind: GroupableNotificationKind;
  notifications: Notification[];
  latest: Notification;
  issueChangeFields: Set<IssueChangeField>;
};

type ActiveGroup = {
  index: number;
  group: GroupAccumulator;
};

const NOTIFICATION_GROUPING_META: Partial<
  Record<NotificationType, NotificationGroupingMeta>
> = {
  issue_title_changed: {
    groupKind: 'issue_changes',
    issueChangeField: 'title',
    scope: 'issue',
  },
  issue_description_changed: {
    groupKind: 'issue_changes',
    issueChangeField: 'description',
    scope: 'issue',
  },
  issue_priority_changed: {
    groupKind: 'issue_changes',
    issueChangeField: 'priority',
    scope: 'issue',
  },
  issue_status_changed: {
    groupKind: 'status_changes',
    scope: 'issue',
  },
  issue_assignee_changed: {
    groupKind: 'issue_changes',
    issueChangeField: 'assignee',
    scope: 'issue',
  },
  issue_unassigned: {
    groupKind: 'issue_changes',
    issueChangeField: 'unassigned',
    scope: 'issue',
  },
  issue_comment_added: {
    groupKind: 'comments',
    scope: 'issue',
  },
  issue_comment_reaction: {
    groupKind: 'reactions',
    scope: 'issue',
  },
  issue_deleted: {
    groupKind: 'issue_deleted',
    scope: 'project',
  },
};

function getGroupingMeta(
  notification: Notification
): NotificationGroupingMeta | null {
  return NOTIFICATION_GROUPING_META[notification.notification_type] ?? null;
}

function getGroupKey(
  notification: Notification,
  meta: NotificationGroupingMeta
): string | null {
  const payload = getPayload(notification);
  const actorId = payload.actor_user_id;

  if (!actorId) {
    return null;
  }

  if (meta.scope === 'project') {
    const projectPath = payload.deeplink_path;
    if (!projectPath) {
      return null;
    }
    return `${meta.groupKind}:${actorId}:${projectPath}`;
  }

  const issueId = payload.issue_id ?? notification.issue_id;
  if (!issueId) {
    return null;
  }

  return `${meta.groupKind}:${actorId}:${issueId}`;
}

function buildGroupedNotification(
  id: string,
  kind: NotificationGroupKind,
  latest: Notification,
  notifications: Notification[],
  issueChangeCount: number
): GroupedNotification {
  const unseenNotificationIds = notifications
    .filter((notification) => !notification.seen)
    .map((notification) => notification.id);

  return {
    id,
    kind,
    latest,
    seen: unseenNotificationIds.length === 0,
    deeplinkPath: getDeeplinkPath(latest),
    notificationCount: notifications.length,
    unseenNotificationIds,
    issueChangeCount,
  };
}

function buildSingleGroupedNotification(
  notification: Notification
): GroupedNotification {
  return buildGroupedNotification(
    notification.id,
    'single',
    notification,
    [notification],
    0
  );
}

function createAccumulator(
  notification: Notification,
  groupKey: string,
  meta: NotificationGroupingMeta
): GroupAccumulator {
  const issueChangeFields = new Set<IssueChangeField>();
  if (meta.issueChangeField) {
    issueChangeFields.add(meta.issueChangeField);
  }

  return {
    id: `${groupKey}:${notification.id}`,
    kind: meta.groupKind,
    notifications: [notification],
    latest: notification,
    issueChangeFields,
  };
}

function getCreatedAtTimestamp(notification: Notification): number {
  return new Date(notification.created_at).getTime();
}

function shouldStartNewGroup(
  group: GroupAccumulator,
  notification: Notification
): boolean {
  return (
    getCreatedAtTimestamp(group.latest) - getCreatedAtTimestamp(notification) >
    GROUP_WINDOW_MS
  );
}

function finalizeGroup(group: GroupAccumulator): GroupedNotification {
  return buildGroupedNotification(
    group.id,
    group.kind,
    group.latest,
    group.notifications,
    group.kind === 'issue_changes'
      ? Math.max(group.issueChangeFields.size, 1)
      : 0
  );
}

function addNotificationToGroup(
  group: GroupAccumulator,
  notification: Notification,
  meta: NotificationGroupingMeta
) {
  group.notifications.push(notification);

  if (meta.issueChangeField) {
    group.issueChangeFields.add(meta.issueChangeField);
  }
}

export function groupNotifications(
  notifications: Notification[]
): GroupedNotification[] {
  const sorted = [...notifications].sort(
    (a, b) => getCreatedAtTimestamp(b) - getCreatedAtTimestamp(a)
  );
  const groups: GroupedNotification[] = [];
  const groupsByKey = new Map<string, ActiveGroup>();

  for (const notification of sorted) {
    const meta = getGroupingMeta(notification);
    if (!meta) {
      groups.push(buildSingleGroupedNotification(notification));
      continue;
    }

    const groupKey = getGroupKey(notification, meta);
    if (!groupKey) {
      groups.push(buildSingleGroupedNotification(notification));
      continue;
    }

    const activeGroup = groupsByKey.get(groupKey);
    if (!activeGroup || shouldStartNewGroup(activeGroup.group, notification)) {
      const nextGroup = createAccumulator(notification, groupKey, meta);
      const index = groups.length;
      groups.push(finalizeGroup(nextGroup));
      groupsByKey.set(groupKey, { index, group: nextGroup });
      continue;
    }

    addNotificationToGroup(activeGroup.group, notification, meta);
    groups[activeGroup.index] = finalizeGroup(activeGroup.group);
  }

  return groups;
}
