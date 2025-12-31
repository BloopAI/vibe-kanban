import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginReactRefresh from 'eslint-plugin-react-refresh';
import pluginUnusedImports from 'eslint-plugin-unused-imports';
import pluginI18next from 'eslint-plugin-i18next';
import pluginEslintComments from 'eslint-plugin-eslint-comments';
import pluginCheckFile from 'eslint-plugin-check-file';
import prettier from 'eslint-config-prettier';

const i18nCheck = process.env.LINT_I18N === 'true';

export default [
  // Ignore patterns
  {
    ignores: ['dist', 'node_modules'],
  },

  // Base JS config
  js.configs.recommended,

  // TypeScript flat config
  ...tseslint.configs.recommended,

  // Prettier (must be last)
  prettier,

  // Language options for TypeScript files (requires type info)
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Plugin configurations
  {
    plugins: {
      'react-hooks': pluginReactHooks,
      'react-refresh': pluginReactRefresh,
      'unused-imports': pluginUnusedImports,
      i18next: pluginI18next,
      'eslint-comments': pluginEslintComments,
      'check-file': pluginCheckFile,
    },
  },

  // Base rules
  {
    rules: {
      'eslint-comments/no-use': 'off',
      'react-refresh/only-export-components': 'off',
      // Disable overly strict React Compiler rules from v7
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
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
      // File naming conventions
      'check-file/filename-naming-convention': [
        'error',
        {
          // React components (tsx) should be PascalCase
          'src/**/*.tsx': 'PASCAL_CASE',
          // Hooks should be camelCase starting with 'use'
          'src/**/use*.ts': 'CAMEL_CASE',
          // Utils should be camelCase
          'src/utils/**/*.ts': 'CAMEL_CASE',
          // Lib/config/constants should be camelCase
          'src/lib/**/*.ts': 'CAMEL_CASE',
          'src/config/**/*.ts': 'CAMEL_CASE',
          'src/constants/**/*.ts': 'CAMEL_CASE',
        },
        {
          ignoreMiddleExtensions: true,
        },
      ],
    },
  },

  // Overrides for specific file patterns
  {
    files: ['src/main.tsx', 'src/vite-env.d.ts'],
    rules: {
      'check-file/filename-naming-convention': 'off',
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        {
          'src/components/ui/**/*.{ts,tsx}': 'KEBAB_CASE',
        },
        {
          ignoreMiddleExtensions: true,
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}'],
    rules: {
      'i18next/no-literal-string': 'off',
    },
  },
  {
    // Config files - disable type-aware linting
    files: [
      'eslint.config.js',
      'postcss.config.js',
      'tailwind.config.js',
      'vite.config.ts',
      '*.config.{ts,js,cjs,mjs}',
    ],
    languageOptions: {
      globals: {
        process: 'readonly',
        module: 'writable',
        require: 'readonly',
      },
      parserOptions: {
        project: null,
      },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
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
];
