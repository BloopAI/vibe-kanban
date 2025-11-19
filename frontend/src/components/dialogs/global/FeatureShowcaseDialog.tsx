import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ShowcaseStageMedia } from '@/components/showcase/ShowcaseStageMedia';
import type { ShowcaseConfig } from '@/types/showcase';

interface FeatureShowcaseDialogProps {
  config: ShowcaseConfig;
}

/**
 * FeatureShowcaseDialog - Generic multi-stage modal for showcasing features with media
 *
 * Displays a modal with stages containing videos or images, title, description,
 * and navigation controls. ESC key is disabled; only Next/Finish buttons dismiss.
 *
 * Features:
 * - Multi-stage or single-stage support (hides navigation if 1 stage)
 * - Video support with loading states and progress bars
 * - Image support with loading skeleton
 * - Responsive design (full-width on mobile, 2/3 width on desktop)
 * - i18n support via translation keys
 * - Smooth transitions between stages
 *
 * Usage:
 * ```ts
 * FeatureShowcaseDialog.show({ config: showcases.taskPanel });
 * ```
 */
const FeatureShowcaseDialogImpl = NiceModal.create<FeatureShowcaseDialogProps>(
  ({ config }: FeatureShowcaseDialogProps) => {
    const modal = useModal();
    const [currentStage, setCurrentStage] = useState(0);
    const { t } = useTranslation('tasks');

    const stage = config.stages[currentStage];
    const totalStages = config.stages.length;

    const handleNext = () => {
      setCurrentStage((prev) => {
        if (prev >= totalStages - 1) {
          modal.resolve();
          return prev;
        }
        return prev + 1;
      });
    };

    const handlePrevious = () => {
      setCurrentStage((prev) => Math.max(prev - 1, 0));
    };

    const handleClose = () => {
      modal.hide();
      modal.resolve();
      modal.remove();
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => {
          if (!open) {
            handleClose();
          }
        }}
        uncloseable
        className="max-w-none xl:max-w-[min(66.66vw,calc((100svh-20rem)*1.6))] p-0 overflow-hidden"
      >
        <DialogContent className="p-0 gap-0">
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
        </DialogContent>
      </Dialog>
    );
  }
);

export const FeatureShowcaseDialog = defineModal<
  FeatureShowcaseDialogProps,
  void
>(FeatureShowcaseDialogImpl);
