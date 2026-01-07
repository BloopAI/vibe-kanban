/** Given the `FileReader.readAsDataURL()` based `dataURI` extracts that data into an actual Blob along with the name
 * of that Blob if provided in the URL. If no name is provided, then the name falls back to `unknown`.
 *
 * @param dataURI - The `DataUrl` potentially containing name and raw data to be converted to a Blob
 * @returns - an object containing a Blob and its name, extracted from the URI
 */
export default function dataURItoBlob(dataURILike: string): {
    blob: Blob;
    name: string;
};
