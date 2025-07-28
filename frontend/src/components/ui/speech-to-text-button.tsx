import { useState, useEffect } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';
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
  language?: string;
}

export function SpeechToTextButton({
  onTranscript,
  disabled = false,
  className = '',
  language,
}: SpeechToTextButtonProps) {
  const [accumulatedText, setAccumulatedText] = useState('');
  
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

  // Handle transcript updates
  useEffect(() => {
    if (transcript && transcript !== accumulatedText) {
      setAccumulatedText(transcript);
      onTranscript(transcript);
    }
  }, [transcript, accumulatedText, onTranscript]);

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
              <p className="text-xs mt-1">
                Speech recognition requires Chrome or other browsers with Web Speech API support.
              </p>
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
            disabled={disabled}
            className={`${className} ${isListening ? 'bg-red-600 hover:bg-red-700 text-white' : 'hover:bg-muted'}`}
          >
            {isListening ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p>
              {isListening 
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