import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Shield, CheckCircle, XCircle, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfig } from '@/components/config-provider';

interface PrivacyOptInDialogProps {
  open: boolean;
  onComplete: (telemetryEnabled: boolean) => void;
}

export function PrivacyOptInDialog({
  open,
  onComplete,
}: PrivacyOptInDialogProps) {
  const { config } = useConfig();

  // Check if user is authenticated with GitHub
  const isGitHubAuthenticated =
    config?.github?.username && config?.github?.token;

  const handleOptIn = () => {
    onComplete(true);
  };

  const handleOptOut = () => {
    onComplete(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <DialogTitle>Feedback Opt-In</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-1">
            Help us improve Vibe Kanban by sharing usage data and allowing us to
            contact you if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                What data do we collect?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {isGitHubAuthenticated && (
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      GitHub profile information
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Username and email address to send you only very important
                      updates about the project. We promise not to abuse this
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    High-level usage metrics
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Number of tasks created, projects managed, feature usage
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Performance and error data
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Application crashes, response times, technical issues
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">We do NOT collect</p>
                  <p className="text-xs text-muted-foreground">
                    Task contents, code snippets, project names, or other
                    personal data
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
            <Settings className="h-3 w-3 flex-shrink-0" />
            <span>
              This helps us prioritize improvements. You can change this
              preference anytime in Settings.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-3 flex-col sm:flex-row pt-2">
          <Button variant="outline" onClick={handleOptOut} className="flex-1">
            <XCircle className="h-4 w-4 mr-2" />
            No thanks
          </Button>
          <Button onClick={handleOptIn} className="flex-1">
            <CheckCircle className="h-4 w-4 mr-2" />
            Yes, help improve Vibe Kanban
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
