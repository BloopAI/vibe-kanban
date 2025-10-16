import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
                  <div className="w-full bg-muted">
                    <video
                      ref={videoRef}
                      className="w-full h-auto"
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
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-semibold text-foreground">
                      {stage.title}
                    </h3>
                    <button
                      onClick={handleClose}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Close onboarding"
                    >
                      ✕
                    </button>
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {stage.description}
                  </p>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex gap-1">
                      {Array.from({ length: totalStages }).map((_, index) => (
                        <span
                          key={index}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            index === currentStage ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                    <span>
                      Step {currentStage + 1} of {totalStages}
                    </span>
                  </div>

                  <div className="flex justify-between gap-2 pt-2">
                    <button
                      onClick={handleSkip}
                      className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Skip
                    </button>
                    <div className="flex gap-2">
                      {currentStage > 0 && (
                        <button
                          onClick={handlePrevious}
                          className="px-3 py-1.5 text-sm border border-border rounded hover:bg-muted transition-colors"
                        >
                          Previous
                        </button>
                      )}
                      <button
                        onClick={handleNext}
                        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                      >
                        {currentStage === totalStages - 1 ? 'Finish' : 'Next'}
                      </button>
                    </div>
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
