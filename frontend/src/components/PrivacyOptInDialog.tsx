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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PrivacyOptInDialogProps {
  open: boolean;
  onComplete: (telemetryEnabled: boolean) => void;
}

export function PrivacyOptInDialog({ open, onComplete }: PrivacyOptInDialogProps) {
  const handleOptIn = () => {
    onComplete(true);
  };

  const handleOptOut = () => {
    onComplete(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <DialogTitle>Privacy & Telemetry</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Help us improve Vibe Kanban by sharing anonymous usage data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What data do we collect?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">High-level usage metrics</p>
                  <p className="text-sm text-muted-foreground">
                    Number of tasks created, projects managed, and feature usage patterns
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">Performance and error data</p>
                  <p className="text-sm text-muted-foreground">
                    Application crashes, response times, and technical issues
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">We do NOT collect</p>
                  <p className="text-sm text-muted-foreground">
                    Task contents, code snippets, project names, or any personal data
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Why does this help?</CardTitle>
              <CardDescription>
                Your anonymous usage data helps us understand how Vibe Kanban is used
                and prioritize improvements that matter most to our users.
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <Settings className="h-4 w-4 flex-shrink-0" />
            <span>
              You can change this preference at any time in Settings → Privacy
            </span>
          </div>
        </div>

        <DialogFooter className="gap-3 flex-col sm:flex-row">
          <Button
            variant="outline"
            onClick={handleOptOut}
            className="flex-1"
          >
            <XCircle className="h-4 w-4 mr-2" />
            No thanks
          </Button>
          <Button
            onClick={handleOptIn}
            className="flex-1"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Yes, help improve Vibe Kanban
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
