'use client';

import { useTranslation } from 'react-i18next';
import {
  ArrowsLeftRightIcon,
  ArrowFatLineUpIcon,
  UsersIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { cn } from '../lib/cn';
import { Tooltip } from './Tooltip';

interface BulkActionButtonProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
}

function BulkActionButton({
  icon: IconComponent,
  label,
  onClick,
  variant = 'default',
}: BulkActionButtonProps) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex items-center gap-half px-base py-half rounded-sm text-sm',
          'transition-colors',
          variant === 'destructive'
            ? 'text-destructive hover:bg-destructive/10'
            : 'text-high hover:bg-secondary'
        )}
      >
        <IconComponent className="size-icon-xs" weight="bold" />
        <span>{label}</span>
      </button>
    </Tooltip>
  );
}

export interface BulkActionBarProps {
  selectedCount: number;
  onChangeStatus: () => void;
  onChangePriority: () => void;
  onChangeAssignees: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  onChangeStatus,
  onChangePriority,
  onChangeAssignees,
  onDelete,
  onClearSelection,
}: BulkActionBarProps) {
  const { t } = useTranslation('common');

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-half bg-primary border border-secondary rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.3)] px-base py-half">
        <span className="text-sm font-medium text-high whitespace-nowrap px-half">
          {t('kanban.bulkSelectedCount', {
            count: selectedCount,
            defaultValue: '{{count}} selected',
          })}
        </span>

        <div className="h-4 w-px bg-border" />

        <BulkActionButton
          icon={ArrowsLeftRightIcon}
          label={t('kanban.bulkChangeStatus', { defaultValue: 'Status' })}
          onClick={onChangeStatus}
        />
        <BulkActionButton
          icon={ArrowFatLineUpIcon}
          label={t('kanban.bulkChangePriority', { defaultValue: 'Priority' })}
          onClick={onChangePriority}
        />
        <BulkActionButton
          icon={UsersIcon}
          label={t('kanban.bulkChangeAssignees', { defaultValue: 'Assignee' })}
          onClick={onChangeAssignees}
        />

        <div className="h-4 w-px bg-border" />

        <BulkActionButton
          icon={TrashIcon}
          label={t('kanban.bulkDelete', { defaultValue: 'Delete' })}
          onClick={onDelete}
          variant="destructive"
        />

        <div className="h-4 w-px bg-border" />

        <Tooltip
          content={t('kanban.bulkClearSelection', {
            defaultValue: 'Clear selection',
          })}
        >
          <button
            type="button"
            onClick={onClearSelection}
            className="flex items-center justify-center p-half rounded-sm text-low hover:text-normal hover:bg-secondary transition-colors"
            aria-label={t('kanban.bulkClearSelection', {
              defaultValue: 'Clear selection',
            })}
          >
            <XIcon className="size-icon-xs" weight="bold" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
