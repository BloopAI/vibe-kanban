import type { FirstArgument, Transform } from '@dnd-kit/utilities';
import type { Modifiers, Modifier } from './types';
export declare function applyModifiers(modifiers: Modifiers | undefined, { transform, ...args }: FirstArgument<Modifier>): Transform;
