import * as hoistNonReactStaticsImport from 'hoist-non-react-statics';

// Ensure we use the default export from hoist-non-react-statics if available,
// falling back to the module itself. This handles both ESM and CJS usage.
const hoistNonReactStatics = hoistNonReactStaticsImport.default || hoistNonReactStaticsImport;

export { hoistNonReactStatics };
//# sourceMappingURL=hoist-non-react-statics.js.map
