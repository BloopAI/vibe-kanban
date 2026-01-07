export declare enum EventName {
    Click = "click",
    DragStart = "dragstart",
    Keydown = "keydown",
    ContextMenu = "contextmenu",
    Resize = "resize",
    SelectionChange = "selectionchange",
    VisibilityChange = "visibilitychange"
}
export declare function preventDefault(event: Event): void;
export declare function stopPropagation(event: Event): void;
