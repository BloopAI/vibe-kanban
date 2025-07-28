import { useState, useEffect } from 'react';
import { Mic, MicOff, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SpeechToTextButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  taskType?: 'title' | 'description';
  language?: string;
}

export function SpeechToTextButton({
  onTranscript,
  disabled = false,
  className = '',
  taskType,
  language,
}: SpeechToTextButtonProps) {
  const [accumulatedText, setAccumulatedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Helper function to get better language detection (for supported browsers only)
  const getPreferredLanguage = () => {
    if (language) {
      return language;
    }
    
    // Check for German language preference in user's languages
    const navLangs = navigator.languages || [navigator.language];
    
    // Look for German language variants and prioritize them
    const germanVariants = ['de', 'de-DE', 'de-AT', 'de-CH'];
    const foundGerman = navLangs.find(lang => 
      germanVariants.some(variant => lang.startsWith(variant))
    );
    
    if (foundGerman) {
      return 'de-DE'; // Use standardized German for better recognition
    }
    
    // Default to first language preference or fallback
    return navLangs[0] || 'en-US';
  };

  const {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    start,
    stop,
    reset,
  } = useSpeechToText({
    continuous: true,
    interimResults: true,
    language: getPreferredLanguage(),
  });

  // Process speech with Anthropic API
  const processSpeech = async (rawTranscript: string) => {
    if (!taskType) {
      onTranscript(rawTranscript);
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/process-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: rawTranscript,
          task_type: taskType,
          language: getPreferredLanguage(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        onTranscript(data.data.enhanced_text);
      } else {
        // Fallback to raw transcript if API fails
        onTranscript(rawTranscript);
      }
    } catch (error) {
      // Fallback to raw transcript if API fails
      onTranscript(rawTranscript);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle transcript updates
  useEffect(() => {
    if (transcript && transcript !== accumulatedText) {
      setAccumulatedText(transcript);
      processSpeech(transcript);
    }
  }, [transcript, accumulatedText]);

  const handleToggle = () => {
    if (isListening) {
      stop();
    } else {
      reset();
      setAccumulatedText('');
      start();
    }
  };

  if (!isSupported) {
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled
              className={`${className} opacity-50`}
            >
              <AlertCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="max-w-xs">
              <p className="font-medium">Speech recognition not available</p>
              {isFirefox ? (
                <p className="text-xs mt-1">
                  Firefox requires experimental features enabled. Use Chrome, Safari, or Edge for full speech support.
                </p>
              ) : (
                <p className="text-xs mt-1">
                  This browser doesn't support speech recognition. Try Chrome, Safari, or Edge.
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isListening ? "default" : "ghost"}
            size="sm"
            onClick={handleToggle}
            disabled={disabled || isProcessing}
            className={`${className} ${isListening ? 'bg-red-600 hover:bg-red-700 text-white' : 'hover:bg-muted'}`}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isListening ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p>
              {isProcessing
                ? 'Processing speech with AI...'
                : isListening 
                ? 'Click to stop recording' 
                : 'Click to start voice input'
              }
            </p>
            <p className="text-xs text-muted-foreground">
              Language: {getPreferredLanguage()}
            </p>
            {error && (
              <p className="text-red-500 text-xs max-w-xs">{error}</p>
            )}
            {interimTranscript && (
              <p className="text-xs text-muted-foreground max-w-xs">
                "{interimTranscript}"
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}