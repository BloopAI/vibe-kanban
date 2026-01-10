import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Inbox as InboxIcon,
  Filter,
  SlidersHorizontal,
  Check,
  Trash2,
  RefreshCw,
  Bell,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useInbox } from '@/hooks/useInbox';
import { Loader } from '@/components/ui/loader';
import { cn } from '@/lib/utils';
import type { InboxItem, InboxNotificationType } from 'shared/types';

type ViewFilter = 'all' | 'unread';

// Notification type icons
const NOTIFICATION_ICONS: Record<InboxNotificationType, typeof Bell> = {
  task_assigned: AlertCircle,
  task_completed: CheckCircle2,
  task_comment: MessageSquare,
  task_status_changed: RefreshCw,
  task_mentioned: Bell,
  workspace_created: Bell,
  system_notification: Bell,
};

export function Inbox() {
  const navigate = useNavigate();
  const {
    items,
    summary,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteItem,
  } = useInbox();

  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Filter items based on view
  const filteredItems = viewFilter === 'unread'
    ? items.filter((item) => !item.is_read)
    : items;

  const selectedItem = filteredItems.find((item) => item.id === selectedItemId);

  const handleItemClick = useCallback((item: InboxItem) => {
    setSelectedItemId(item.id);
    if (!item.is_read) {
      markAsRead(item.id);
    }
  }, [markAsRead]);

  const handleMarkAllRead = useCallback(async () => {
    await markAllAsRead();
  }, [markAllAsRead]);

  const handleDelete = useCallback(async (itemId: string) => {
    await deleteItem(itemId);
    if (selectedItemId === itemId) {
      setSelectedItemId(null);
    }
  }, [deleteItem, selectedItemId]);

  const handleNavigateToTask = useCallback((item: InboxItem) => {
    if (item.task_id && item.project_id) {
      navigate(`/projects/${item.project_id}/tasks/${item.task_id}`);
    }
  }, [navigate]);

  const unreadCount = summary?.unread_count ? Number(summary.unread_count) : 0;

  return (
    <div className="h-full flex bg-background">
      {/* Left Panel - Inbox List */}
      <div className="w-[400px] border-r flex flex-col">
        {/* Header */}
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Inbox</h1>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Filter className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="shrink-0 border-b px-4 py-2 flex items-center gap-2">
          <Button
            variant={viewFilter === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewFilter('all')}
            className="h-7 text-xs"
          >
            All
            {items.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                {items.length}
              </Badge>
            )}
          </Button>
          <Button
            variant={viewFilter === 'unread' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewFilter('unread')}
            className="h-7 text-xs"
          >
            Unread
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </Button>
          <div className="flex-1" />
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="h-7 text-xs gap-1"
            >
              <Check className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Inbox items list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader size={24} />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
              <InboxIcon className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">
                {viewFilter === 'unread' ? 'No unread notifications' : 'No notifications'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredItems.map((item) => {
                const Icon = NOTIFICATION_ICONS[item.notification_type] || Bell;
                const isSelected = selectedItemId === item.id;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'px-4 py-3 cursor-pointer transition-colors group',
                      'hover:bg-muted/50',
                      isSelected && 'bg-muted',
                      !item.is_read && 'bg-blue-50/50 dark:bg-blue-950/20'
                    )}
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'mt-0.5 p-1.5 rounded-full',
                        !item.is_read ? 'bg-blue-100 dark:bg-blue-900' : 'bg-muted'
                      )}>
                        <Icon className={cn(
                          'h-3.5 w-3.5',
                          !item.is_read ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn(
                            'text-sm truncate',
                            !item.is_read && 'font-medium'
                          )}>
                            {item.title}
                          </p>
                          {!item.is_read && (
                            <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                          )}
                        </div>
                        {item.message && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {item.message}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(item.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Detail View / Empty State */}
      <div className="flex-1 flex items-center justify-center">
        {selectedItem ? (
          <div className="max-w-md w-full p-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {(() => {
                  const Icon = NOTIFICATION_ICONS[selectedItem.notification_type] || Bell;
                  return (
                    <div className="p-3 rounded-full bg-muted">
                      <Icon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  );
                })()}
                <div>
                  <h2 className="text-lg font-semibold">{selectedItem.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(selectedItem.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              {selectedItem.message && (
                <p className="text-sm text-muted-foreground">
                  {selectedItem.message}
                </p>
              )}
              {selectedItem.task_id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleNavigateToTask(selectedItem)}
                >
                  View Task
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center">
            {/* Empty inbox illustration - simple tray icon */}
            <div className="mx-auto mb-4">
              <svg
                width="120"
                height="100"
                viewBox="0 0 120 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-muted-foreground/30"
              >
                <rect
                  x="10"
                  y="30"
                  width="100"
                  height="60"
                  rx="8"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                />
                <path
                  d="M10 50 L40 50 L45 60 L75 60 L80 50 L110 50"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                />
                <rect
                  x="35"
                  y="10"
                  width="50"
                  height="25"
                  rx="4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  fill="none"
                />
              </svg>
            </div>
            <p className="text-muted-foreground">No notifications</p>
          </div>
        )}
      </div>
    </div>
  );
}
