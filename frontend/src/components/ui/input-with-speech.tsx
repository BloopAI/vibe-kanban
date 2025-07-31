import * as React from 'react';
import { cn } from '@/lib/utils';
import { SpeechToTextButton } from './speech-to-text-button';
import { useSpeechToText } from '@/hooks/useSpeechToText';

export interface InputWithSpeechProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onSpeechTranscript?: (text: string) => void;
  speechDisabled?: boolean;
  speechLanguage?: string;
  showSpeechButton?: boolean;
}

const InputWithSpeech = React.forwardRef<HTMLInputElement, InputWithSpeechProps>(
  ({ 
    className, 
    type, 
    onSpeechTranscript,
    speechDisabled = false,
    speechLanguage,
    showSpeechButton = true,
    ...props 
  }, ref) => {
    // Check if speech is supported in the browser
    const { isSupported } = useSpeechToText();
    const shouldShowSpeechButton = showSpeechButton && onSpeechTranscript && isSupported;
    
    return (
      <div className="relative">
        <input
          type={type}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            shouldShowSpeechButton && 'pr-12', // Add right padding for speech button
            className
          )}
          ref={ref}
          {...props}
        />
        {shouldShowSpeechButton && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <SpeechToTextButton
              onTranscript={onSpeechTranscript}
              disabled={speechDisabled || props.disabled}
              language={speechLanguage}
              className="h-6 w-6 p-1"
            />
          </div>
        )}
      </div>
    );
  }
);
InputWithSpeech.displayName = 'InputWithSpeech';

export { InputWithSpeech };