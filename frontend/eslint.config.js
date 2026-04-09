// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unusedImports from 'eslint-plugin-unused-imports';
import i18next from 'eslint-plugin-i18next';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import checkFile from 'eslint-plugin-check-file';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

const i18nCheck = process.env.LINT_I18N === 'true';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['dist/**', 'eslint.config.js'],
  },

  // Base config for all TypeScript/TSX source files
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
      i18next,
      '@eslint-community/eslint-comments': eslintComments,
      'check-file': checkFile,
    },
    rules: {
      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // ESLint directive comments
      '@eslint-community/eslint-comments/no-aggregating-enable': 'error',
      '@eslint-community/eslint-comments/no-duplicate-disable': 'error',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/no-unused-enable': 'error',
      '@eslint-community/eslint-comments/no-use': ['error', { allow: [] }],
      // React Refresh
      'react-refresh/only-export-components': 'off',
      // Unused imports/vars
      'no-useless-assignment': 'off', // new ESLint 10 rule; too many pre-existing patterns
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          ignoreRestSiblings: false,
          caughtErrors: 'none',
        },
      ],
      // TypeScript
      '@typescript-eslint/no-unused-vars': 'off', // unused-imports/no-unused-vars handles this
      '@typescript-eslint/no-empty-object-type': 'off', // common pattern in shadcn components
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowTernary: true, allowShortCircuit: true },
      ],
      // Typesafe modal pattern enforcement
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
          message: 'Do not use showModal(). Use DialogName.show(props) instead.',
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
      // i18n check — only active when LINT_I18N=true
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
          'src/**/*.tsx': 'PASCAL_CASE',
          'src/**/use*.ts': 'CAMEL_CASE',
          'src/utils/**/*.ts': 'CAMEL_CASE',
          'src/lib/**/*.ts': 'CAMEL_CASE',
          'src/config/**/*.ts': 'CAMEL_CASE',
          'src/constants/**/*.ts': 'CAMEL_CASE',
        },
        { ignoreMiddleExtensions: true },
      ],
    },
  },

  // Prettier — disables formatting rules that conflict with prettier (must come after rule configs)
  prettierConfig,

  // Entry point exception — main.tsx and vite-env.d.ts may be lowercase
  {
    files: ['src/main.tsx', 'src/vite-env.d.ts'],
    rules: {
      'check-file/filename-naming-convention': 'off',
    },
  },

  // shadcn UI components — keep kebab-case convention
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        {
          'src/components/ui/**/*.{ts,tsx}': 'KEBAB_CASE',
        },
        { ignoreMiddleExtensions: true },
      ],
    },
  },

  // Test and stories files — disable i18n literal check
  {
    files: ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}'],
    rules: {
      'i18next/no-literal-string': 'off',
    },
  },

  // Config files — disable type-aware linting (not part of tsconfig.json project)
  {
    files: ['*.config.{ts,js,cjs,mjs}'],
    languageOptions: {
      parserOptions: {
        project: false,
      },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
    },
  },

  // Allow NiceModal usage in lib/modals.ts, App.tsx, and dialog component files
  {
    files: [
      'src/lib/modals.ts',
      'src/App.tsx',
      'src/components/dialogs/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
