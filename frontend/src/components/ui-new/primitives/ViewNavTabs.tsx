'use client';

import { useTranslation } from 'react-i18next';
import type { ProjectStatus } from 'shared/remote-types';
import type { KanbanViewMode } from '@/stores/useUiPreferencesStore';
import { cn } from '@/lib/utils';
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
  className?: string;
}

export function ViewNavTabs({
  activeView,
  onViewChange,
  hiddenStatuses,
  selectedStatusId,
  onStatusSelect,
  className,
}: ViewNavTabsProps) {
  const { t } = useTranslation('common');
  const isActiveTab = activeView === 'kanban';
  const isAllTab = activeView === 'list' && selectedStatusId === null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-base">
      <ButtonGroup className={cn('flex-wrap', className)}>
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
    </div>
  );
}
