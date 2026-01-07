//#region src/dom/waitForElement.ts
/**
* Uses a MutationObserver to wait for an element to be added to the DOM.
*/
function waitForElement(selector) {
	return new Promise((resolve) => {
		if (document.querySelector(selector)) return resolve(document.querySelector(selector));
		const observer = new MutationObserver(() => {
			if (document.querySelector(selector)) {
				observer.disconnect();
				resolve(document.querySelector(selector));
			}
		});
		observer.observe(document.body, {
			childList: true,
			subtree: true
		});
	});
}

//#endregion
export { waitForElement };
//# sourceMappingURL=waitForElement-Cl1uDYXK.mjs.map