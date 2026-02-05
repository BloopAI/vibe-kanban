'use client';

import { useTranslation } from 'react-i18next';
import { PlusIcon } from '@phosphor-icons/react';
import type { ProjectStatus } from 'shared/remote-types';
import type { KanbanViewMode } from '@/stores/useUiPreferencesStore';
import {
  ButtonGroup,
  ButtonGroupItem,
} from '@/components/ui-new/primitives/IconButtonGroup';

export interface ViewNavTabsProps {
  activeView: KanbanViewMode;
  onViewChange: (view: KanbanViewMode) => void;
  hiddenStatuses: ProjectStatus[];
  selectedStatusId: string | null;
  onStatusSelect: (statusId: string | null) => void;
  onCreateIssue?: () => void;
  className?: string;
}

export function ViewNavTabs({
  activeView,
  onViewChange,
  hiddenStatuses,
  selectedStatusId,
  onStatusSelect,
  onCreateIssue,
  className,
}: ViewNavTabsProps) {
  const { t } = useTranslation('common');
  const isActiveTab = activeView === 'kanban';
  const isAllTab = activeView === 'list' && selectedStatusId === null;

  return (
    <div className="flex items-center gap-base">
      <ButtonGroup className={className}>
        {/* Active (Kanban) tab */}
        <ButtonGroupItem
          active={isActiveTab}
          onClick={() => {
            onViewChange('kanban');
            onStatusSelect(null);
          }}
        >
          {t('kanban.viewTabs.active')}
        </ButtonGroupItem>

        {/* All (List) tab */}
        <ButtonGroupItem
          active={isAllTab}
          onClick={() => {
            onViewChange('list');
            onStatusSelect(null);
          }}
        >
          {t('kanban.viewTabs.all')}
        </ButtonGroupItem>

        {/* Hidden status tabs */}
        {hiddenStatuses.map((status) => {
          const isStatusActive =
            activeView === 'list' && selectedStatusId === status.id;
          return (
            <ButtonGroupItem
              key={status.id}
              active={isStatusActive}
              onClick={() => {
                onViewChange('list');
                onStatusSelect(status.id);
              }}
            >
              {status.name}
            </ButtonGroupItem>
          );
        })}
      </ButtonGroup>

      {/* Create Issue button */}
      {onCreateIssue && (
        <button
          type="button"
          onClick={onCreateIssue}
          className="p-half rounded-sm text-low hover:text-normal hover:bg-secondary transition-colors"
          aria-label={t('kanban.createIssue', 'Create issue')}
        >
          <PlusIcon className="size-icon-sm" weight="bold" />
        </button>
      )}
    </div>
  );
}
