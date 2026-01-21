import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CaretDownIcon,
  CaretRightIcon,
  StarIcon,
  PlusIcon,
  TrashIcon,
  DotsThreeIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
} from '@phosphor-icons/react';
import type { BaseCodingAgent, ExecutorConfigs } from 'shared/types';
import { cn } from '@/lib/utils';
import { toPrettyCase } from '@/utils/string';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../primitives/Dropdown';
import { IconButton } from '../../primitives/IconButton';
import { InputField } from '../../primitives/InputField';

interface AgentConfigTreeProps {
  executors: ExecutorConfigs['executors'] | null;
  selectedExecutor: string;
  selectedConfig: string;
  defaultExecutor: string | undefined;
  defaultVariant: string | null | undefined;
  onSelect: (executor: string, config: string) => void;
  onCreateConfig: (executor: string) => void;
  onDeleteConfig: (executor: string, config: string) => void;
  onMakeDefault: (executor: string, config: string) => void;
  disabled?: boolean;
  renderContent?: (executor: string, config: string) => React.ReactNode;
}

interface ConfigNodeProps {
  configName: string;
  isSelected: boolean;
  isDefault: boolean;
  isOnlyConfig: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMakeDefault: () => void;
  disabled?: boolean;
}

function ConfigNode({
  configName,
  isSelected,
  isDefault,
  isOnlyConfig,
  onSelect,
  onDelete,
  onMakeDefault,
  disabled,
}: ConfigNodeProps) {
  const { t } = useTranslation('settings');

  return (
    <div
      className={cn(
        'group flex items-center h-[28px] cursor-pointer rounded-sm transition-colors',
        'hover:bg-panel relative select-none',
        isSelected && 'bg-brand/10 text-brand'
      )}
      onClick={onSelect}
    >
      {/* Indentation guide */}
      <div className="absolute left-0 top-0 bottom-0 flex">
        <div
          className="h-full w-3 flex justify-center"
          style={{ marginLeft: '6px' }}
        >
          <div className="h-full border-l border-border" />
        </div>
      </div>

      {/* Content */}
      <div
        className="flex items-center gap-1.5 flex-1 pr-1 whitespace-nowrap"
        style={{ paddingLeft: '24px' }}
      >
        {/* Star icon for default */}
        <span className="w-4 flex items-center justify-center shrink-0">
          {isDefault && (
            <StarIcon className="size-icon-xs text-warning" weight="fill" />
          )}
        </span>

        {/* Config name */}
        <span
          className={cn(
            'text-sm truncate flex-1',
            isSelected ? 'text-brand font-medium' : 'text-normal'
          )}
        >
          {toPrettyCase(configName)}
        </span>

        {/* Actions menu - always rendered but trigger only visible on hover */}
        {!disabled && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'p-0.5 rounded-sm hover:bg-secondary',
                  'opacity-0 group-hover:opacity-100 transition-opacity'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <DotsThreeIcon className="size-icon-xs" weight="bold" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onMakeDefault();
                }}
                disabled={isDefault}
              >
                <div className="flex items-center gap-2 w-full">
                  <StarIcon className="size-icon-xs mr-2" />
                  {t('settings.agents.editor.makeDefault')}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                disabled={isOnlyConfig}
                className="text-error focus:text-error"
              >
                <div className="flex items-center gap-2 w-full text-error">
                  <TrashIcon className="size-icon-xs mr-2" />
                  {t('settings.agents.editor.deleteText')}
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

interface ExecutorNodeProps {
  executor: string;
  configs: string[];
  isExpanded: boolean;
  selectedExecutor: string;
  selectedConfig: string;
  defaultExecutor: string | undefined;
  defaultVariant: string | null | undefined;
  onToggle: () => void;
  onSelect: (config: string) => void;
  onCreateConfig: () => void;
  onDeleteConfig: (config: string) => void;
  onMakeDefault: (config: string) => void;
  disabled?: boolean;
  renderContent?: (executor: string, config: string) => React.ReactNode;
}

function ExecutorNode({
  executor,
  configs,
  isExpanded,
  selectedExecutor,
  selectedConfig,
  defaultExecutor,
  defaultVariant,
  onToggle,
  onSelect,
  onCreateConfig,
  onDeleteConfig,
  onMakeDefault,
  disabled,
  renderContent,
}: ExecutorNodeProps) {
  const { t } = useTranslation('settings');
  const [showAddButton, setShowAddButton] = useState(false);

  const hasDefaultConfig = defaultExecutor === executor;

  return (
    <div className="select-none">
      {/* Executor header */}
      <div
        className={cn(
          'group flex items-center h-[28px] cursor-pointer rounded-sm transition-colors',
          'hover:bg-panel'
        )}
        onClick={onToggle}
        onMouseEnter={() => setShowAddButton(true)}
        onMouseLeave={() => setShowAddButton(false)}
      >
        <div className="flex items-center gap-1 flex-1 px-1.5">
          {/* Expand/collapse caret */}
          <span className="w-4 flex items-center justify-center shrink-0">
            {isExpanded ? (
              <CaretDownIcon className="size-icon-xs" weight="fill" />
            ) : (
              <CaretRightIcon className="size-icon-xs" weight="fill" />
            )}
          </span>

          {/* Default indicator */}
          <span className="w-4 flex items-center justify-center shrink-0">
            {hasDefaultConfig && (
              <StarIcon className="size-icon-xs text-warning" weight="fill" />
            )}
          </span>

          {/* Executor name */}
          <span className="text-sm font-medium text-high truncate flex-1">
            {toPrettyCase(executor)}
          </span>

          {/* Config count badge */}
          <span className="text-xs text-low px-1.5 py-0.5 bg-secondary rounded">
            {configs.length}
          </span>

          {/* Add button */}
          {showAddButton && !disabled && (
            <span onClick={(e) => e.stopPropagation()}>
              <IconButton
                icon={PlusIcon}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={onCreateConfig}
                aria-label={t('settings.agents.editor.createNew')}
              />
            </span>
          )}
        </div>
      </div>

      {/* Config children */}
      {isExpanded && (
        <div className="ml-0">
          {configs.map((configName) => {
            const isSelected =
              selectedExecutor === executor && selectedConfig === configName;
            return (
              <div key={configName}>
                <ConfigNode
                  configName={configName}
                  isSelected={isSelected}
                  isDefault={
                    defaultExecutor === executor &&
                    defaultVariant === configName
                  }
                  isOnlyConfig={configs.length <= 1}
                  onSelect={() => onSelect(configName)}
                  onDelete={() => onDeleteConfig(configName)}
                  onMakeDefault={() => onMakeDefault(configName)}
                  disabled={disabled}
                />
                {/* Inline content for selected config */}
                {isSelected && renderContent && (
                  <div className="mt-2 mb-4 ml-6">
                    {renderContent(executor, configName)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AgentConfigTree({
  executors,
  selectedExecutor,
  selectedConfig,
  defaultExecutor,
  defaultVariant,
  onSelect,
  onCreateConfig,
  onDeleteConfig,
  onMakeDefault,
  disabled,
  renderContent,
}: AgentConfigTreeProps) {
  const { t } = useTranslation('settings');
  const [searchQuery, setSearchQuery] = useState('');
  // Only expand the default executor by default
  const [expandedExecutors, setExpandedExecutors] = useState<Set<string>>(
    () => new Set(defaultExecutor ? [defaultExecutor] : [])
  );

  // Filter executors and configs based on search
  const filteredExecutors = useMemo(() => {
    if (!executors) return {};
    if (!searchQuery.trim()) return executors;

    const query = searchQuery.toLowerCase();
    const result: typeof executors = {};

    for (const [executor, configs] of Object.entries(executors)) {
      const executorMatches = toPrettyCase(executor)
        .toLowerCase()
        .includes(query);
      const matchingConfigs = Object.keys(configs).filter((configName) =>
        toPrettyCase(configName).toLowerCase().includes(query)
      );

      if (executorMatches || matchingConfigs.length > 0) {
        // If executor name matches, show all configs; otherwise show only matching configs
        if (executorMatches) {
          result[executor as BaseCodingAgent] = configs;
        } else {
          const filteredConfigs: typeof configs = {};
          for (const configName of matchingConfigs) {
            filteredConfigs[configName] = configs[configName];
          }
          result[executor as BaseCodingAgent] = filteredConfigs;
        }
      }
    }

    return result;
  }, [executors, searchQuery]);

  const toggleExecutor = (executor: string) => {
    setExpandedExecutors((prev) => {
      const next = new Set(prev);
      if (next.has(executor)) {
        next.delete(executor);
      } else {
        next.add(executor);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (executors) {
      setExpandedExecutors(new Set(Object.keys(executors)));
    }
  };

  const collapseAll = () => {
    setExpandedExecutors(new Set());
  };

  if (!executors) {
    return null;
  }

  const executorEntries = Object.entries(filteredExecutors);
  const allExpanded =
    executorEntries.length > 0 &&
    executorEntries.every(([executor]) => expandedExecutors.has(executor));

  const ExpandIcon = allExpanded ? ArrowsInSimpleIcon : ArrowsOutSimpleIcon;

  return (
    <div className="flex flex-col h-full">
      {/* Search and controls */}
      <div className="p-2 border-b border-border">
        <InputField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t('settings.agents.tree.search')}
          variant="search"
          actionIcon={ExpandIcon}
          onAction={allExpanded ? collapseAll : expandAll}
        />
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto p-1">
        {executorEntries.length === 0 ? (
          <div className="text-sm text-low text-center py-4">
            {searchQuery
              ? t('settings.agents.tree.noResults')
              : t('settings.agents.tree.noConfigs')}
          </div>
        ) : (
          executorEntries.map(([executor, configs]) => (
            <ExecutorNode
              key={executor}
              executor={executor}
              configs={Object.keys(configs)}
              isExpanded={expandedExecutors.has(executor)}
              selectedExecutor={selectedExecutor}
              selectedConfig={selectedConfig}
              defaultExecutor={defaultExecutor}
              defaultVariant={defaultVariant}
              onToggle={() => toggleExecutor(executor)}
              onSelect={(config) => onSelect(executor, config)}
              onCreateConfig={() => onCreateConfig(executor)}
              onDeleteConfig={(config) => onDeleteConfig(executor, config)}
              onMakeDefault={(config) => onMakeDefault(executor, config)}
              disabled={disabled}
              renderContent={renderContent}
            />
          ))
        )}
      </div>
    </div>
  );
}
