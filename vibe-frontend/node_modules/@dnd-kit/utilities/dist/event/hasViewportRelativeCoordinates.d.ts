export declare function hasViewportRelativeCoordinates(event: Event): event is Event & Pick<PointerEvent, 'clientX' | 'clientY'>;
