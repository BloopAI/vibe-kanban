import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { attemptsApi } from '@/lib/api';
import type { GhCliSetupError } from 'shared/types';
import { useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

interface GhCliSetupDialogProps {
  attemptId: string;
}

export type GhCliSupportVariant = 'homebrew' | 'manual';

export interface GhCliSupportContent {
  message: string;
  variant: GhCliSupportVariant | null;
}

export const mapGhCliErrorToUi = (
  error: GhCliSetupError | null,
  fallbackMessage: string
): GhCliSupportContent => {
  if (!error) {
    return { message: fallbackMessage, variant: null };
  }

  if (error === 'BREW_MISSING') {
    return {
      message:
        'Homebrew is not installed. Install it to enable automatic setup.',
      variant: 'homebrew',
    };
  }

  if (error === 'SETUP_HELPER_NOT_SUPPORTED') {
    return {
      message:
        'Automatic setup is not supported on this platform. Install GitHub CLI manually.',
      variant: 'manual',
    };
  }

  if (typeof error === 'object' && 'OTHER' in error) {
    return {
      message: error.OTHER.message || fallbackMessage,
      variant: null,
    };
  }

  return { message: fallbackMessage, variant: null };
};

export const GhCliHelpInstructions = ({
  variant,
}: {
  variant: GhCliSupportVariant;
}) => {
  if (variant === 'homebrew') {
    return (
      <div className="space-y-2 text-sm">
        <p>
          Automatic installation requires Homebrew. Install Homebrew from{' '}
          <a
            href="https://brew.sh/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            brew.sh
          </a>{' '}
          and then rerun the setup. Alternatively, install GitHub CLI manually
          with:
        </p>
        <pre className="rounded bg-muted px-2 py-1 text-xs">
          brew install gh
        </pre>
        <p>
          After installation, authenticate with:
          <br />
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            gh auth login --web --git-protocol https
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p>
        Install GitHub CLI from the{' '}
        <a
          href="https://cli.github.com/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          official documentation
        </a>{' '}
        and then authenticate with your GitHub account.
      </p>
      <pre className="rounded bg-muted px-2 py-1 text-xs">
        gh auth login --web --git-protocol https
      </pre>
    </div>
  );
};

export const GhCliSetupDialog = NiceModal.create<GhCliSetupDialogProps>(
  ({ attemptId }) => {
    const modal = useModal();
    const [isRunning, setIsRunning] = useState(false);
    const [errorInfo, setErrorInfo] = useState<{
      error: GhCliSetupError;
      message: string;
      variant: GhCliSupportVariant | null;
    } | null>(null);
    const pendingResultRef = useRef<GhCliSetupError | null>(null);
    const hasResolvedRef = useRef(false);

    const handleRunSetup = async () => {
      setIsRunning(true);
      setErrorInfo(null);
      pendingResultRef.current = null;

      try {
        await attemptsApi.setupGhCli(attemptId);
        hasResolvedRef.current = true;
        modal.resolve(null);
        modal.hide();
      } catch (err: any) {
        const rawMessage =
          typeof err?.message === 'string'
            ? err.message
            : 'Failed to run GitHub CLI setup.';

        const errorData = err?.error_data as GhCliSetupError | undefined;
        const resolvedError: GhCliSetupError = errorData ?? {
          OTHER: { message: rawMessage },
        };
        const ui = mapGhCliErrorToUi(resolvedError, rawMessage);

        pendingResultRef.current = resolvedError;
        setErrorInfo({
          error: resolvedError,
          message: ui.message,
          variant: ui.variant,
        });
      } finally {
        setIsRunning(false);
      }
    };

    const handleClose = () => {
      if (!hasResolvedRef.current) {
        modal.resolve(pendingResultRef.current);
      }
      modal.hide();
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && handleClose()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>GitHub CLI Setup</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>
              GitHub CLI authentication is required to create pull requests and
              interact with GitHub repositories.
            </p>

            <div className="space-y-2">
              <p className="text-sm">This setup will:</p>
              <ol className="text-sm list-decimal list-inside space-y-1 ml-2">
                <li>Check if GitHub CLI (gh) is installed</li>
                <li>Install it via Homebrew if needed (macOS)</li>
                <li>Authenticate with GitHub using OAuth</li>
              </ol>
              <p className="text-sm text-muted-foreground mt-4">
                The setup will run in the chat window. You'll need to complete
                the authentication in your browser.
              </p>
            </div>
            {errorInfo && (
              <Alert variant="destructive">
                <AlertDescription className="space-y-2">
                  <p>{errorInfo.message}</p>
                  {errorInfo.variant && (
                    <GhCliHelpInstructions variant={errorInfo.variant} />
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleRunSetup} disabled={isRunning}>
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                'Run Setup'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isRunning}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
