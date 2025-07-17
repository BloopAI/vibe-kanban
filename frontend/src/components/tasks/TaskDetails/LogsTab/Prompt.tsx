import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { Hammer } from 'lucide-react';

const Prompt = ({ prompt }: { prompt: string }) => {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 mt-1">
        <Hammer className="h-4 w-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm whitespace-pre-wrap text-foreground">
          <MarkdownRenderer
            content={prompt}
            className="whitespace-pre-wrap break-words"
          />
        </div>
      </div>
    </div>
  );
};

export default Prompt;
