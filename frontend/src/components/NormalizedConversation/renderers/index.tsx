import { ReactNode } from 'react';

export interface ToolRendererContext {
  toolName: string;
  arguments: any;
  result?: {
    type: { type: string };
    value?: any;
  };
}

export interface ToolRenderer {
  matches: (context: ToolRendererContext) => boolean;
  render: (context: ToolRendererContext) => ReactNode;
  shouldAutoExpand?: boolean;
  collapsible?: boolean;
}

class ToolRendererRegistry {
  private renderers: ToolRenderer[] = [];

  register(renderer: ToolRenderer) {
    this.renderers.push(renderer);
  }

  findRenderer(context: ToolRendererContext): ToolRenderer | null {
    return this.renderers.find((r) => r.matches(context)) || null;
  }
}

export const toolRendererRegistry = new ToolRendererRegistry();
