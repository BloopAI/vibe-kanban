type ProgressIndicatorProps = {
  currentStep: number;
  totalSteps: number;
};

export function ProgressIndicator({ currentStep, totalSteps }: ProgressIndicatorProps) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);
  
  return (
    <div className="flex items-center justify-center mb-4">
      <div className="flex items-center space-x-2">
        {steps.map((stepNumber, index) => {
          const isCompleted = currentStep > stepNumber;
          const isCurrent = currentStep === stepNumber;
          
          return (
            <>
              <div
                key={stepNumber}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground border-primary'
                    : isCompleted
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-transparent text-muted-foreground border-muted-foreground'
                }`}
              >
                {isCompleted ? '✓' : stepNumber}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-6 h-0.5 ${isCompleted ? 'bg-green-500' : 'bg-muted'}`}
                />
              )}
            </>
          );
        })}
      </div>
    </div>
  );
}
