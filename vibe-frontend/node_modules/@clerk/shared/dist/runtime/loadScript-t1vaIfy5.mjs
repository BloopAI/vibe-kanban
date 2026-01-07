import { retry } from "./retry-DAlTROH9.mjs";

//#region src/loadScript.ts
const NO_DOCUMENT_ERROR = "loadScript cannot be called when document does not exist";
const NO_SRC_ERROR = "loadScript cannot be called without a src";
async function loadScript(src = "", opts) {
	const { async, defer, beforeLoad, crossOrigin, nonce } = opts || {};
	const load = () => {
		return new Promise((resolve, reject) => {
			if (!src) reject(new Error(NO_SRC_ERROR));
			if (!document || !document.body) reject(new Error(NO_DOCUMENT_ERROR));
			const script = document.createElement("script");
			if (crossOrigin) script.setAttribute("crossorigin", crossOrigin);
			script.async = async || false;
			script.defer = defer || false;
			script.addEventListener("load", () => {
				script.remove();
				resolve(script);
			});
			script.addEventListener("error", (event) => {
				script.remove();
				reject(event.error ?? /* @__PURE__ */ new Error(`failed to load script: ${src}`));
			});
			script.src = src;
			script.nonce = nonce;
			beforeLoad?.(script);
			document.body.appendChild(script);
		});
	};
	return retry(load, { shouldRetry: (_, iterations) => iterations <= 5 });
}

//#endregion
export { loadScript };
//# sourceMappingURL=loadScript-t1vaIfy5.mjs.map