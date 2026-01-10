import { CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SetupCompleteProps {
  workspaceName: string;
  onFinish: () => void;
}

export function SetupComplete({ workspaceName, onFinish }: SetupCompleteProps) {
  return (
    <div className="text-center py-12 space-y-8">
      {/* Success icon */}
      <div className="flex justify-center">
        <div className="relative">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
          <div className="absolute -right-1 -top-1">
            <Sparkles className="h-6 w-6 text-yellow-500" />
          </div>
        </div>
      </div>

      {/* Success message */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">
          Welcome to {workspaceName}!
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your workspace is ready. You can start creating tasks, organizing projects,
          and collaborating with your team.
        </p>
      </div>

      {/* Next steps */}
      <div className="bg-muted/50 rounded-lg p-6 max-w-md mx-auto text-left space-y-4">
        <h3 className="font-semibold">Next Steps</h3>
        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
              1
            </span>
            <span>Create your first project to organize tasks</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
              2
            </span>
            <span>Add team members to collaborate together</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
              3
            </span>
            <span>Start creating and managing tasks</span>
          </li>
        </ul>
      </div>

      {/* Finish button */}
      <Button size="lg" onClick={onFinish} className="px-8">
        Go to Workspace
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}
