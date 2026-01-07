//#region src/file.ts
/**
* Read an expected JSON type File.
*
* Probably paired with:
*  <input type='file' accept='application/JSON' ... />
*/
function readJSONFile(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener("load", function() {
			resolve(JSON.parse(reader.result));
		});
		reader.addEventListener("error", reject);
		reader.readAsText(file);
	});
}
const MimeTypeToExtensionMap = Object.freeze({
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/x-icon": "ico",
	"image/vnd.microsoft.icon": "ico"
});
const extension = (mimeType) => {
	return MimeTypeToExtensionMap[mimeType];
};

//#endregion
export { extension, readJSONFile };
//# sourceMappingURL=file-dPuNkU4Q.mjs.map