import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import { ToolRenderer, toolRendererRegistry } from './index';

const playwrightScreenshotRenderer: ToolRenderer = {
  matches: (context) => {
    return context.toolName === 'mcp:playwright:browser_take_screenshot';
  },
  render: (context) => {
    const result = context.result?.value;
    if (!result || !Array.isArray(result)) return null;

    return (
      <div className="px-2 py-1 space-y-2">
        {result.map((item: any, index: number) => {
          if (item.type === 'text' && item.text) {
            return <MarkdownRenderer key={index} content={item.text} />;
          }
          if (item.type === 'image' && item.data && item.mimeType) {
            return (
              <img
                key={index}
                src={`data:${item.mimeType};base64,${item.data}`}
                alt="Screenshot"
                className="max-w-full h-auto rounded border border-gray-200"
              />
            );
          }
          return null;
        })}
      </div>
    );
  },
  shouldAutoExpand: true,
  collapsible: true,
};

toolRendererRegistry.register(playwrightScreenshotRenderer);
