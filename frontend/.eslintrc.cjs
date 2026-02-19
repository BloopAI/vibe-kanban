const path = require('path');

const i18nCheck = process.env.LINT_I18N === 'true';

// Presentational components - these must be stateless and receive all data via props
const presentationalComponentPatterns = [
  'src/components/ui-new/views/**/*.tsx',
  'src/components/ui-new/primitives/**/*.tsx',
];

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
    'plugin:eslint-comments/recommended',
    'prettier',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'src/routeTree.gen.ts'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', '@typescript-eslint', 'unused-imports', 'i18next', 'eslint-comments', 'check-file', 'deprecation'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: path.join(__dirname, 'tsconfig.json'),
  },
  rules: {
    'eslint-comments/no-use': ['error', { allow: [] }],
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
  overrides: [
    {
      files: ['src/routes/**/*.{ts,tsx}', 'src/routeTree.gen.ts'],
      rules: {
        'check-file/filename-naming-convention': 'off',
      },
    },
    {
      // Entry point exception - main.tsx can stay lowercase
      files: ['src/main.tsx', 'src/vite-env.d.ts'],
      rules: {
        'check-file/filename-naming-convention': 'off',
      },
    },
    {
      // Shadcn UI components are an exception - keep kebab-case
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
      files: [
        '**/*.test.{ts,tsx}',
        '**/*.stories.{ts,tsx}',
        'src/pages/ui-new/ElectricTestPage.tsx',
        'src/pages/Migration.tsx',
        'src/components/ui-new/views/Migrate*.tsx',
        'src/components/ui-new/containers/Migrate*.tsx',
      ],
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
      // Allow NiceModal usage in lib/modals.ts, design scope files (for Provider), and dialog component files
      files: [
        'src/lib/modals.ts',
        'src/components/legacy-design/LegacyDesignScope.tsx',
        'src/components/ui-new/scope/NewDesignScope.tsx',
        'src/components/dialogs/**/*.{ts,tsx}',
      ],
      rules: {
        'no-restricted-imports': 'off',
        'no-restricted-syntax': 'off',
      },
    },
    {
      // ui-new components must use Phosphor icons (not Lucide) and avoid deprecated APIs
      files: ['src/components/ui-new/**/*.{ts,tsx}'],
      rules: {
        'deprecation/deprecation': 'error',
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'lucide-react',
                message: 'Use @phosphor-icons/react instead of lucide-react in ui-new components.',
              },
            ],
          },
        ],
        // Icon size restrictions - use Tailwind design system sizes
        'no-restricted-syntax': [
          'error',
          {
            selector: 'JSXAttribute[name.name="size"][value.type="JSXExpressionContainer"]',
            message:
              'Icons should use Tailwind size classes (size-icon-xs, size-icon-sm, size-icon-base, size-icon-lg, size-icon-xl) instead of the size prop. Example: <Icon className="size-icon-base" />',
          },
          {
            // Catch arbitrary pixel sizes like size-[10px], size-[7px], etc. in className
            selector: 'Literal[value=/size-\\[\\d+px\\]/]',
            message:
              'Use standard icon sizes (size-icon-xs, size-icon-sm, size-icon-base, size-icon-lg, size-icon-xl) instead of arbitrary pixel values like size-[Npx].',
          },
          {
            // Catch generic tailwind sizes like size-1, size-3, size-1.5, etc. (not size-icon-* or size-dot)
            selector: 'Literal[value=/(?<!icon-)(?<!-)size-[0-9]/]',
            message:
              'Use design system sizes (size-icon-xs, size-icon-sm, size-icon-base, size-icon-lg, size-icon-xl, size-dot) instead of generic Tailwind sizes.',
          },
        ],
      },
    },
    {
      // Ban re-exports (barrel exports) in ui-new index files
      files: ['src/components/ui-new/**/index.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ExportNamedDeclaration[source]',
            message: 'Re-exports are not allowed in ui-new. Export directly from source files.',
          },
          {
            selector: 'ExportAllDeclaration',
            message: 'Wildcard re-exports (export *) are not allowed in ui-new.',
          },
        ],
      },
    },
    {
      // Container components should not have optional props
      files: ['src/components/ui-new/containers/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'TSPropertySignature[optional=true]',
            message:
              'Optional props are not allowed in container components. Make the prop required or provide a default value.',
          },
        ],
      },
    },
    {
      // Logic hooks in ui-new/hooks/ - no JSX allowed
      files: ['src/components/ui-new/hooks/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'JSXElement',
            message: 'Logic hooks must not contain JSX. Return data and callbacks only.',
          },
          {
            selector: 'JSXFragment',
            message: 'Logic hooks must not contain JSX fragments.',
          },
        ],
      },
    },
    {
      // Presentational components (views & primitives) - strict presentation rules (no logic)
      files: presentationalComponentPatterns,
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@/lib/api',
                message: 'Presentational components cannot import API. Pass data via props.',
              },
              {
                name: '@tanstack/react-query',
                importNames: ['useQuery', 'useMutation', 'useQueryClient', 'useInfiniteQuery'],
                message: 'Presentational components cannot use data fetching hooks. Pass data via props.',
              },
            ],
          },
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector: 'CallExpression[callee.name="useState"]',
            message: 'Presentational components should not manage state. Use controlled props.',
          },
          {
            selector: 'CallExpression[callee.name="useReducer"]',
            message: 'Presentational components should not use useReducer. Use container component.',
          },
          {
            selector: 'CallExpression[callee.name="useContext"]',
            message: 'Presentational components should not consume context. Pass data via props.',
          },
          {
            selector: 'CallExpression[callee.name="useQuery"]',
            message: 'Presentational components should not fetch data. Pass data via props.',
          },
          {
            selector: 'CallExpression[callee.name="useMutation"]',
            message: 'Presentational components should not mutate data. Pass callbacks via props.',
          },
          {
            selector: 'CallExpression[callee.name="useInfiniteQuery"]',
            message: 'Presentational components should not fetch data. Pass data via props.',
          },
          {
            selector: 'CallExpression[callee.name="useEffect"]',
            message: 'Presentational components should avoid side effects. Move to container.',
          },
          {
            selector: 'CallExpression[callee.name="useLayoutEffect"]',
            message: 'Presentational components should avoid layout effects. Move to container.',
          },
          {
            selector: 'CallExpression[callee.name="useCallback"]',
            message: 'Presentational components should receive callbacks via props.',
          },
          {
            selector: 'CallExpression[callee.name="useNavigate"]',
            message: 'Presentational components should not handle navigation. Pass callbacks via props.',
          },
        ],
      },
    },
  ],
};
