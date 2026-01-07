Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const hoistNonReactStaticsImport = require('hoist-non-react-statics');

// Ensure we use the default export from hoist-non-react-statics if available,
// falling back to the module itself. This handles both ESM and CJS usage.
const hoistNonReactStatics = hoistNonReactStaticsImport.default || hoistNonReactStaticsImport;

exports.hoistNonReactStatics = hoistNonReactStatics;
//# sourceMappingURL=hoist-non-react-statics.js.map
