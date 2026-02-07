import type { ReactElement, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getPinnedProviderIds } from '@/utils/pinnedModels';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSearchInput,
  DropdownMenuTrigger,
} from '../Dropdown';
import type { ModelInfo, ModelSelectorConfig } from 'shared/types';
import { ModelProviderSidebar } from './ModelProviderSidebar';
import { ModelList, getVisibleModels } from './ModelList';

export const DEFAULT_PROVIDER_ID = '__default__';

interface ModelSelectorPopoverProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  config: ModelSelectorConfig;
  selectedProviderId: string | null;
  selectedModelId: string | null;
  selectedReasoningId: string | null;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onProviderSelect: (id: string) => void;
  onModelSelect: (id: string, providerId?: string) => void;
  onReasoningSelect: (reasoningId: string | null) => void;
  pinnedModelIds?: string[];
  onPin?: (model: ModelInfo) => void;
  showDefaultOption?: boolean;
  onSelectDefault?: () => void;
  modelListScrollRef?: Ref<HTMLDivElement>;
  providerSidebarScrollRef?: Ref<HTMLDivElement>;
}

const MODEL_LIST_PAGE_SIZE = 8;

function getPopoverWidth(
  showProviderSidebar: boolean,
  hasReasoning: boolean,
  hidePin: boolean
): string {
  if (showProviderSidebar) return 'w-[420px]';
  if (hasReasoning) return hidePin ? 'w-[230px]' : 'w-[240px]';
  return hidePin ? 'w-[200px]' : 'w-[210px]';
}

export function ModelSelectorPopover({
  isOpen,
  onOpenChange,
  trigger,
  config,
  selectedProviderId,
  selectedModelId,
  selectedReasoningId,
  searchQuery,
  onSearchChange,
  onProviderSelect,
  onModelSelect,
  onReasoningSelect,
  pinnedModelIds = [],
  onPin,
  showDefaultOption = false,
  onSelectDefault,
  modelListScrollRef,
  providerSidebarScrollRef,
}: ModelSelectorPopoverProps) {
  const { t } = useTranslation('common');
  const models = config.models;
  const showProviderSidebar = config.providers.length > 1;
  const isDefaultProviderSelected =
    showProviderSidebar &&
    showDefaultOption &&
    (!selectedProviderId || selectedProviderId === DEFAULT_PROVIDER_ID);
  const sidebarDefaultOption =
    showProviderSidebar && showDefaultOption
      ? { id: DEFAULT_PROVIDER_ID, name: 'Default' }
      : undefined;
  const hasReasoning = models.some(
    (model) => model.reasoning_options.length > 0
  );
  const popoverHeightClass = showProviderSidebar ? 'h-[280px]' : '';
  const visibleModels = getVisibleModels(
    models,
    showProviderSidebar,
    selectedProviderId
  );
  const showSearch = visibleModels.length > MODEL_LIST_PAGE_SIZE;
  const canPinModels =
    showProviderSidebar ||
    !(
      searchQuery.trim().length === 0 &&
      visibleModels.length <= MODEL_LIST_PAGE_SIZE
    );
  const hidePin = !showProviderSidebar && !canPinModels;
  const popoverWidth = getPopoverWidth(
    showProviderSidebar,
    hasReasoning,
    hidePin
  );

  const selectedModel =
    visibleModels.find((model) => model.id === selectedModelId) ?? null;
  const pinnedProviderIds = getPinnedProviderIds(models, pinnedModelIds);

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={8}
        data-model-selector-popover
        className={cn(
          'p-0 overflow-hidden flex flex-col',
          popoverWidth,
          popoverHeightClass
        )}
        onInteractOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-model-selector-dropdown]')) {
            event.preventDefault();
          }
        }}
      >
        <div
          className={cn(
            'flex flex-1 flex-col min-h-0 overflow-hidden',
            showProviderSidebar && 'h-full'
          )}
        >
          {config.error && (
            <div className="px-base py-half bg-red-500/10 border-b border-red-500/20">
              <span className="text-sm text-red-600">{config.error}</span>
            </div>
          )}
          <DropdownMenuLabel>{t('modelSelector.model')}</DropdownMenuLabel>
          <div className="flex flex-1 min-h-0">
            {showProviderSidebar && (
              <ModelProviderSidebar
                providers={config.providers}
                selectedProviderId={selectedProviderId}
                pinnedProviderIds={pinnedProviderIds}
                onSelect={onProviderSelect}
                defaultOption={sidebarDefaultOption}
                scrollRef={providerSidebarScrollRef}
              />
            )}
            <div className="flex flex-col flex-1 min-h-0 min-w-0">
              <ModelList
                models={isDefaultProviderSelected ? [] : visibleModels}
                providerSelectionRequired={
                  showProviderSidebar && !selectedProviderId
                }
                selectedModelId={selectedModelId}
                searchQuery={searchQuery}
                onSelect={onModelSelect}
                reasoningOptions={selectedModel?.reasoning_options ?? []}
                selectedReasoningId={selectedReasoningId}
                onReasoningSelect={onReasoningSelect}
                pinnedModelIds={pinnedModelIds}
                onPin={canPinModels ? onPin : undefined}
                justifyEnd={!showProviderSidebar}
                className={!showProviderSidebar ? 'max-h-[233px]' : undefined}
                showDefaultOption={
                  showDefaultOption &&
                  (!showProviderSidebar || isDefaultProviderSelected)
                }
                onSelectDefault={onSelectDefault}
                scrollRef={modelListScrollRef}
              />
              {showSearch && (
                <div className="border-t border-border">
                  <DropdownMenuSearchInput
                    placeholder="Filter by name or ID..."
                    value={searchQuery}
                    onValueChange={onSearchChange}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
