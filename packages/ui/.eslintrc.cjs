module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json',
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'react-hooks', 'unused-imports'],
  ignorePatterns: ['dist'],
  rules: {
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
  },
  overrides: [
    {
      files: ['src/index.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ExportNamedDeclaration',
            message:
              'Root exports are not allowed in @vibe/ui. Use explicit package.json subpath exports.',
          },
          {
            selector: 'ExportAllDeclaration',
            message:
              'Root exports are not allowed in @vibe/ui. Use explicit package.json subpath exports.',
          },
        ],
      },
    },
  ],
};
