import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { XIcon } from '@phosphor-icons/react';
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

  if (!container) return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9998] bg-black/50 animate-in fade-in-0 duration-200"
        onClick={handleClose}
      />
      {/* Dialog wrapper - handles positioning */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999]">
        {/* Dialog content - handles animation */}
        <div
          className={cn(
            'w-[800px] h-[600px] flex rounded-sm overflow-hidden',
            'bg-panel/95 backdrop-blur-sm border border-border/50 shadow-lg',
            'animate-in fade-in-0 slide-in-from-bottom-4 duration-200'
          )}
        >
          {/* Sidebar */}
          <div className="w-52 bg-secondary/80 border-r border-border/50 p-3 flex flex-col gap-1 overflow-y-auto">
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
          <div className="flex-1 p-6 flex flex-col relative overflow-y-auto">
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-panel transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
            >
              <XIcon className="h-4 w-4 text-normal" />
              <span className="sr-only">{t('close')}</span>
            </button>
            <h2 className="text-xl font-semibold text-high mb-4 pr-8">
              {t(`workspacesGuide.${selectedTopicId}.title`)}
            </h2>
            <img
              src={TOPIC_IMAGES[selectedTopicId]}
              alt={t(`workspacesGuide.${selectedTopicId}.title`)}
              className="w-full rounded-sm border border-border/30 mb-4"
            />
            <p className="text-normal text-sm leading-relaxed">
              {t(`workspacesGuide.${selectedTopicId}.content`)}
            </p>
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
