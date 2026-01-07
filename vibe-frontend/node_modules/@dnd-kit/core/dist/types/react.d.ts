/// <reference types="react" />
import type { Without } from '@dnd-kit/utilities';
export declare type SyntheticEventName = keyof Without<React.DOMAttributes<any>, 'children' | 'dangerouslySetInnerHTML'>;
