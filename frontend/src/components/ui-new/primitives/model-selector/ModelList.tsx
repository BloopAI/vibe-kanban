import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BrainIcon,
  CaretDownIcon,
  CheckIcon,
  PushPinIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { toPrettyCase } from '@/utils/string';
import { isPinnedModel } from '@/utils/pinnedModels';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../Dropdown';
import type { ModelInfo, ReasoningOption } from 'shared/types';

function getReasoningLabel(
  options: ReasoningOption[],
  selectedId: string | null
): string {
  if (!selectedId) return 'Default';
  return (
    options.find((option) => option.id === selectedId)?.label ??
    toPrettyCase(selectedId)
  );
}

interface ReasoningDropdownProps {
  options: ReasoningOption[];
  selectedId: string | null;
  onSelect: (reasoningId: string | null) => void;
}

function ReasoningDropdown({
  options,
  selectedId,
  onSelect,
}: ReasoningDropdownProps) {
  const { t } = useTranslation('common');
  if (!options.length) return null;

  const selectedLabel = selectedId
    ? getReasoningLabel(options, selectedId)
    : t('modelSelector.default');
  const isDefaultSelected = !selectedId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded-sm border border-border',
            'bg-secondary/60 px-1.5 py-0.5 text-[10px] font-semibold text-low',
            'hover:border-brand/40 hover:text-normal transition-colors',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand'
          )}
        >
          <BrainIcon className="size-icon-xs" weight="fill" />
          <span className="truncate max-w-[90px]">{selectedLabel}</span>
          <CaretDownIcon className="size-icon-2xs" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        data-model-selector-dropdown
        className="min-w-[160px]"
      >
        <DropdownMenuItem
          icon={isDefaultSelected ? CheckIcon : undefined}
          onClick={() => onSelect(null)}
        >
          {t('modelSelector.default')}
        </DropdownMenuItem>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            icon={option.id === selectedId ? CheckIcon : undefined}
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function getVisibleModels(
  models: ModelInfo[],
  filterByProvider: boolean,
  selectedProviderId: string | null
): ModelInfo[] {
  if (!filterByProvider) return models;
  if (!selectedProviderId) return [];
  const providerId = selectedProviderId.toLowerCase();
  return models.filter((model) => {
    if (!model.provider_id) return false;
    return model.provider_id.toLowerCase() === providerId;
  });
}

export interface ModelListProps {
  models: ModelInfo[];
  providerSelectionRequired: boolean;
  selectedModelId: string | null;
  searchQuery: string;
  onSelect: (id: string, providerId?: string) => void;
  reasoningOptions: ReasoningOption[];
  selectedReasoningId: string | null;
  onReasoningSelect: (reasoningId: string | null) => void;
  pinnedModelIds: string[];
  onPin?: (model: ModelInfo) => void;
  justifyEnd?: boolean;
  className?: string;
  showDefaultOption?: boolean;
  onSelectDefault?: () => void;
  scrollRef?: Ref<HTMLDivElement>;
}

