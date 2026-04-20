import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CaretLeftIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import { create, useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/shared/lib/modals';

import { cn } from '@/shared/lib/utils';
import { SettingsSection } from './settings/SettingsSection';
import { SettingsSelect } from './settings/SettingsComponents';
import type {
  SettingsSectionType,
  SettingsSectionInitialState,
} from './settings/SettingsSection';
import {
  SETTINGS_SECTION_DEFINITIONS,
  isHostSpecificSettingsSection,
} from './settings/settingsRegistry';
import {
  SettingsDirtyProvider,
  useSettingsDirty,
} from './settings/SettingsDirtyContext';
import {
  SettingsHostProvider,
  useSettingsHost,
} from './settings/SettingsHostContext';
import { SettingsMachineUserSystemProvider } from './settings/SettingsMachineUserSystemProvider';
import { ConfirmDialog } from '@vibe/ui/components/ConfirmDialog';

export interface SettingsDialogProps {
  initialSection?: SettingsSectionType;
  initialState?: SettingsSectionInitialState[SettingsSectionType];
  initialHostId?: string | 'local';
}

interface SettingsDialogContentProps {
  initialSection?: SettingsSectionType;
  initialState?: SettingsSectionInitialState[SettingsSectionType];
  onClose: () => void;
}

function SettingsDialogNavigation({
  activeSection,
  onSectionSelect,
}: {
  activeSection: SettingsSectionType;
  onSectionSelect: (sectionId: SettingsSectionType) => void;
}) {
  const { t } = useTranslation('settings');
  const {
    availableHosts,
    hostsResolved,
    selectedHost,
    selectedHostId,
    setSelectedHostId,
  } = useSettingsHost();
  const hostSections = SETTINGS_SECTION_DEFINITIONS.filter(
    (section) => section.group === 'host'
  );
  const universalSections = SETTINGS_SECTION_DEFINITIONS.filter(
    (section) => section.group === 'universal'
  );
  const hostOptions = availableHosts.map((host) => ({
    value: host.id,
    label: host.status != null ? `${host.label} (${host.status})` : host.label,
  }));
  const hostSettingsDisabled = !hostsResolved || !selectedHost;
  const hostHint = !hostsResolved
    ? t('settings.general.loading')
    : availableHosts.length === 0
      ? t('settings.hostPicker.pairMachineHint')
      : t('settings.hostPicker.selectMachineHint');

  const handlePairOtherMachines = () => {
    onSectionSelect('relay');
  };

  const renderSectionButton = (sectionId: SettingsSectionType) => {
    const section = SETTINGS_SECTION_DEFINITIONS.find(
      (item) => item.id === sectionId
    );
    if (!section) return null;
    const Icon = section.icon;
    const isActive = activeSection === section.id;
    const isDisabled =
      isHostSpecificSettingsSection(section.id) && hostSettingsDisabled;
    return (
      <button
        key={section.id}
        type="button"
        onClick={() => onSectionSelect(section.id)}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        className={cn(
          'flex items-center gap-3 text-left px-3 py-2 rounded-sm text-sm transition-colors',
          isDisabled
            ? 'text-low opacity-50 cursor-not-allowed'
            : isActive
              ? 'bg-brand/10 text-brand font-medium'
              : 'text-normal hover:bg-primary/10'
        )}
      >
        <Icon className="size-icon-sm shrink-0" weight="bold" />
        <span className="truncate">
          {t(`settings.layout.nav.${section.id}`)}
        </span>
      </button>
    );
  };

  return (
    <nav className="flex-1 p-2 flex flex-col gap-4 overflow-y-auto">
      <div className="space-y-2">
        <div className="px-3 pt-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-low">
            {t('settings.layout.nav.machineSettings')}
          </div>
        </div>
        <div className="px-2">
          <SettingsSelect
            value={selectedHostId ?? undefined}
            options={hostOptions}
            actions={[
              {
                label: t('settings.layout.nav.pairOtherMachines'),
                icon: PlusIcon,
                onClick: handlePairOtherMachines,
              },
            ]}
            onChange={setSelectedHostId}
            placeholder={t('settings.layout.nav.selectHost')}
          />
          {hostSettingsDisabled && (
            <p className="mt-2 px-1 text-xs text-low">{hostHint}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {hostSections.map((section) => renderSectionButton(section.id))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="px-3 pt-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-low">
            {t('settings.layout.nav.accountSettings')}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {universalSections.map((section) => renderSectionButton(section.id))}
        </div>
      </div>
    </nav>
  );
}

function SettingsDialogContent({
  initialSection,
  initialState,
  onClose,
}: SettingsDialogContentProps) {
  const { t } = useTranslation('settings');
  const { isDirty } = useSettingsDirty();
  const { availableHosts, hostsResolved, selectedHost } = useSettingsHost();

  const resolvedInitialSection = useMemo<SettingsSectionType>(() => {
    if (
      initialSection &&
      SETTINGS_SECTION_DEFINITIONS.some(
        (section) => section.id === initialSection
      )
    ) {
      return initialSection;
    }

    return 'general';
  }, [availableHosts.length, hostsResolved, initialSection]);

  const [activeSection, setActiveSection] = useState<SettingsSectionType>(
    resolvedInitialSection
  );
  // On mobile, null means show the nav menu, a section means show that section
  const [mobileShowContent, setMobileShowContent] = useState<boolean>(
    initialSection === resolvedInitialSection
  );
  const isConfirmingRef = useRef(false);

  const handleCloseWithConfirmation = useCallback(async () => {
    if (isConfirmingRef.current) return;

    if (isDirty) {
      isConfirmingRef.current = true;
      try {
        const result = await ConfirmDialog.show({
          title: t('settings.unsavedChanges.title'),
          message: t('settings.unsavedChanges.message'),
          confirmText: t('settings.unsavedChanges.discard'),
          cancelText: t('settings.unsavedChanges.cancel'),
          variant: 'destructive',
        });
        if (result === 'confirmed') {
          onClose();
        }
      } finally {
        isConfirmingRef.current = false;
      }
    } else {
      onClose();
    }
  }, [isDirty, onClose, t]);

  const handleSectionSelect = (sectionId: SettingsSectionType) => {
    setActiveSection(sectionId);
    setMobileShowContent(true);
  };

  const handleMobileBack = () => {
    setMobileShowContent(false);
  };

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseWithConfirmation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCloseWithConfirmation]);

  return (
    <>
      {/* Overlay */}
      <div
        data-tauri-drag-region
        className="fixed inset-0 z-[9998] bg-black/50 animate-in fade-in-0 duration-200"
        onClick={handleCloseWithConfirmation}
      />
      {/* Dialog wrapper - handles positioning */}
      <div
        className={cn(
          'fixed z-[9999]',
          // Mobile: full screen
          'inset-0',
          // Desktop: centered with fixed size
          'md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2'
        )}
      >
        {/* Dialog content - handles animation */}
        <div
          className={cn(
            'h-full w-full flex overflow-hidden',
            'bg-panel/95 backdrop-blur-sm shadow-lg',
            'animate-in fade-in-0 slide-in-from-bottom-4 duration-200',
            // Mobile: full screen, no rounded corners
            'rounded-none border-0',
            // Desktop: fixed size with rounded corners
            'md:w-[900px] md:h-[700px] md:rounded-sm md:border md:border-border/50'
          )}
        >
          {/* Sidebar - hidden on mobile when showing content */}
          <div
            className={cn(
              'bg-secondary/80 border-r border-border flex flex-col',
              // Mobile: full width, hidden when showing content
              'w-full',
              mobileShowContent && 'hidden',
              // Desktop: fixed width sidebar, always visible
              'md:w-56 md:block'
            )}
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-high">
                {t('settings.layout.nav.title')}
              </h2>
              {/* Close button - mobile only */}
              <button
                onClick={handleCloseWithConfirmation}
                className="p-1 rounded-sm hover:bg-secondary text-low hover:text-normal md:hidden"
              >
                <XIcon className="size-icon-sm" weight="bold" />
              </button>
            </div>
            <SettingsDialogNavigation
              activeSection={activeSection}
              onSectionSelect={handleSectionSelect}
            />
          </div>
          {/* Content - hidden on mobile when showing nav */}
          <div
            className={cn(
              'flex-1 flex flex-col relative overflow-hidden',
              // Mobile: full width, hidden when showing nav
              !mobileShowContent && 'hidden',
              // Desktop: always visible
              'md:flex'
            )}
          >
            {/* Mobile header with back button */}
            <div className="flex items-center gap-2 p-3 border-b border-border md:hidden">
              <button
                onClick={handleMobileBack}
                className="p-1 rounded-sm hover:bg-secondary text-low hover:text-normal"
              >
                <CaretLeftIcon className="size-icon-sm" weight="bold" />
              </button>
              <span className="text-sm font-medium text-high">
                {t(`settings.layout.nav.${activeSection}`)}
              </span>
              <button
                onClick={handleCloseWithConfirmation}
                className="ml-auto p-1 rounded-sm hover:bg-secondary text-low hover:text-normal"
              >
                <XIcon className="size-icon-sm" weight="bold" />
              </button>
            </div>
            {/* Section content */}
            <div className="flex-1 overflow-y-auto">
              {isHostSpecificSettingsSection(activeSection) ? (
                selectedHost ? (
                  <SettingsMachineUserSystemProvider>
                    <SettingsSection
                      type={activeSection}
                      onClose={handleCloseWithConfirmation}
                      initialState={initialState}
                    />
                  </SettingsMachineUserSystemProvider>
                ) : !hostsResolved ? (
                  <div className="px-6 py-8 text-sm text-low">
                    {t('settings.general.loading')}
                  </div>
                ) : availableHosts.length > 0 ? (
                  <div className="px-6 py-8 text-sm text-low">
                    {t('settings.hostPicker.selectMachineHint')}
                  </div>
                ) : (
                  <div className="px-6 py-8 text-sm text-low">
                    {t('settings.hostPicker.noHostAvailable')}
                  </div>
                )
              ) : (
                <SettingsSection
                  type={activeSection}
                  onClose={handleCloseWithConfirmation}
                  initialState={initialState}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const SettingsDialogImpl = create<SettingsDialogProps>(
  ({ initialSection, initialState, initialHostId }) => {
    const modal = useModal();
    const handleClose = useCallback(() => {
      modal.hide();
      modal.resolve();
      modal.remove();
    }, [modal]);

    return createPortal(
      <SettingsDirtyProvider>
        <SettingsHostProvider initialHostId={initialHostId}>
          <SettingsDialogContent
            initialSection={initialSection}
            initialState={initialState}
            onClose={handleClose}
          />
        </SettingsHostProvider>
      </SettingsDirtyProvider>,
      document.body
    );
  }
);

export const SettingsDialog = defineModal<SettingsDialogProps | void, void>(
  SettingsDialogImpl
);
