import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { useKeyExit, Scope } from '@/keyboard';
import { ShowcaseStageMedia } from './ShowcaseStageMedia';
import type { ShowcaseConfig } from '@/types/showcase';

interface FeatureShowcaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ShowcaseConfig;
}

/**
 * FeatureShowcaseModal - Generic multi-stage modal for showcasing features with media
 *
 * Displays a bottom-aligned modal with stages containing videos or images, title, description,
 * and navigation controls. Properly manages keyboard shortcuts (ESC captured but disabled)
 * and scopes to prevent closing underlying features.
 *
 * Features:
 * - Multi-stage or single-stage support (hides navigation if 1 stage)
 * - Video support with loading states and progress bars
 * - Image support with loading skeleton
 * - Responsive design (full-width on mobile, 2/3 width on desktop)
 * - i18n support via translation keys
 * - Smooth transitions between stages
 *
 * @param isOpen - Controls modal visibility
 * @param onClose - Called when user finishes the showcase (via Finish button on last stage)
 * @param config - ShowcaseConfig object defining stages, media, and translation keys
 */
export function FeatureShowcaseModal({
  isOpen,
  onClose,
  config,
}: FeatureShowcaseModalProps) {
  const [currentStage, setCurrentStage] = useState(0);
  const { t } = useTranslation('tasks');
  const { enableScope, disableScope, activeScopes } = useHotkeysContext();
  const previousScopesRef = useRef<string[]>([]);

  const stage = config.stages[currentStage];
  const totalStages = config.stages.length;

  /**
   * Scope management for keyboard shortcuts:
   * When showcase opens, we capture all currently active scopes, disable them,
   * and enable only DIALOG scope. This ensures ESC key presses are captured by
   * our showcase handler (which does nothing) instead of triggering underlying
   * close handlers. When closing, we restore the original scopes.
   */
  useEffect(() => {
    if (isOpen) {
      previousScopesRef.current = activeScopes;
      activeScopes.forEach((scope) => disableScope(scope));
      enableScope(Scope.DIALOG);
    } else {
      disableScope(Scope.DIALOG);
      previousScopesRef.current.forEach((scope) => enableScope(scope));
    }

    return () => {
      disableScope(Scope.DIALOG);
      previousScopesRef.current.forEach((scope) => enableScope(scope));
    };
    // activeScopes intentionally omitted - we only capture on open, not on every scope change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, enableScope, disableScope]);

  useKeyExit(
    (e) => {
      e?.preventDefault();
    },
    { scope: Scope.DIALOG, enabled: isOpen }
  );

  const handleNext = () => {
    if (currentStage < totalStages - 1) {
      setCurrentStage((prev) => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrevious = () => {
    if (currentStage > 0) {
      setCurrentStage((prev) => prev - 1);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[9998]"
          />
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
            className="fixed bottom-4 left-0 right-0 mx-4 w-auto xl:bottom-8 xl:left-0 xl:right-0 xl:mx-auto xl:w-full xl:max-w-[min(66.66vw,calc((100svh-20rem)*1.6))] bg-card border border-border rounded-lg shadow-2xl overflow-hidden z-[9999]"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStage}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <ShowcaseStageMedia media={stage.media} />

                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground">
                        {t(stage.titleKey)}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      {currentStage + 1} / {totalStages}
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(stage.descriptionKey)}
                  </p>

                  <div className="flex items-center gap-2">
                    {Array.from({ length: totalStages }).map((_, index) => (
                      <div
                        key={index}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          index === currentStage ? 'bg-primary' : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>

                  {totalStages > 1 && (
                    <div className="flex justify-end gap-2 pt-2">
                      {currentStage > 0 && (
                        <button
                          onClick={handlePrevious}
                          className="h-10 px-4 py-2 inline-flex items-center justify-center gap-2 text-sm font-medium border border-input hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          {t('showcases.buttons.previous')}
                        </button>
                      )}
                      <button
                        onClick={handleNext}
                        className="h-10 px-4 py-2 inline-flex items-center justify-center gap-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 border border-foreground transition-colors"
                      >
                        {currentStage === totalStages - 1
                          ? t('showcases.buttons.finish')
                          : t('showcases.buttons.next')}
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
