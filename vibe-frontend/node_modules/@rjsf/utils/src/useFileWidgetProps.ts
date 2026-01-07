'use client';

import { useCallback, useMemo } from 'react';

import dataURItoBlob from './dataURItoBlob';

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

/** Updated the given `dataUrl` to add the `name` to it
 *
 * @param dataURL - The url description string
 * @param name - The name of the file to add to the dataUrl
 * @returns - The `dataUrl` updated to include the name
 */
function addNameToDataURL(dataURL: string, name: string) {
  return dataURL.replace(';base64', `;name=${encodeURIComponent(name)};base64`);
}

/** Returns a promise that will read the file from the browser and return it as the result of the promise.
 *
 * @param file - The `File` information to read
 * @returns - A promise that resolves to the read file.
 */
function processFile(file: File): Promise<FileInfoType> {
  const { name, size, type } = file;
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onerror = reject;
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        resolve({
          dataURL: addNameToDataURL(event.target.result, name),
          name,
          size,
          type,
        });
      } else {
        resolve({
          dataURL: null,
          name,
          size,
          type,
        });
      }
    };
    reader.readAsDataURL(file);
  });
}

/** Reads a list of files from the browser, returning the results of the promises of each individual file read.
 *
 * @param files - The list of files to read
 * @returns - The list of read files
 */
function processFiles(files: FileList) {
  return Promise.all(Array.from(files).map(processFile));
}

/** Extracts the file information from the data URLs
 *
 * @param dataURLs - The information about the files
 * @returns - The list of `FileInfoType` objects extracted from the data urls
 */
function extractFileInfo(dataURLs: string[]): FileInfoType[] {
  return dataURLs.reduce((acc, dataURL) => {
    if (!dataURL) {
      return acc;
    }
    try {
      const { blob, name } = dataURItoBlob(dataURL);
      return [
        ...acc,
        {
          dataURL,
          name: name,
          size: blob.size,
          type: blob.type,
        },
      ];
    } catch {
      // Invalid dataURI, so just ignore it.
      return acc;
    }
  }, [] as FileInfoType[]);
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
export default function useFileWidgetProps(
  value: string | string[] | undefined | null,
  onChange: (value?: string | null | (string | null)[]) => void,
  multiple = false,
): UseFileWidgetPropsResult {
  const values: (string | null)[] = useMemo(() => {
    if (multiple && value) {
      return Array.isArray(value) ? value : [value];
    }
    return [];
  }, [value, multiple]);
  const filesInfo = useMemo(
    () => (Array.isArray(value) ? extractFileInfo(value) : extractFileInfo([value || ''])),
    [value],
  );

  const handleChange = useCallback(
    (files: FileList) => {
      processFiles(files).then((filesInfoEvent) => {
        const newValue = filesInfoEvent.map((fileInfo) => fileInfo.dataURL || null);
        if (multiple) {
          onChange(values.concat(...newValue));
        } else {
          onChange(newValue[0]);
        }
      });
    },
    [values, multiple, onChange],
  );
  const handleRemove = useCallback(
    (index: number) => {
      if (multiple) {
        const newValue = values.filter((_, i: number) => i !== index);
        onChange(newValue);
      } else {
        onChange(undefined);
      }
    },
    [values, multiple, onChange],
  );

  return { filesInfo, handleChange, handleRemove };
}
