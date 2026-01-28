import { useTranslation } from 'react-i18next';
import { FunnelIcon } from '@phosphor-icons/react';
import type { IssuePriority } from 'shared/remote-types';
import {
  MultiSelectDropdown,
  type MultiSelectDropdownOption,
} from '@/components/ui-new/primitives/MultiSelectDropdown';
import { PriorityIcon } from '@/components/ui-new/primitives/PriorityIcon';

const PRIORITIES: IssuePriority[] = ['urgent', 'high', 'medium', 'low'];

const priorityLabels: Record<IssuePriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export interface PriorityFilterDropdownProps {
  values: IssuePriority[];
  onChange: (values: IssuePriority[]) => void;
}

export function PriorityFilterDropdown({
  values,
  onChange,
}: PriorityFilterDropdownProps) {
  const { t } = useTranslation('common');

  const options: MultiSelectDropdownOption<IssuePriority>[] = PRIORITIES.map(
    (p) => ({
      value: p,
      label: priorityLabels[p],
      renderOption: () => (
        <div className="flex items-center gap-base">
          <PriorityIcon priority={p} />
          {priorityLabels[p]}
        </div>
      ),
    })
  );

  return (
    <MultiSelectDropdown
      values={values}
      options={options}
      onChange={onChange}
      icon={FunnelIcon}
      label={t('kanban.priority', 'Priority')}
      menuLabel={t('kanban.filterByPriority', 'Filter by priority')}
    />
  );
}
