// OX Agent: CSRF not applicable — this is a React client component with no
// cookie-based session; all backend mutations go through the local API which
// uses Bearer token authentication, making them naturally CSRF-resistant.

import { useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DraggableProvided,
  type DraggableStateSnapshot,
  type DroppableProvided,
  type DraggableRubric,
} from '@hello-pangea/dnd';
import {
  XIcon,
  PlusIcon,
  DotsSixVerticalIcon,
  PencilSimpleLineIcon,
  SlidersHorizontalIcon,
} from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';
import { getRandomPresetColor, PRESET_COLORS } from '@/shared/lib/colors';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@vibe/ui/components/Popover';
import { Switch } from '@vibe/ui/components/Switch';
import { InlineColorPicker } from '@vibe/ui/components/ColorPicker';
import type { KanbanProjectStatus } from 'shared/types';

// =============================================================================
// Types
// =============================================================================

interface StatusItem {
  id: string;
  name: string;
  color: string;
  hidden: boolean;
  sort_order: number;
  isNew: boolean;
}

export interface KanbanDisplaySettingsProps {
  statuses: KanbanProjectStatus[];
  projectId: string;
  issueCountByStatus: Record<string, number>;
  onInsertStatus: (data: {
    id: string;
    project_id: string;
    name: string;
    color: string;
    sort_order: number;
    hidden: boolean;
  }) => void;
  onUpdateStatus: (
    id: string,
    changes: Partial<{
      name: string;
      color: string;
      sort_order: number;
      hidden: boolean;
    }>
  ) => void;
  onRemoveStatus: (id: string) => void;
}

// =============================================================================
// Status Row Clone (drag preview via portal)
// =============================================================================

interface StatusRowCloneProps {
  status: StatusItem;
  provided: DraggableProvided;
}

function StatusRowClone({ status, provided }: StatusRowCloneProps) {
  return createPortal(
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      className={cn(
        'flex items-center gap-base px-base py-half rounded-sm shadow-lg',
        status.isNew ? 'bg-panel' : 'bg-secondary',
        status.hidden && 'opacity-50'
      )}
      style={{
        ...provided.draggableProps.style,
        zIndex: 10001,
      }}
    >
      <div className="flex items-center justify-center size-icon-sm cursor-grabbing">
        <DotsSixVerticalIcon className="size-icon-xs text-low" weight="bold" />
      </div>
      <div
        className="size-dot rounded-full shrink-0"
        style={{ backgroundColor: `hsl(${status.color})` }}
      />
      <span className="text-sm text-high">{status.name}</span>
    </div>,
    document.body
  );
}

// =============================================================================
// Status Row Component (Sortable)
// =============================================================================

interface StatusRowProps {
  status: StatusItem;
  index: number;
  issueCount: number;
  visibleCount: number;
  editingId: string | null;
  editingColorId: string | null;
  onToggleHidden: (id: string, hidden: boolean) => void;
  onNameChange: (id: string, name: string) => void;
  onColorChange: (id: string, color: string) => void;
  onDelete: (id: string) => void;
  onStartEditing: (id: string) => void;
  onStartEditingColor: (id: string | null) => void;
  onStopEditing: () => void;
}

