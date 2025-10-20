# Custom Tool Renderers

This directory contains the modular renderer system for custom tool outputs in the conversation view.

## Architecture

The renderer system uses a registry pattern to keep the main component clean and extensible.

### Core Components

- **index.tsx**: Registry and interfaces for tool renderers
- **mermaid-renderer.tsx**: Example renderer for Mermaid diagrams

## Adding a New Renderer

To add a new custom renderer (e.g., for browser screenshots):

1. Create a new file `renderers/your-renderer.tsx`
2. Implement the `ToolRenderer` interface:

```tsx
import { ToolRenderer, toolRendererRegistry } from './index';
import YourComponent from '@/components/ui/your-component';

const yourRenderer: ToolRenderer = {
  // Define when this renderer should be used
  matches: (context) => {
    return context.toolName?.toLowerCase() === 'screenshot';
  },

  // Render the custom UI
  render: (context) => (
    <div className="px-2 py-1">
      <YourComponent data={context.arguments} />
    </div>
  ),

  // Optional: auto-expand when this tool is rendered
  shouldAutoExpand: true,

  // Optional: allow user to collapse/expand
  collapsible: true,
};

// Register the renderer
toolRendererRegistry.register(yourRenderer);
```

3. Import your renderer in `DisplayConversationEntry.tsx`:

```tsx
import './renderers/your-renderer';
```

That's it! The system will automatically use your renderer when the `matches` function returns true.

## Interface Reference

```typescript
interface ToolRendererContext {
  toolName: string;
  arguments: any;
  result?: {
    type: { type: string };
    value?: any;
  };
}

interface ToolRenderer {
  // Return true if this renderer should handle the tool
  matches: (context: ToolRendererContext) => boolean;

  // Return the React element to render
  render: (context: ToolRendererContext) => ReactNode;

  // Optional: should the tool be auto-expanded?
  shouldAutoExpand?: boolean;

  // Optional: allow user to collapse/expand (default: false)
  collapsible?: boolean;
}
```

## Benefits

- **Clean separation**: Tool-specific rendering logic is isolated
- **No pollution**: Main component stays clean
- **Easy to add**: Just create a file and import it
- **Type-safe**: Full TypeScript support
