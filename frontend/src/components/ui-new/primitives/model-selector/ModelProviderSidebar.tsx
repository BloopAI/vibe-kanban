import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { PushPinIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { ModelProvider } from 'shared/types';
import { ModelProviderIcon } from './ModelProviderIcon';

interface ModelProviderSidebarProps {
  providers: ModelProvider[];
  selectedProviderId: string | null;
  pinnedProviderIds: string[];
  onSelect: (id: string) => void;
  defaultOption?: { id: string; name: string };
  scrollRef?: Ref<HTMLDivElement>;
}

export function ModelProviderSidebar({
  providers,
  selectedProviderId,
  pinnedProviderIds,
  onSelect,
  defaultOption,
  scrollRef,
}: ModelProviderSidebarProps) {
  const { t } = useTranslation('common');
  const sortedProviders = [...providers].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const pinnedSet = new Set(pinnedProviderIds);
  const pinnedList = sortedProviders
    .filter((provider) => pinnedSet.has(provider.id))
    .reverse();
  const otherList = sortedProviders
    .filter((provider) => !pinnedSet.has(provider.id))
    .reverse();

  const isDefaultSelected = defaultOption
    ? !selectedProviderId || selectedProviderId === defaultOption.id
    : false;

  const renderProvider = (provider: ModelProvider) => {
    const isSelected =
      provider === defaultOption
        ? isDefaultSelected
        : provider.id === selectedProviderId;
    const isPinned = pinnedSet.has(provider.id);

    return (
      <button
        key={provider.id}
        type="button"
        onClick={() => onSelect(provider.id)}
        className={cn(
          'relative flex items-center gap-2 py-1.5 px-2 rounded-md text-[10px] font-medium',
          'transition-colors duration-100',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand',
          isSelected
            ? 'bg-primary border border-border text-high shadow-sm'
            : 'text-low hover:bg-primary/60'
        )}
      >
        {isSelected && (
          <span
            className={cn(
              'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2',
              'rounded-r bg-brand'
            )}
          />
        )}
        {isPinned && (
          <span className="absolute right-1 top-1 text-brand">
            <PushPinIcon className="size-icon-xs" weight="fill" />
          </span>
        )}
        <ModelProviderIcon providerId={provider.id} size="sm" />
        <span className="truncate">{provider.name}</span>
      </button>
    );
  };

  return (
    <div
      ref={scrollRef}
      className={cn(
        'flex flex-col gap-1 py-1 border-r border-border w-[140px]',
        'flex-none bg-secondary/40 h-full min-h-0 overflow-y-auto'
      )}
    >
      <div className="sr-only">{t('modelSelector.providers')}</div>
      <div className="flex flex-col px-2">
        <div className="flex min-h-full flex-col justify-end gap-1">
          {otherList.map(renderProvider)}
          {pinnedList.length > 0 && (
            <>
              <div className="h-px bg-border/60 mx-2 my-1" />
              {pinnedList.map(renderProvider)}
            </>
          )}
          {defaultOption && renderProvider(defaultOption)}
        </div>
      </div>
    </div>
  );
}
