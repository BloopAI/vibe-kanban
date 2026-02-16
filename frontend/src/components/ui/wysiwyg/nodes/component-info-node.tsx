import { useState, useRef, useCallback, useEffect } from 'react';
import { NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import {
  createDecoratorNode,
  type DecoratorNodeConfig,
  type GeneratedDecoratorNode,
} from '../lib/create-decorator-node';

/**
 * Data model for a detected UI component.
 * Serialized as JSON inside a ```vk-component fenced code block.
 */
export interface ComponentInfoData {
  framework: string; // 'react', 'vue', 'svelte', 'astro', 'html'
  component: string; // Component name: 'Button', 'UserProfile'
  tagName?: string; // HTML tag: 'button', 'div', 'span'
  file?: string; // File path: 'src/components/Button.tsx'
  line?: number; // Line number
  column?: number; // Column number
  cssClass?: string; // CSS class: '.btn-primary'
  stack?: Array<{ name: string; file?: string }>; // Component hierarchy
  htmlPreview: string; // HTML snippet: '<button class="btn">Click</button>'
}

export type SerializedComponentInfoNode = Spread<
  ComponentInfoData,
  SerializedLexicalNode
>;

const TOOLTIP_DELAY_MS = 350;

function ComponentInfoComponent({
  data,
  onDoubleClickEdit,
}: {
  data: ComponentInfoData;
  nodeKey: NodeKey;
  onDoubleClickEdit: (event: React.MouseEvent) => void;
}): JSX.Element {
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayName = data.component || data.tagName || 'unknown';

  const handleMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, TOOLTIP_DELAY_MS);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShowTooltip(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const tooltipRows: Array<{ label: string; value: string; mono?: boolean }> =
    [];
  tooltipRows.push({ label: 'Component', value: data.component });
  if (data.file) {
    tooltipRows.push({ label: 'File', value: data.file, mono: true });
  }
  if (data.line != null) {
    tooltipRows.push({ label: 'Line', value: String(data.line) });
  }
  if (data.cssClass) {
    tooltipRows.push({ label: 'Class', value: data.cssClass, mono: true });
  }

  const stackBreadcrumb =
    data.stack && data.stack.length > 1
      ? data.stack.map((s) => `<${s.name}/>`).join(' \u2190 ')
      : null;

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={onDoubleClickEdit}
    >
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-sm font-medium cursor-default max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap select-none"
        style={{
          backgroundColor: '#D239C0',
          color: '#ffffff',
          lineHeight: '1.4',
        }}
      >
        &lt;{displayName}&gt;
      </span>

      {showTooltip && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[999] pointer-events-none"
          style={{
            animation: 'componentInfoTooltipFadeIn 100ms ease-out',
          }}
        >
          <span className="block bg-panel border border-low shadow-lg rounded-md px-base py-half max-w-[300px]">
            <span className="flex flex-col gap-0.5">
              {tooltipRows.map((row) => (
                <span
                  key={row.label}
                  className="flex items-baseline gap-2 text-sm"
                >
                  <span className="text-low shrink-0">{row.label}</span>
                  <span
                    className={`text-normal overflow-hidden text-ellipsis whitespace-nowrap min-w-0 ${row.mono ? 'font-ibm-plex-mono' : ''}`}
                  >
                    {row.value}
                  </span>
                </span>
              ))}
            </span>
            {stackBreadcrumb && (
              <span className="block mt-1 pt-1 border-t border-low text-sm text-low overflow-hidden text-ellipsis whitespace-nowrap">
                {stackBreadcrumb}
              </span>
            )}
          </span>
        </span>
      )}

      <style>{`
        @keyframes componentInfoTooltipFadeIn {
          from { opacity: 0; transform: translateX(-50%) scale(0.97); }
          to { opacity: 1; transform: translateX(-50%) scale(1); }
        }
      `}</style>
    </span>
  );
}

const config: DecoratorNodeConfig<ComponentInfoData> = {
  type: 'component-info',
  serialization: {
    format: 'fenced',
    language: 'vk-component',
    serialize: (data) => JSON.stringify(data),
    deserialize: (content) => JSON.parse(content),
    validate: (data) =>
      !!(data.framework && data.component && data.htmlPreview),
  },
  component: ComponentInfoComponent,
  domStyle: {
    display: 'inline-block',
    paddingLeft: '2px',
    paddingRight: '2px',
    verticalAlign: 'bottom',
  },
  keyboardSelectable: false,
  exportDOM: (data) => {
    const span = document.createElement('span');
    span.setAttribute('data-component-info', data.component);
    span.textContent = `<${data.component}/>`;
    return span;
  },
};

const result = createDecoratorNode(config);

export const ComponentInfoNode = result.Node;
export type ComponentInfoNodeInstance =
  GeneratedDecoratorNode<ComponentInfoData>;
export const $createComponentInfoNode = result.createNode;
export const $isComponentInfoNode = result.isNode;
export const [COMPONENT_INFO_EXPORT_TRANSFORMER, COMPONENT_INFO_TRANSFORMER] =
  result.transformers;
