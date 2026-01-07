import React from 'react';
import type { Transform } from '@dnd-kit/utilities';
import type { AutoScrollOptions } from '../../hooks/utilities';
import type { SensorDescriptor } from '../../sensors';
import { CollisionDetection } from '../../utilities';
import { Modifiers } from '../../modifiers';
import type { DragStartEvent, DragCancelEvent, DragEndEvent, DragMoveEvent, DragOverEvent, DragPendingEvent, DragAbortEvent } from '../../types';
import { Announcements, ScreenReaderInstructions } from '../Accessibility';
import type { MeasuringConfiguration } from './types';
export interface Props {
    id?: string;
    accessibility?: {
        announcements?: Announcements;
        container?: Element;
        restoreFocus?: boolean;
        screenReaderInstructions?: ScreenReaderInstructions;
    };
    autoScroll?: boolean | AutoScrollOptions;
    cancelDrop?: CancelDrop;
    children?: React.ReactNode;
    collisionDetection?: CollisionDetection;
    measuring?: MeasuringConfiguration;
    modifiers?: Modifiers;
    sensors?: SensorDescriptor<any>[];
    onDragAbort?(event: DragAbortEvent): void;
    onDragPending?(event: DragPendingEvent): void;
    onDragStart?(event: DragStartEvent): void;
    onDragMove?(event: DragMoveEvent): void;
    onDragOver?(event: DragOverEvent): void;
    onDragEnd?(event: DragEndEvent): void;
    onDragCancel?(event: DragCancelEvent): void;
}
export interface CancelDropArguments extends DragEndEvent {
}
export declare type CancelDrop = (args: CancelDropArguments) => boolean | Promise<boolean>;
export declare const ActiveDraggableContext: React.Context<Transform>;
export declare const DndContext: React.NamedExoticComponent<Props>;
