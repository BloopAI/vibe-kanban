import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from './AuthProvider';

interface GitHubLoginDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export function GitHubLoginDialog({ isOpen, onOpenChange }: GitHubLoginDialogProps) {
  const [step, setStep] = useState<'initial' | 'device-code' | 'polling'>('initial');
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { } = useAuth(); // TODO: Use login once backend is ready

  const startDeviceFlow = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // TODO: Replace with actual API call to backend auth endpoint
      // const response = await authApi.startDeviceFlow();
      
      // Mock response for development
      const mockResponse: DeviceCodeResponse = {
        device_code: 'mock_device_code',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      };
      
      setDeviceCode(mockResponse);
      setStep('device-code');
      
      // Start polling for completion
      startPolling(mockResponse);
    } catch (err) {
      console.error('Failed to start device flow:', err);
      setError('Failed to start GitHub login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const startPolling = async (_deviceCodeData: DeviceCodeResponse) => {
    setStep('polling');
    
    // TODO: Implement actual polling logic
    // const pollInterval = setInterval(async () => {
    //   try {
    //     const result = await authApi.pollDeviceCode(deviceCodeData.device_code);
    //     if (result.access_token) {
    //       clearInterval(pollInterval);
    //       await login(result.access_token);
    //       onOpenChange(false);
    //       setStep('initial');
    //       setDeviceCode(null);
    //     }
    //   } catch (error) {
    //     // Handle polling errors
    //   }
    // }, deviceCodeData.interval * 1000);
    
    // Mock successful login after 3 seconds
    setTimeout(() => {
      // login('mock_token');
      onOpenChange(false);
      setStep('initial');
      setDeviceCode(null);
    }, 3000);
  };

  const copyUserCode = () => {
    if (deviceCode?.user_code) {
      navigator.clipboard.writeText(deviceCode.user_code);
    }
  };

  const openGitHub = () => {
    if (deviceCode?.verification_uri) {
      window.open(deviceCode.verification_uri, '_blank');
    }
  };

  const handleClose = () => {
    setStep('initial');
    setDeviceCode(null);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Sign in with GitHub</DialogTitle>
          <DialogDescription>
            Connect your GitHub account to collaborate with your team
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'initial' && (
            <>
              <p className="text-sm text-muted-foreground">
                Sign in to assign tasks, track contributions, and get proper git attribution.
              </p>
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                  {error}
                </div>
              )}
              <Button 
                onClick={startDeviceFlow} 
                disabled={isLoading} 
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Sign in with GitHub'
                )}
              </Button>
            </>
          )}

          {step === 'device-code' && deviceCode && (
            <>
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Copy this code and paste it on GitHub:
                </p>
                
                <div className="flex items-center justify-center gap-2">
                  <Badge variant="outline" className="text-lg font-mono px-4 py-2">
                    {deviceCode.user_code}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyUserCode}
                    className="h-8 w-8 p-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <Button onClick={openGitHub} className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open GitHub
                </Button>
              </div>
            </>
          )}

          {step === 'polling' && (
            <div className="text-center space-y-4">
              <Loader2 className="mx-auto h-8 w-8 animate-spin" />
              <p className="text-sm text-muted-foreground">
                Waiting for GitHub authentication...
              </p>
              <p className="text-xs text-muted-foreground">
                Complete the authorization on GitHub to continue
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}