/** The information about files used by a FileWidget */
export type FileInfoType = {
    /** The url of the data containing the file */
    dataURL?: string | null;
    /** The name of the file */
    name: string;
    /** The size of the file */
    size: number;
    /** The type of the file */
    type: string;
};
export interface UseFileWidgetPropsResult {
    /** The list of FileInfoType contained within the FileWidget */
    filesInfo: FileInfoType[];
    /** The callback handler to pass to the onChange of the input */
    handleChange: (files: FileList) => void;
    /** The callback handler to pass in order to delete a file */
    handleRemove: (index: number) => void;
}
/** Hook which encapsulates the logic needed to read and convert a `value` of `File` or `File[]` into the
 * `filesInfo: FileInfoType[]` and the two callback implementations needed to change the list or to remove a
 * `File` from the list. To be used by theme specific `FileWidget` implementations.
 *
 * @param value - The current value of the `FileWidget`
 * @param onChange - The onChange handler for the `FileWidget`
 * @param [multiple=false] - Flag indicating whether the control supports multiple selections
 * @returns - The `UseFileWidgetPropsResult` to be used within a `FileWidget` implementation
 */
export default function useFileWidgetProps(value: string | string[] | undefined | null, onChange: (value?: string | null | (string | null)[]) => void, multiple?: boolean): UseFileWidgetPropsResult;
