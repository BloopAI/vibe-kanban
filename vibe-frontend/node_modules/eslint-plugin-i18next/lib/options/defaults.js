module.exports = {
  framework: 'react',
  mode: 'jsx-text-only',
  'jsx-components': {
    include: [],
    exclude: ['Trans'],
  },
  'jsx-attributes': {
    include: [],
    exclude: [
      'className',
      'styleName',
      'style',
      'type',
      'key',
      'id',
      'width',
      'height',
    ],
  },
  words: {
    exclude: [
      '[0-9!-/:-@[-`{-~]+',
      '[A-Z_-]+',
      require('./htmlEntities'),
      /^\p{Emoji}+$/u,
    ],
  },
  callees: {
    exclude: [
      'i18n(ext)?',
      't',
      'require',
      'addEventListener',
      'removeEventListener',
      'postMessage',
      'getElementById',
      'dispatch',
      'commit',
      'includes',
      'indexOf',
      'endsWith',
      'startsWith',
    ],
  },
  'object-properties': {
    include: [],
    exclude: ['[A-Z_-]+'],
  },
  'class-properties': {
    include: [],
    exclude: ['displayName'],
  },
  message: 'disallow literal string',
  'should-validate-template': false,
};
