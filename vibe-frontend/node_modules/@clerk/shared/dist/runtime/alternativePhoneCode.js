
//#region src/alternativePhoneCode.ts
const ALTERNATIVE_PHONE_CODE_PROVIDERS = [{
	channel: "whatsapp",
	name: "WhatsApp"
}];
const getAlternativePhoneCodeProviderData = (channel) => {
	if (!channel) return null;
	return ALTERNATIVE_PHONE_CODE_PROVIDERS.find((p) => p.channel === channel) || null;
};

//#endregion
exports.ALTERNATIVE_PHONE_CODE_PROVIDERS = ALTERNATIVE_PHONE_CODE_PROVIDERS;
exports.getAlternativePhoneCodeProviderData = getAlternativePhoneCodeProviderData;
//# sourceMappingURL=alternativePhoneCode.js.map