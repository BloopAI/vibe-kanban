import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface OnboardingStage {
  video?: string;
  title: string;
  description: string;
}

const ONBOARDING_STAGES: OnboardingStage[] = [
  {
    video: 'https://vkcdn.britannio.dev/vk-parallel-tasks-2.mp4',
    title: 'Send Follow-ups',
    description:
      'Communicate with the AI agent directly from the task panel. Ask questions, request changes, and provide additional context to guide task execution.',
  },
  {
    video: 'https://vkcdn.britannio.dev/vk-parallel-tasks-2.mp4',
    title: 'Code Review',
    description:
      'Review code changes in-context with detailed diffs and file comparisons. Leave comments and suggestions to improve the quality of generated code.',
  },
  {
    video: 'https://vkcdn.britannio.dev/vk-parallel-tasks-2.mp4',
    title: 'Git Actions',
    description:
      'Manage branches, commits, and pull requests without leaving the task panel. Create, merge, and switch branches with a single click.',
  },
  {
    video: 'https://vkcdn.britannio.dev/vk-parallel-tasks-2.mp4',
    title: 'Live Previews',
    description:
      'See your changes in real-time with integrated preview panels. Test and validate UI changes instantly before committing them.',
  },
  {
    video: 'https://vkcdn.britannio.dev/vk-parallel-tasks-2.mp4',
    title: 'VK Companion',
    description:
      'Your AI pair programming assistant is always available in the sidebar. Get instant help, explanations, and suggestions while working on tasks.',
  },
];

interface TaskPanelOnboardingProps {
  isOpen: boolean;
}

export function TaskPanelOnboarding({ isOpen }: TaskPanelOnboardingProps) {
  const [currentStage, setCurrentStage] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const stage = ONBOARDING_STAGES[currentStage];
  const totalStages = ONBOARDING_STAGES.length;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [currentStage]);

  const handleNext = () => {
    if (currentStage < totalStages - 1) {
      setCurrentStage((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStage > 0) {
      setCurrentStage((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    console.log('Skip onboarding');
  };

  const handleClose = () => {
    console.log('Close onboarding');
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
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
            className="fixed bottom-8 left-[16.66%] w-2/3 bg-card border border-border rounded-lg shadow-2xl overflow-hidden z-[9999]"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStage}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {stage.video && (
                  <div className="w-full bg-muted aspect-video">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    >
                      <source src={stage.video} type="video/mp4" />
                    </video>
                  </div>
                )}

                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground">
                        {stage.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      {currentStage + 1} / {totalStages}
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {stage.description}
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

                  <div className="flex justify-end gap-2 pt-2">
                  {currentStage > 0 && (
                  <button
                  onClick={handlePrevious}
                  className="h-10 px-4 py-2 inline-flex items-center justify-center gap-2 text-sm font-medium border border-input hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                  <ChevronLeft className="h-4 w-4" />
                    Previous
                    </button>
                  )}
                  <button
                  onClick={handleNext}
                    className="h-10 px-4 py-2 inline-flex items-center justify-center gap-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 border border-foreground transition-colors"
                  >
                    {currentStage === totalStages - 1 ? 'Finish' : 'Next'}
                      <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