export function ModelList({
  models,
  providerSelectionRequired,
  selectedModelId,
  searchQuery,
  onSelect,
  reasoningOptions,
  selectedReasoningId,
  onReasoningSelect,
  pinnedModelIds,
  onPin,
  justifyEnd = false,
  className,
  showDefaultOption = false,
  onSelectDefault,
  scrollRef,
}: ModelListProps) {
  const { t } = useTranslation('common');
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const pinnedSet = new Set(pinnedModelIds.map((entry) => entry.toLowerCase()));

  const filteredModels = normalizedSearch
    ? models.filter((model) => {
        const name = model.name?.toLowerCase() ?? '';
        const id = model.id?.toLowerCase() ?? '';
        return name.includes(normalizedSearch) || id.includes(normalizedSearch);
      })
    : models;

  const pinnedModels = filteredModels.filter((model) =>
    isPinnedModel(pinnedSet, model)
  );
  const otherModels = filteredModels.filter(
    (model) => !isPinnedModel(pinnedSet, model)
  );
  const orderedModels = [...otherModels.reverse(), ...pinnedModels.reverse()];

  const fallbackSelectedId = orderedModels[0]?.id ?? null;
  const resolvedSelectedId = selectedModelId ?? fallbackSelectedId;

  const showEmptyState = orderedModels.length === 0 && !showDefaultOption;
  const isDefaultSelected = selectedModelId === null;

  const defaultRow = showDefaultOption ? (
    <div
      key="__default__"
      className={cn(
        'group flex items-center rounded-sm mx-half',
        'transition-colors duration-100',
        'focus-within:bg-secondary',
        isDefaultSelected
          ? 'bg-secondary text-high'
          : cn('text-normal', 'hover:bg-secondary/60')
      )}
    >
      <button
        type="button"
        onClick={() => onSelectDefault?.()}
        className={cn(
          'flex-1 min-w-0 py-half pl-base pr-half text-left',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand'
        )}
      >
        <span
          className={cn(
            'block text-sm truncate',
            isDefaultSelected && 'font-semibold'
          )}
        >
          {t('modelSelector.default')}
        </span>
      </button>
    </div>
  ) : null;

  return (
    <div
      ref={scrollRef}
      className={cn(
        'flex-1 min-h-0 overflow-y-auto overflow-x-hidden',
        className
      )}
    >
      {showEmptyState ? (
        <div className="flex h-full items-center justify-center px-base text-sm text-low">
          {providerSelectionRequired
            ? 'Select a provider to see models.'
            : normalizedSearch
              ? 'No matches.'
              : 'No models available.'}
        </div>
      ) : (
        <div
          className={cn(
            'flex min-h-full flex-col',
            justifyEnd && 'justify-end'
          )}
        >
          {orderedModels.map((model) => {
            const isSelected =
              Boolean(resolvedSelectedId) &&
              model.id.toLowerCase() === resolvedSelectedId?.toLowerCase();
            const isReasoningConfigurable = model.reasoning_options.length > 0;
            const showReasoningSelector =
              isSelected &&
              isReasoningConfigurable &&
              reasoningOptions.length > 0;
            const modelPinned = isPinnedModel(pinnedSet, model);

            return (
              <div
                key={`${model.provider_id ?? 'default'}/${model.id}`}
                className={cn(
                  'group flex items-center rounded-sm mx-half',
                  'transition-colors duration-100',
                  'focus-within:bg-secondary',
                  isSelected
                    ? 'bg-secondary text-high'
                    : cn('text-normal', 'hover:bg-secondary/60')
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    onSelect(model.id, model.provider_id ?? undefined)
                  }
                  className={cn(
                    'flex-1 min-w-0 py-half pl-base pr-half text-left',
                    'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand'
                  )}
                >
                  <span
                    className={cn(
                      'block text-sm truncate',
                      isSelected && 'font-semibold'
                    )}
                    title={model.name}
                  >
                    {model.name}
                  </span>
                </button>
                <div className="flex items-center justify-end gap-half pr-base">
                  {showReasoningSelector && (
                    <ReasoningDropdown
                      options={reasoningOptions}
                      selectedId={selectedReasoningId}
                      onSelect={onReasoningSelect}
                    />
                  )}
                  {!showReasoningSelector && isReasoningConfigurable ? (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center',
                        'size-5 rounded-sm bg-border/80 text-normal',
                        'dark:bg-secondary/70'
                      )}
                      title="Reasoning supported"
                    >
                      <BrainIcon className="size-icon-xs" weight="fill" />
                    </span>
                  ) : null}
                  {onPin && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onPin(model);
                      }}
                      className={cn(
                        'flex items-center justify-center size-5 rounded-sm transition-all',
                        modelPinned
                          ? 'text-brand opacity-100'
                          : cn(
                              'text-low opacity-0 group-hover:opacity-100 focus:opacity-100',
                              isSelected && 'opacity-100'
                            ),
                        'hover:bg-border/50 hover:text-normal'
                      )}
                      title={modelPinned ? 'Unpin model' : 'Pin model'}
                    >
                      <PushPinIcon
                        className="size-icon-xs"
                        weight={modelPinned ? 'fill' : 'regular'}
                      />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {defaultRow}
        </div>
      )}
    </div>
  );
}
