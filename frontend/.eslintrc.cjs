const i18nCheck = process.env.LINT_I18N === 'true';

module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:i18next/recommended',
    'prettier',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', '@typescript-eslint', 'unused-imports', 'i18next'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json',
  },
  rules: {
    'react-refresh/only-export-components': 'off',
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'error',
      {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: false,
      },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/switch-exhaustiveness-check': 'error',
    // Enforce typesafe modal pattern
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@ebay/nice-modal-react',
            importNames: ['default'],
            message:
              'Import NiceModal only in lib/modals.ts or dialog component files. Use DialogName.show(props) instead.',
          },
          {
            name: '@/lib/modals',
            importNames: ['showModal', 'hideModal', 'removeModal'],
            message:
              'Do not import showModal/hideModal/removeModal. Use DialogName.show(props) and DialogName.hide() instead.',
          },
        ],
      },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector:
          'CallExpression[callee.object.name="NiceModal"][callee.property.name="show"]',
        message:
          'Do not use NiceModal.show() directly. Use DialogName.show(props) instead.',
      },
      {
        selector:
          'CallExpression[callee.object.name="NiceModal"][callee.property.name="register"]',
        message:
          'Do not use NiceModal.register(). Dialogs are registered automatically.',
      },
      {
        selector: 'CallExpression[callee.name="showModal"]',
        message:
          'Do not use showModal(). Use DialogName.show(props) instead.',
      },
      {
        selector: 'CallExpression[callee.name="hideModal"]',
        message: 'Do not use hideModal(). Use DialogName.hide() instead.',
      },
      {
        selector: 'CallExpression[callee.name="removeModal"]',
        message: 'Do not use removeModal(). Use DialogName.remove() instead.',
      },
    ],
    // i18n rule - only active when LINT_I18N=true
    'i18next/no-literal-string': i18nCheck
      ? [
          'warn',
          {
            markupOnly: true,
            ignoreAttribute: [
              'data-testid',
              'to',
              'href',
              'id',
              'key',
              'type',
              'role',
              'className',
              'style',
              'aria-describedby',
            ],
            'jsx-components': {
              exclude: ['code'],
            },
          },
        ]
      : 'off',
  },
  overrides: [
    {
      files: ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}'],
      rules: {
        'i18next/no-literal-string': 'off',
      },
    },
    {
      // Disable type-aware linting for config files
      files: ['*.config.{ts,js,cjs,mjs}', '.eslintrc.cjs'],
      parserOptions: {
        project: null,
      },
      rules: {
        '@typescript-eslint/switch-exhaustiveness-check': 'off',
      },
    },
    {
      // Allow NiceModal usage in lib/modals.ts, App.tsx (for Provider), and dialog component files
      files: ['src/lib/modals.ts', 'src/App.tsx', 'src/components/dialogs/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': 'off',
        'no-restricted-syntax': 'off',
      },
    },
  ],
};
