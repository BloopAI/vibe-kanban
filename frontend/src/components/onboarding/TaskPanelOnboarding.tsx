import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TaskPanelOnboardingProps {
  isOpen: boolean;
}

export function TaskPanelOnboarding({ isOpen }: TaskPanelOnboardingProps) {
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const handleElement = document.getElementById('handle-kr');
      if (handleElement) {
        const rect = handleElement.getBoundingClientRect();
        setPosition({
          top: rect.top + rect.height / 2,
          right: window.innerWidth - rect.left + 20,
        });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    
    const observer = new MutationObserver(updatePosition);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });

    return () => {
      window.removeEventListener('resize', updatePosition);
      observer.disconnect();
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
          style={{
            position: 'fixed',
            top: position.top,
            right: position.right,
            transform: 'translateY(-50%)',
            zIndex: 9999,
          }}
          className="w-80 bg-card border border-border rounded-lg shadow-lg p-6"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                Welcome to Task Details
              </h3>
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close onboarding"
              >
                ✕
              </button>
            </div>
            
            <p className="text-sm text-muted-foreground">
              This is your task details panel. Here you can view task information,
              track progress, and manage task attempts.
            </p>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="w-2 h-2 rounded-full bg-muted" />
                <span className="w-2 h-2 rounded-full bg-muted" />
              </div>
              <span>Step 1 of 3</span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                Skip
              </button>
              <button className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors">
                Next
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
