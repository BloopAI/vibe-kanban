[![Build Status][build-shield]][build-url]
[![npm][npm-shield]][npm-url]
[![npm downloads][npm-dl-shield]][npm-dl-url]
[![Contributors][contributors-shield]][contributors-url]
[![Apache 2.0 License][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<p align="center">
  <a href="https://github.com/rjsf-team/react-jsonschema-form">
    <img src="https://raw.githubusercontent.com/rjsf-team/react-jsonschema-form/7ebc86621d8df8c21f0c39bcca6d476f6f7a2051/packages/validator-ajv8/logo.png" alt="Logo" width="120" height="120">
  </a>

  <h3 align="center">@rjsf/validator-ajv8</h3>

  <p align="center">
  AJV-8 based validator plugin for <a href="https://github.com/rjsf-team/react-jsonschema-form/"><code>react-jsonschema-form</code></a>.
    <br />
    <a href="https://rjsf-team.github.io/react-jsonschema-form/docs/"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://rjsf-team.github.io/react-jsonschema-form/">View Playground</a>
    ·
    <a href="https://github.com/rjsf-team/react-jsonschema-form/issues">Report Bug</a>
    ·
    <a href="https://github.com/rjsf-team/react-jsonschema-form/issues">Request Feature</a>
  </p>
</p>

<!-- TABLE OF CONTENTS -->

## Table of Contents

- [Table of Contents](#table-of-contents)
- [About The Project](#about-the-project)
  - [Built With](#built-with)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Contact](#contact)

<!-- ABOUT THE PROJECT -->

## About The Project

Exports `validator-ajv8` plugin for `react-jsonschema-form`.

### Built With

- [react-jsonschema-form](https://github.com/rjsf-team/react-jsonschema-form/)
- [AJV](https://github.com/ajv-validator/ajv/)
- [TypeScript](https://www.typescriptlang.org/)

<!-- GETTING STARTED -->

## Getting Started

### Prerequisites

#### React JsonSchema Form Utils

- `@rjsf/utils >= 5.0.0`

```bash
yarn add @rjsf/core
```

### Installation

```bash
yarn add @rjsf/validator-ajv8
```

<!-- USAGE EXAMPLES -->

## Usage

```tsx
import { RJSFSchema } from 'packages/utils/dist/index';
import Form from 'packages/core/dist/index';
import validator from '@rjsf/validator-ajv8';

const schema: RJSFSchema = {
  type: 'string',
};

<Form schema={schema} validator={validator} />;
```

or, using a more complex example using custom validator with custom formats

```tsx
import { RJSFSchema } from '@rjsf/utils';
import Form from '@rjsf/core';
import { customizeValidator } from '@rjsf/validator-ajv8';

const customFormats = {
  'phone-us': /\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}$/,
};

const validator = customizeValidator({
  customFormats,
});

const schema: RJSFSchema = {
  type: 'string',
  format: 'phone-us',
};

<Form schema={schema} validator={validator} />;
```

or, using a more complex example using a custom with additional meta schema

```tsx
import { RJSFSchema } from '@rjsf/utils';
import Form from '@rjsf/core';
import { customizeValidator } from '@rjsf/validator-ajv8';

const metaSchemaDraft06 = require('ajv/lib/refs/json-schema-draft-06.json');

const validator = customizeValidator({
  additionalMetaSchemas: [metaSchemaDraft06],
});

const schema: RJSFSchema = {
  $schema: 'http://json-schema.org/draft-06/schema#',
  type: 'string',
};

<Form schema={schema} validator={validator} />;
```

or, using a more complex example using custom validator config override options

```tsx
import { RJSFSchema } from '@rjsf/utils';
import Form from '@rjsf/core';
import { customizeValidator } from '@rjsf/validator-ajv8';

const validator = customizeValidator({
  ajvOptionsOverrides: {
    $data: true,
    verbose: true,
  },
});

const schema: RJSFSchema = {
  type: 'string',
};

<Form schema={schema} validator={validator} />;
```

or, using a more complex example using `ajv-formats` custom [format options](https://github.com/ajv-validator/ajv-formats).

```tsx
import { RJSFSchema } from '@rjsf/utils';
import Form from '@rjsf/core';
import { customizeValidator } from '@rjsf/validator-ajv8';

const validator = customizeValidator({
  ajvFormatOptions: {
    keywords: true,
    formats: ['date', 'time'],
  },
});

const schema: RJSFSchema = {
  type: 'string',
};

<Form schema={schema} validator={validator} />;
```

Finally, you can combine both additional meta schemas, custom formats, custom validator config override options and `ajv-formats` custom [format options](https://github.com/ajv-validator/ajv-formats).

```tsx
import { RJSFSchema } from '@rjsf/utils';
import Form from '@rjsf/core';
import { customizeValidator } from '@rjsf/validator-ajv8';

const metaSchemaDraft06 = require('ajv/lib/refs/json-schema-draft-06.json');

const customFormats = {
  'phone-us': /\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}$/,
};

const validator = customizeValidator({
  additionalMetaSchemas: [metaSchemaDraft06],
  customFormats,
  ajvOptionsOverrides: {
    $data: true,
    verbose: true,
  },
  ajvFormatOptions: {
    keywords: true,
    formats: ['date', 'time'],
  },
});

const schema: RJSFSchema = {
  $schema: 'http://json-schema.org/draft-06/schema#',
  type: 'string',
  format: 'phone-us',
};

<Form schema={schema} validator={validator} />;
```

<!-- ROADMAP -->

## Roadmap

See the [open issues](https://github.com/rjsf-team/react-jsonschema-form/issues) for a list of proposed features (and known issues).

<!-- CONTRIBUTING -->

## Contributing

Read our [contributors' guide](https://rjsf-team.github.io/react-jsonschema-form/docs/contributing/) to get started.

<!-- CONTACT -->

## Contact

rjsf team: [https://github.com/orgs/rjsf-team/people](https://github.com/orgs/rjsf-team/people)

GitHub repository: [https://github.com/rjsf-team/react-jsonschema-form](https://github.com/rjsf-team/react-jsonschema-form)

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[build-shield]: https://github.com/rjsf-team/react-jsonschema-form/workflows/CI/badge.svg
[build-url]: https://github.com/rjsf-team/react-jsonschema-form/actions
[contributors-shield]: https://img.shields.io/github/contributors/rjsf-team/react-jsonschema-form.svg
[contributors-url]: https://github.com/rjsf-team/react-jsonschema-form/graphs/contributors
[license-shield]: https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square
[license-url]: https://choosealicense.com/licenses/apache-2.0/
[npm-shield]: https://img.shields.io/npm/v/@rjsf/validator-ajv8/latest.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/@rjsf/validator-ajv8
[npm-dl-shield]: https://img.shields.io/npm/dm/@rjsf/validator-ajv8.svg?style=flat-square
[npm-dl-url]: https://www.npmjs.com/package/@rjsf/validator-ajv8
