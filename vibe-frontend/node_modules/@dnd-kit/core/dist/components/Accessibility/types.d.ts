import type { Active, Over } from '../../store';
export interface Arguments {
    active: Active;
    over: Over | null;
}
export interface Announcements {
    onDragStart({ active }: Pick<Arguments, 'active'>): string | undefined;
    onDragMove?({ active, over }: Arguments): string | undefined;
    onDragOver({ active, over }: Arguments): string | undefined;
    onDragEnd({ active, over }: Arguments): string | undefined;
    onDragCancel({ active, over }: Arguments): string | undefined;
}
export interface ScreenReaderInstructions {
    draggable: string;
}