function StatusRow({
  status,
  index,
  issueCount,
  visibleCount,
  editingId,
  editingColorId,
  onToggleHidden,
  onNameChange,
  onColorChange,
  onDelete,
  onStartEditing,
  onStartEditingColor,
  onStopEditing,
}: StatusRowProps) {
  const { t } = useTranslation('common');
  const [localName, setLocalName] = useState(status.name);
  const isEditing = editingId === status.id;
  const isEditingColor = editingColorId === status.id;
  const isLastVisible = !status.hidden && visibleCount === 1;
  const canDelete = issueCount === 0;

  useEffect(() => {
    setLocalName(status.name);
  }, [status.name]);

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (localName.trim()) {
        onNameChange(status.id, localName.trim());
      } else {
        setLocalName(status.name);
      }
      onStopEditing();
    } else if (e.key === 'Escape') {
      setLocalName(status.name);
      onStopEditing();
    }
  };

  const handleNameBlur = () => {
    if (localName.trim() && localName !== status.name) {
      onNameChange(status.id, localName.trim());
    } else {
      setLocalName(status.name);
    }
    onStopEditing();
  };

  return (
    <Draggable draggableId={status.id} index={index}>
      {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            'flex items-center justify-between px-base py-half rounded-sm',
            status.isNew ? 'bg-panel' : 'bg-secondary',
            status.hidden && 'opacity-50',
            snapshot.isDragging && 'shadow-lg opacity-80'
          )}
          style={{
            ...provided.draggableProps.style,
            zIndex: snapshot.isDragging ? 10 : undefined,
          }}
        >
          {/* Left: drag handle, color dot, name */}
          <div className="flex items-center gap-base">
            <div
              {...provided.dragHandleProps}
              className="flex items-center justify-center size-icon-sm cursor-grab"
            >
              <DotsSixVerticalIcon
                className="size-icon-xs text-low"
                weight="bold"
              />
            </div>

            <Popover
              open={isEditingColor}
              onOpenChange={(open) =>
                onStartEditingColor(open ? status.id : null)
              }
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center size-icon-sm"
                  title={t('kanban.changeColor', 'Change color')}
                >
                  <div
                    className="size-dot rounded-full shrink-0"
                    style={{ backgroundColor: `hsl(${status.color})` }}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-auto p-base"
                onInteractOutside={(e) => {
                  e.preventDefault();
                  onStartEditingColor(null);
                }}
              >
                <InlineColorPicker
                  value={status.color}
                  onChange={(color) => onColorChange(status.id, color)}
                  colors={PRESET_COLORS}
                />
              </PopoverContent>
            </Popover>

            {isEditing ? (
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={handleNameBlur}
                autoFocus
                className="bg-transparent text-sm text-high outline-none border-b border-brand w-24"
              />
            ) : (
              <span
                className="text-sm text-high cursor-pointer"
                onClick={() => onStartEditing(status.id)}
              >
                {status.name}
              </span>
            )}
          </div>

          {/* Right: edit, delete, visibility toggle */}
          <div className="flex items-center gap-base">
            <button
              type="button"
              onClick={() => onStartEditing(status.id)}
              className="flex items-center justify-center size-icon-sm text-low hover:text-normal"
              title={t('kanban.editName', 'Edit name')}
            >
              <PencilSimpleLineIcon className="size-icon-xs" weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => canDelete && onDelete(status.id)}
              className={cn(
                'flex items-center justify-center size-icon-sm',
                canDelete
                  ? 'text-low hover:text-normal'
                  : 'text-low opacity-50 cursor-not-allowed'
              )}
              title={
                canDelete
                  ? t('kanban.deleteStatus', 'Delete status')
                  : t('kanban.cannotDeleteWithIssues', 'Move issues first')
              }
              disabled={!canDelete}
            >
              <XIcon className="size-icon-xs" weight="bold" />
            </button>

            <Switch
              checked={!status.hidden}
              onCheckedChange={(checked) => onToggleHidden(status.id, !checked)}
              disabled={isLastVisible && !status.hidden}
              title={
                isLastVisible
                  ? t(
                      'kanban.lastVisibleStatus',
                      'At least one status must be visible'
                    )
                  : status.hidden
                    ? t('kanban.showStatus', 'Show status')
                    : t('kanban.hideStatus', 'Hide status')
              }
            />
          </div>
        </div>
      )}
    </Draggable>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function KanbanDisplaySettingsContainer({
  statuses,
  projectId,
  issueCountByStatus,
  onInsertStatus,
  onUpdateStatus,
  onRemoveStatus,
}: KanbanDisplaySettingsProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [localStatuses, setLocalStatuses] = useState<StatusItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync from props when popover opens and there are no pending local edits
  useEffect(() => {
    if (open && !hasChanges) {
      const sorted = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
      setLocalStatuses(
        sorted.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          hidden: s.hidden,
          sort_order: s.sort_order,
          isNew: false,
        }))
      );
    }
  }, [open, statuses, hasChanges]);

  const visibleCount = useMemo(
    () => localStatuses.filter((s) => !s.hidden).length,
    [localStatuses]
  );

  const handleToggleHidden = useCallback((id: string, hidden: boolean) => {
    setLocalStatuses((prev) =>
      prev.map((s) => (s.id === id ? { ...s, hidden } : s))
    );
    setHasChanges(true);
  }, []);

  const handleNameChange = useCallback((id: string, name: string) => {
    setLocalStatuses((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name } : s))
    );
    setHasChanges(true);
  }, []);

  const handleColorChange = useCallback((id: string, color: string) => {
    setLocalStatuses((prev) =>
      prev.map((s) => (s.id === id ? { ...s, color } : s))
    );
    setHasChanges(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setLocalStatuses((prev) => prev.filter((s) => s.id !== id));
    setHasChanges(true);
  }, []);

  const handleAddColumn = useCallback(() => {
    const newId = crypto.randomUUID();
    const maxSortOrder = localStatuses.reduce(
      (max, s) => Math.max(max, s.sort_order),
      0
    );
    setLocalStatuses((prev) => [
      ...prev,
      {
        id: newId,
        name: t('kanban.newStatus', 'New Status'),
        color: getRandomPresetColor(),
        hidden: false,
        sort_order: maxSortOrder + 1000,
        isNew: true,
      },
    ]);
    setEditingId(newId);
    setHasChanges(true);
  }, [localStatuses, t]);

  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination } = result;
    if (!destination || source.index === destination.index) return;

    setLocalStatuses((prev) => {
      const reordered = [...prev];
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      return reordered.map((s, index) => ({ ...s, sort_order: index }));
    });
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);

    try {
      const originalMap = new Map(statuses.map((s) => [s.id, s]));
      const localIds = new Set(localStatuses.map((s) => s.id));

      for (const original of statuses) {
        if (!localIds.has(original.id)) {
          onRemoveStatus(original.id);
        }
      }

      for (const local of localStatuses) {
        const original = originalMap.get(local.id);

        if (!original) {
          onInsertStatus({
            id: local.id,
            project_id: projectId,
            name: local.name,
            color: local.color,
            sort_order: local.sort_order,
            hidden: local.hidden,
          });
        } else {
          const changes: Partial<{
            name: string;
            color: string;
            sort_order: number;
            hidden: boolean;
          }> = {
            sort_order: local.sort_order,
          };
          if (local.name !== original.name) changes.name = local.name;
          if (local.color !== original.color) changes.color = local.color;
          if (local.hidden !== original.hidden) changes.hidden = local.hidden;
          onUpdateStatus(local.id, changes);
        }
      }

      setTimeout(() => {
        setIsSaving(false);
        setHasChanges(false);
        setLocalStatuses((prev) => prev.map((s) => ({ ...s, isNew: false })));
        setOpen(false);
      }, 300);
    } catch (err) {
      console.error('Failed to save status changes:', err);
      setIsSaving(false);
    }
  }, [
    localStatuses,
    statuses,
    projectId,
    onInsertStatus,
    onUpdateStatus,
    onRemoveStatus,
  ]);

  const handleCancel = useCallback(() => {
    setHasChanges(false);
    setOpen(false);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center p-half rounded-sm',
            'text-normal hover:bg-secondary transition-colors',
            open && 'bg-secondary'
          )}
          title={t('kanban.displaySettings', 'Display settings')}
        >
          <SlidersHorizontalIcon className="size-icon-base" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[396px] p-0"
        onInteractOutside={(e) => {
          if (editingColorId) {
            e.preventDefault();
          }
        }}
      >
        <div className="flex flex-col gap-base p-base">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-normal">
              {t('kanban.displaySettings', 'Display Settings')}
            </h3>
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center justify-center size-icon-sm text-low hover:text-normal"
            >
              <XIcon className="size-icon-xs" weight="bold" />
            </button>
          </div>

          {/* Subheader */}
          <div className="flex items-center justify-between text-normal">
            <span className="text-sm font-semibold">
              {t('kanban.visibleColumns', 'Visible Columns')}
            </span>
            <span className="text-xs text-low">
              {t('kanban.dragToRearrange', 'Drag to re-arrange')}
            </span>
          </div>

          {/* Status list */}
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable
              droppableId="display-settings-status-list"
              renderClone={(
                provided: DraggableProvided,
                _snapshot: DraggableStateSnapshot,
                rubric: DraggableRubric
              ) => (
                <StatusRowClone
                  provided={provided}
                  status={localStatuses[rubric.source.index]}
                />
              )}
            >
              {(provided: DroppableProvided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex flex-col gap-[2px]"
                >
                  {localStatuses.map((status, index) => (
                    <StatusRow
                      key={status.id}
                      status={status}
                      index={index}
                      issueCount={issueCountByStatus[status.id] ?? 0}
                      visibleCount={visibleCount}
                      editingId={editingId}
                      editingColorId={editingColorId}
                      onToggleHidden={handleToggleHidden}
                      onNameChange={handleNameChange}
                      onColorChange={handleColorChange}
                      onDelete={handleDelete}
                      onStartEditing={setEditingId}
                      onStartEditingColor={setEditingColorId}
                      onStopEditing={() => setEditingId(null)}
                    />
                  ))}
                  {provided.placeholder}

                  <button
                    type="button"
                    onClick={handleAddColumn}
                    className="flex items-center gap-half px-base py-half text-high hover:bg-secondary rounded-sm transition-colors"
                  >
                    <div className="flex items-center justify-center size-icon-sm">
                      <PlusIcon className="size-icon-xs" weight="bold" />
                    </div>
                    <span className="text-xs font-light">
                      {t('kanban.addColumn', 'Add column')}
                    </span>
                  </button>
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Footer */}
          <div className="flex justify-end pt-half">
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className={cn(
                'px-base py-half rounded-sm text-sm font-semibold text-high',
                hasChanges && !isSaving
                  ? 'bg-brand hover:bg-brand-hover'
                  : 'bg-panel text-low cursor-not-allowed'
              )}
            >
              {isSaving
                ? t('common.saving', 'Saving...')
                : t('common.save', 'Save')}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
