/** Given the `FileReader.readAsDataURL()` based `dataURI` extracts that data into an actual Blob along with the name
 * of that Blob if provided in the URL. If no name is provided, then the name falls back to `unknown`.
 *
 * @param dataURI - The `DataUrl` potentially containing name and raw data to be converted to a Blob
 * @returns - an object containing a Blob and its name, extracted from the URI
 */
export default function dataURItoBlob(dataURILike) {
    var _a;
    // check if is dataURI
    if (dataURILike.indexOf('data:') === -1) {
        throw new Error('File is invalid: URI must be a dataURI');
    }
    const dataURI = dataURILike.slice(5);
    // split the dataURI into media and base64, with the base64 signature
    const splitted = dataURI.split(';base64,');
    // if the base64 signature is not present, the latter part will become empty
    if (splitted.length !== 2) {
        throw new Error('File is invalid: dataURI must be base64');
    }
    // extract the mime type, media parameters including the name, and the base64 string
    const [media, base64] = splitted;
    const [mime, ...mediaparams] = media.split(';');
    const type = mime || '';
    // extract the name from the parameters
    const name = decodeURI(
    // parse the parameters into key-value pairs, find a key, and extract a value
    // if no key is found, then the name is unknown
    ((_a = mediaparams.map((param) => param.split('=')).find(([key]) => key === 'name')) === null || _a === void 0 ? void 0 : _a[1]) || 'unknown');
    // Built the Uint8Array Blob parameter from the base64 string.
    try {
        const binary = atob(base64);
        const array = new Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        // Create the blob object
        const blob = new window.Blob([new Uint8Array(array)], { type });
        return { blob, name };
    }
    catch (error) {
        throw new Error('File is invalid: ' + error.message);
    }
}
//# sourceMappingURL=dataURItoBlob.js.map