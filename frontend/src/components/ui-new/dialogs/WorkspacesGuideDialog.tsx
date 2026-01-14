import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { XIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal, type NoProps } from '@/lib/modals';
import { usePortalContainer } from '@/contexts/PortalContainerContext';
import { cn } from '@/lib/utils';

const TOPIC_IDS = [
  'welcome',
  'commandBar',
  'contextBar',
  'sidebar',
  'multiRepo',
  'sessions',
  'preview',
  'diffs',
  'classicUi',
] as const;

const TOPIC_IMAGES: Record<(typeof TOPIC_IDS)[number], string> = {
  welcome: '/guide-images/welcome.png',
  commandBar: '/guide-images/command-bar.png',
  contextBar: '/guide-images/context-bar.png',
  sidebar: '/guide-images/sidebar.png',
  multiRepo: '/guide-images/multi-repo.png',
  sessions: '/guide-images/sessions.png',
  preview: '/guide-images/preview.png',
  diffs: '/guide-images/diffs.png',
  classicUi: '/guide-images/classic-ui.png',
};

const WorkspacesGuideDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const container = usePortalContainer();
  const { t } = useTranslation('common');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedTopicId = TOPIC_IDS[selectedIndex];

  const handleClose = useCallback(() => {
    modal.hide();
    modal.resolve();
    modal.remove();
  }, [modal]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  const goToPrevious = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : TOPIC_IDS.length - 1));
  }, []);

  const goToNext = useCallback(() => {
    setSelectedIndex((prev) => (prev < TOPIC_IDS.length - 1 ? prev + 1 : 0));
  }, []);

  if (!container) return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9998] bg-black/50 animate-in fade-in-0 duration-200"
        onClick={handleClose}
      />
      {/* Dialog wrapper - handles positioning */}
      <div className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-[9999] flex items-center justify-center">
        {/* Dialog content - handles animation */}
        <div
          className={cn(
            'w-full h-full sm:w-[800px] sm:h-[600px] sm:max-h-[90vh] flex flex-col sm:flex-row rounded-sm overflow-hidden',
            'bg-panel/95 backdrop-blur-sm border border-border/50 shadow-lg',
            'animate-in fade-in-0 slide-in-from-bottom-4 duration-200'
          )}
        >
          {/* Sidebar - hidden on mobile, visible on sm+ */}
          <div className="hidden sm:flex w-52 bg-secondary/80 border-r border-border/50 p-3 flex-col gap-1 overflow-y-auto shrink-0">
            {TOPIC_IDS.map((topicId, idx) => (
              <button
                key={topicId}
                onClick={() => setSelectedIndex(idx)}
                className={cn(
                  'text-left px-3 py-2 rounded-sm text-sm transition-colors',
                  idx === selectedIndex
                    ? 'bg-brand/10 text-brand font-medium'
                    : 'text-normal hover:bg-primary/10'
                )}
              >
                {t(`workspacesGuide.${topicId}.title`)}
              </button>
            ))}
          </div>
          {/* Content */}
          <div className="flex-1 p-4 sm:p-6 flex flex-col relative overflow-y-auto min-h-0">
            <button
              onClick={handleClose}
              className="absolute right-3 top-3 sm:right-4 sm:top-4 rounded-sm opacity-70 ring-offset-panel transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 z-10"
            >
              <XIcon className="h-5 w-5 sm:h-4 sm:w-4 text-normal" />
              <span className="sr-only">{t('close')}</span>
            </button>
            <h2 className="text-lg sm:text-xl font-semibold text-high mb-3 sm:mb-4 pr-10">
              {t(`workspacesGuide.${selectedTopicId}.title`)}
            </h2>
            <img
              src={TOPIC_IMAGES[selectedTopicId]}
              alt={t(`workspacesGuide.${selectedTopicId}.title`)}
              className="w-full rounded-sm border border-border/30 mb-3 sm:mb-4"
            />
            <p className="text-normal text-sm leading-relaxed flex-1">
              {t(`workspacesGuide.${selectedTopicId}.content`)}
            </p>
            {/* Mobile navigation - visible only on mobile */}
            <div className="flex sm:hidden items-center justify-between mt-4 pt-4 border-t border-border/30">
              <button
                onClick={goToPrevious}
                className="flex items-center gap-1 px-3 py-2 rounded-sm text-sm text-normal hover:bg-primary/10 transition-colors"
              >
                <CaretLeftIcon className="h-4 w-4" />
                {t('workspacesGuide.previous')}
              </button>
              <span className="text-xs text-muted">
                {selectedIndex + 1} / {TOPIC_IDS.length}
              </span>
              <button
                onClick={goToNext}
                className="flex items-center gap-1 px-3 py-2 rounded-sm text-sm text-normal hover:bg-primary/10 transition-colors"
              >
                {t('workspacesGuide.next')}
                <CaretRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    container
  );
});

export const WorkspacesGuideDialog = defineModal<void, void>(
  WorkspacesGuideDialogImpl
);
