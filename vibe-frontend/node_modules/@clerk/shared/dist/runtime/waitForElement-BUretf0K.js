
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
Object.defineProperty(exports, 'waitForElement', {
  enumerable: true,
  get: function () {
    return waitForElement;
  }
});
//# sourceMappingURL=waitForElement-BUretf0K.js.map