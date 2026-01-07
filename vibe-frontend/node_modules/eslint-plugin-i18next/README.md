# eslint-plugin-i18next

ESLint plugin for i18n

> For old versions below v6, plz refer [this document](./v5.md)

## Installation

```bash
npm install eslint-plugin-i18next --save-dev
```

## Usage

For ESLint 9 flat configuration,

```js
// eslint.config.mjs
import i18next from 'eslint-plugin-i18next';

export default [
  // your other configs
  i18next.configs['flat/recommended'],
];
```

For ESLint 8 and below,

```json
// .eslintrc
{
  "extends": ["plugin:i18next/recommended"]
}
```

## Rule `no-literal-string`

This rule aims to avoid developers to display literal string directly to users without translating them.

> <span style="color: lightcoral">Note:</span> Disable auto-fix because key in the call `i18next.t(key)` usually was not the same as the literal

Example of incorrect code:

```js
/*eslint i18next/no-literal-string: "error"*/
<div>hello world</div>
```

Example of correct code:

```js
/*eslint i18next/no-literal-string: "error"*/
<div>{i18next.t('HELLO_KEY')}</div>
```

More options can be found [here](./docs/rules/no-literal-string.md)

### Breaking change

By default, it will only validate the plain text in JSX markup instead of all literal strings in previous versions.
[You can change it easily](./docs/rules/no-literal-string.md)
