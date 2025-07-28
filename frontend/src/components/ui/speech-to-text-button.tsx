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
}

export function SpeechToTextButton({
  onTranscript,
  disabled = false,
  className = '',
  taskType,
}: SpeechToTextButtonProps) {
  const [accumulatedText, setAccumulatedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
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
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled
              className={`${className} opacity-50`}
            >
              <AlertCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Speech recognition not supported in this browser</p>
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
            variant={isListening ? "default" : "outline"}
            size="sm"
            onClick={handleToggle}
            disabled={disabled || isProcessing}
            className={`${className} ${isListening ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
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
            {error && (
              <p className="text-red-500 text-xs">{error}</p>
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