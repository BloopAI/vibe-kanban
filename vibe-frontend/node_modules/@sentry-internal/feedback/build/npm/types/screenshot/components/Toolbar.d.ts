import type { h as hType, VNode } from 'preact';
import type * as Hooks from 'preact/hooks';
interface FactoryParams {
    h: typeof hType;
}
export default function ToolbarFactory({ h, }: FactoryParams): ({ action, setAction, }: {
    action: 'highlight' | 'hide' | '';
    setAction: Hooks.StateUpdater<'highlight' | 'hide' | ''>;
}) => VNode;
export {};
//# sourceMappingURL=Toolbar.d.ts.map