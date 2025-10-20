import MermaidRenderer from '@/components/ui/mermaid-renderer.tsx';
import { ToolRenderer, toolRendererRegistry } from './index';

const mermaidRenderer: ToolRenderer = {
  matches: (context) => {
    return (
      context.toolName?.toLowerCase() === 'mermaid' &&
      typeof context.arguments === 'object' &&
      context.arguments !== null &&
      'code' in context.arguments
    );
  },
  render: (context) => (
    <div className="px-2 py-1">
      <MermaidRenderer code={String(context.arguments.code)} />
    </div>
  ),
  shouldAutoExpand: true,
  collapsible: true,
};

toolRendererRegistry.register(mermaidRenderer);
