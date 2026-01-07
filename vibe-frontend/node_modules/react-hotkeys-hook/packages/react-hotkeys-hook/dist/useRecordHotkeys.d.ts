export default function useRecordHotkeys(useKey?: boolean): readonly [Set<string>, {
    readonly start: () => void;
    readonly stop: () => void;
    readonly resetKeys: () => void;
    readonly isRecording: boolean;
}];
