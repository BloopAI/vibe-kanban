# eslint-plugin-check-file

[![NPM Version][npm-image]][downloads-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![NPM License][license-image]][downloads-url]
[![Test Workflow Status][test-workflow-image]][workflow-url]
[![Test Coverage][test-coverage-image]][test-coverage-url]
[![Follow Author on X][x-follow-image]][x-follow-url]

[![Donate][ko-fi-image]][ko-fi-url]

ESLint rules for consistent filename and folder. Allows you to enforce a consistent naming pattern for the filename and folder.

## Installation

You'll first need to install [ESLint](https://eslint.org/):

```sh
npm i eslint --save-dev
```

Next, install
`eslint-plugin-check-file`:

```sh
npm install eslint-plugin-check-file --save-dev
```

## Usage

### Flat Config

```javascript
import checkFile from 'eslint-plugin-check-file';

export default [
  {
    files: ['src/**/*'],
    plugins: {
      'check-file': checkFile,
    },
    rules: {
      'check-file/no-index': 'error',
      'check-file/filename-blocklist': [
        'error',
        {
          '**/*.model.ts': '*.models.ts',
          '**/*.util.ts': '*.utils.ts',
        },
      ],
      'check-file/folder-match-with-fex': [
        'error',
        {
          '*.test.{js,jsx,ts,tsx}': '**/__tests__/',
          '*.styled.{jsx,tsx}': '**/pages/',
        },
      ],
      'check-file/filename-naming-convention': [
        'error',
        {
          '**/*.{jsx,tsx}': 'CAMEL_CASE',
          '**/*.{js,ts}': 'KEBAB_CASE',
        },
      ],
      'check-file/folder-naming-convention': [
        'error',
        {
          'src/**/': 'CAMEL_CASE',
          'mocks/*/': 'KEBAB_CASE',
        },
      ],
    },
  },
];
```

### `eslintrc`

Add `check-file` to the plugins section of your `.eslintrc` configuration file. You can omit the `eslint-plugin-` prefix:

```json
{
  "plugins": ["check-file"]
}
```

Then configure the rules you want to use under the rules section.

```json
{
  "rules": {
    "check-file/no-index": "error",
    "check-file/filename-blocklist": [
      "error",
      {
        "**/*.model.ts": "*.models.ts",
        "**/*.util.ts": "*.utils.ts"
      }
    ],
    "check-file/folder-match-with-fex": [
      "error",
      {
        "*.test.{js,jsx,ts,tsx}": "**/__tests__/",
        "*.styled.{jsx,tsx}": "**/pages/"
      }
    ],
    "check-file/filename-naming-convention": [
      "error",
      {
        "**/*.{jsx,tsx}": "CAMEL_CASE",
        "**/*.{js,ts}": "KEBAB_CASE"
      }
    ],
    "check-file/folder-naming-convention": [
      "error",
      {
        "src/**/": "CAMEL_CASE",
        "mocks/*/": "KEBAB_CASE"
      }
    ]
  }
}
```

## Supported Rules

- [check-file/no-index](docs/rules/no-index.md): A file cannot be named "index"
- [check-file/filename-blocklist](docs/rules/filename-blocklist.md): Blocklist filenames by pattern
- [check-file/folder-match-with-fex](docs/rules/folder-match-with-fex.md): Enforce a consistent naming pattern for folder names for specified files
- [check-file/filename-naming-convention](docs/rules/filename-naming-convention.md): Enforce a consistent naming pattern for filenames for specified files
- [check-file/folder-naming-convention](docs/rules/folder-naming-convention.md): Enforce a consistent naming pattern for folder names for specified folders

[npm-image]: https://img.shields.io/npm/v/eslint-plugin-check-file.svg
[downloads-image]: https://img.shields.io/npm/dm/eslint-plugin-check-file.svg
[license-image]: https://img.shields.io/npm/l/eslint-plugin-check-file
[test-workflow-image]: https://img.shields.io/github/actions/workflow/status/dukeluo/eslint-plugin-check-file/test.yml?label=test
[test-coverage-image]: https://img.shields.io/codecov/c/gh/dukeluo/eslint-plugin-check-file
[ko-fi-image]: https://ko-fi.com/img/githubbutton_sm.svg
[x-follow-image]: https://img.shields.io/badge/follow-@ihuanluo-black
[downloads-url]: https://www.npmjs.com/package/eslint-plugin-check-file
[workflow-url]: https://github.com/dukeluo/eslint-plugin-check-file/actions
[test-coverage-url]: https://app.codecov.io/gh/dukeluo/eslint-plugin-check-file
[ko-fi-url]: https://ko-fi.com/huanluo
[x-follow-url]: https://x.com/ihuanluo
