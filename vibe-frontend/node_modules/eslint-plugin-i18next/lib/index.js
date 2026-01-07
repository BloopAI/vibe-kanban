/**
 * @fileoverview ESLint plugin for i18n
 * @author edvardchen
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var requireIndex = require('requireindex');

//------------------------------------------------------------------------------
// Plugin Definition
//------------------------------------------------------------------------------

// import all rules in lib/rules
const rules = requireIndex(__dirname + '/rules');
/**
 * @type {import('eslint').ESLint.Plugin}
 */
const plugin = {
  rules,

  configs: {
    // for ESLint v9
    'flat/recommended': {
      plugins: { i18next: { rules } },
      rules: {
        'i18next/no-literal-string': [2],
      },
    },

    // for ESLint below v9
    recommended: {
      plugins: ['i18next'],
      rules: {
        'i18next/no-literal-string': [2],
      },
    },
  },
};

module.exports = plugin;
