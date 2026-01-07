
//#region src/web3.ts
const WEB3_PROVIDERS = [
	{
		provider: "metamask",
		strategy: "web3_metamask_signature",
		name: "MetaMask"
	},
	{
		provider: "base",
		strategy: "web3_base_signature",
		name: "Base"
	},
	{
		provider: "coinbase_wallet",
		strategy: "web3_coinbase_wallet_signature",
		name: "Coinbase Wallet"
	},
	{
		provider: "okx_wallet",
		strategy: "web3_okx_wallet_signature",
		name: "OKX Wallet"
	},
	{
		provider: "solana",
		strategy: "web3_solana_signature",
		name: "Solana"
	}
];

//#endregion
exports.WEB3_PROVIDERS = WEB3_PROVIDERS;
//# sourceMappingURL=web3.js.map