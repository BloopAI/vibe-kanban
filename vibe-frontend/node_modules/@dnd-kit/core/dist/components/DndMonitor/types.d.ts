import type { DragAbortEvent, DragPendingEvent, DragStartEvent, DragCancelEvent, DragEndEvent, DragMoveEvent, DragOverEvent } from '../../types';
export interface DndMonitorListener {
    onDragAbort?(event: DragAbortEvent): void;
    onDragPending?(event: DragPendingEvent): void;
    onDragStart?(event: DragStartEvent): void;
    onDragMove?(event: DragMoveEvent): void;
    onDragOver?(event: DragOverEvent): void;
    onDragEnd?(event: DragEndEvent): void;
    onDragCancel?(event: DragCancelEvent): void;
}
export interface DndMonitorEvent {
    type: keyof DndMonitorListener;
    event: DragAbortEvent | DragPendingEvent | DragStartEvent | DragMoveEvent | DragOverEvent | DragEndEvent | DragCancelEvent;
}
export declare type UnregisterListener = () => void;
export declare type RegisterListener = (listener: DndMonitorListener) => UnregisterListener;
