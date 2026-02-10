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
import { cn } from '@/lib/utils';
import { generateUuid } from '@/lib/uuid';
import { getRandomPresetColor, PRESET_COLORS } from '@/lib/colors';
import { bulkUpdateProjectStatuses } from '@/lib/remoteApi';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui-new/primitives/Popover';
import { Switch } from '@/components/ui/switch';
import { InlineColorPicker } from '@/components/ui-new/primitives/ColorPicker';
import { usePortalContainer } from '@/contexts/PortalContainerContext';
import type { ProjectStatus } from 'shared/remote-types';

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

interface KanbanDisplaySettingsProps {
  statuses: ProjectStatus[];
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
// Status Row Clone (for drag preview via portal)
// =============================================================================

interface StatusRowCloneProps {
  status: StatusItem;
  provided: DraggableProvided;
}

function StatusRowClone({ status, provided }: StatusRowCloneProps) {
  const container = usePortalContainer();

  if (!container) return null;

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
      {/* Drag handle */}
      <div className="flex items-center justify-center size-4 cursor-grabbing">
        <DotsSixVerticalIcon className="size-icon-xs text-low" weight="bold" />
      </div>

      {/* Color dot */}
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: `hsl(${status.color})` }}
      />

      {/* Name */}
      <span className="text-sm text-high">{status.name}</span>
    </div>,
    container
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

  // Sync local name when status changes
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
          {/* Left side: drag handle, color dot, name */}
          <div className="flex items-center gap-base">
            {/* Drag handle */}
            <div
              {...provided.dragHandleProps}
              className="flex items-center justify-center size-4 cursor-grab"
            >
              <DotsSixVerticalIcon
                className="size-icon-xs text-low"
                weight="bold"
              />
            </div>

            {/* Color dot (clickable for color picker) */}
            <Popover
              open={isEditingColor}
              onOpenChange={(open) =>
                onStartEditingColor(open ? status.id : null)
              }
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center size-4"
                  title={t('kanban.changeColor', 'Change color')}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
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

            {/* Name (editable) */}
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

          {/* Right side: edit/delete icons, toggle */}
          <div className="flex items-center gap-base">
            <button
              type="button"
              onClick={() => onStartEditing(status.id)}
              className="flex items-center justify-center size-4 text-low hover:text-normal"
              title={t('kanban.editName', 'Edit name')}
            >
              <PencilSimpleLineIcon className="size-icon-xs" weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => canDelete && onDelete(status.id)}
              className={cn(
                'flex items-center justify-center size-4',
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

            {/* Visibility toggle */}
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
// Main Container Component
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

  // Local state for editing
  const [localStatuses, setLocalStatuses] = useState<StatusItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize local state when popover opens
  // Only sync from props when the popover opens, not when values change
  // (to avoid overwriting local edits while user is editing)
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

  // Count visible statuses
  const visibleCount = useMemo(
    () => localStatuses.filter((s) => !s.hidden).length,
    [localStatuses]
  );

  // Handlers
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
    const newId = generateUuid();
    const maxSortOrder = localStatuses.reduce(
      (max, s) => Math.max(max, s.sort_order),
      0
    );
    const newStatus: StatusItem = {
      id: newId,
      name: t('kanban.newStatus', 'New Status'),
      color: getRandomPresetColor(),
      hidden: false,
      sort_order: maxSortOrder + 1000,
      isNew: true,
    };
    setLocalStatuses((prev) => [...prev, newStatus]);
    setEditingId(newId);
    setHasChanges(true);
  }, [localStatuses, t]);

  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination } = result;
    if (!destination || source.index === destination.index) return;

    setLocalStatuses((prev) => {
      const newStatuses = [...prev];
      const [moved] = newStatuses.splice(source.index, 1);
      newStatuses.splice(destination.index, 0, moved);

      // Reassign sequential sort_order values 0, 1, 2, ...
      return newStatuses.map((s, index) => ({ ...s, sort_order: index }));
    });
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);

    try {
      // Find original statuses for comparison
      const originalMap = new Map(statuses.map((s) => [s.id, s]));

      // Process deletions (statuses that were in original but not in local)
      const localIds = new Set(localStatuses.map((s) => s.id));
      for (const original of statuses) {
        if (!localIds.has(original.id)) {
          onRemoveStatus(original.id);
        }
      }

      // Collect updates for existing statuses
      const bulkUpdates: {
        id: string;
        changes: Partial<{
          name: string;
          color: string;
          sort_order: number;
          hidden: boolean;
        }>;
      }[] = [];

      // Process additions and collect updates
      for (const local of localStatuses) {
        const original = originalMap.get(local.id);

        if (!original) {
          // New status - use individual insert
          onInsertStatus({
            id: local.id,
            project_id: projectId,
            name: local.name,
            color: local.color,
            sort_order: local.sort_order,
            hidden: local.hidden,
          });
        } else {
          // Existing status - always include sort_order, plus any other changes
          const changes: Partial<{
            name: string;
            color: string;
            sort_order: number;
            hidden: boolean;
          }> = {
            sort_order: local.sort_order, // Always include sort_order
          };

          if (local.name !== original.name) changes.name = local.name;
          if (local.color !== original.color) changes.color = local.color;
          if (local.hidden !== original.hidden) changes.hidden = local.hidden;

          bulkUpdates.push({ id: local.id, changes });
        }
      }

      // Use bulk update if there are multiple updates, otherwise use individual
      if (bulkUpdates.length > 1) {
        await bulkUpdateProjectStatuses(bulkUpdates);
      } else if (bulkUpdates.length === 1) {
        onUpdateStatus(bulkUpdates[0].id, bulkUpdates[0].changes);
      }

      // Brief delay to show feedback, then close
      setTimeout(() => {
        setIsSaving(false);
        setHasChanges(false);
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
    setOpen(false);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center p-half rounded-sm',
            'text-normal hover:bg-secondary transition-colors'
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
          // Prevent closing when clicking inside color picker
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
              className="flex items-center justify-center size-4 text-low hover:text-normal"
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
              droppableId="status-list"
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

                  {/* Add column button */}
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    className="flex items-center gap-half px-base py-half text-high hover:bg-secondary rounded-sm transition-colors"
                  >
                    <div className="flex items-center justify-center size-4">
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
