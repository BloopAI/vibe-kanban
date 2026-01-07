/// <reference types="react" />
import type { Announcements, ScreenReaderInstructions } from './types';
interface Props {
    announcements?: Announcements;
    container?: Element;
    screenReaderInstructions?: ScreenReaderInstructions;
    hiddenTextDescribedById: string;
}
export declare function Accessibility({ announcements, container, hiddenTextDescribedById, screenReaderInstructions, }: Props): JSX.Element | null;
export {};
