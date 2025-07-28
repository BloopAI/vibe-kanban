import { useState } from 'react';
import { InputWithSpeech } from './input-with-speech';
import { FileSearchTextareaWithSpeech } from './file-search-textarea-with-speech';

// Demo component to test the integrated speech functionality
export function SpeechIntegrationDemo() {
  const [inputValue, setInputValue] = useState('');
  const [textareaValue, setTextareaValue] = useState('');

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Speech Integration Demo</h2>
      
      <div>
        <label className="block text-sm font-medium mb-2">
          Input with integrated speech button:
        </label>
        <InputWithSpeech
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onSpeechTranscript={(text) => setInputValue(text)}
          placeholder="Type or speak your text here..."
          speechTaskType="title"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Textarea with integrated speech button:
        </label>
        <FileSearchTextareaWithSpeech
          value={textareaValue}
          onChange={setTextareaValue}
          onSpeechTranscript={(text) => setTextareaValue(text)}
          placeholder="Type @ to search files or use the microphone..."
          speechTaskType="description"
          rows={4}
        />
      </div>

      <div className="mt-4 p-4 bg-muted rounded">
        <h3 className="font-medium mb-2">Current Values:</h3>
        <p><strong>Input:</strong> {inputValue || '(empty)'}</p>
        <p><strong>Textarea:</strong> {textareaValue || '(empty)'}</p>
      </div>
    </div>
  );
}