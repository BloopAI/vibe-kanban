import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal, type NoProps } from '@/lib/modals';
import { usePortalContainer } from '@/contexts/PortalContainerContext';
import {
  GuideDialogShell,
  type GuideDialogTopic,
} from '@/components/ui-new/dialogs/GuideDialogShell';

const TOPIC_IDS = [
  'welcome',
  'commandBar',
  'contextBar',
  'sidebar',
  'multiRepo',
  'sessions',
  'preview',
  'diffs',
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
};

const WorkspacesGuideDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const container = usePortalContainer();
  const { t } = useTranslation('common');
  const topics: GuideDialogTopic[] = TOPIC_IDS.map((topicId) => ({
    id: topicId,
    title: t(`workspacesGuide.${topicId}.title`),
    content: t(`workspacesGuide.${topicId}.content`),
    imageSrc: TOPIC_IMAGES[topicId],
  }));

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
    <GuideDialogShell
      topics={topics}
      closeLabel={t('buttons.close')}
      onClose={handleClose}
    />,
    container
  );
});

export const WorkspacesGuideDialog = defineModal<void, void>(
  WorkspacesGuideDialogImpl
);
