import type { Coordinates, UniqueIdentifier } from '../../types';
import type { SensorContext } from '../types';
export declare enum KeyboardCode {
    Space = "Space",
    Down = "ArrowDown",
    Right = "ArrowRight",
    Left = "ArrowLeft",
    Up = "ArrowUp",
    Esc = "Escape",
    Enter = "Enter",
    Tab = "Tab"
}
export declare type KeyboardCodes = {
    start: KeyboardEvent['code'][];
    cancel: KeyboardEvent['code'][];
    end: KeyboardEvent['code'][];
};
export declare type KeyboardCoordinateGetter = (event: KeyboardEvent, args: {
    active: UniqueIdentifier;
    currentCoordinates: Coordinates;
    context: SensorContext;
}) => Coordinates | void;
