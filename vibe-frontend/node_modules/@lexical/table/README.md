# `@lexical/table`

[![See API Documentation](https://lexical.dev/img/see-api-documentation.svg)](https://lexical.dev/docs/api/modules/lexical_table)

This package contains the functionality for the Tables feature of Lexical.

# Lexical Table Plugin

A plugin for handling tables in Lexical.

## Installation

```bash
npm install @lexical/table @lexical/react
```

## Usage

See the [react-table example](https://github.com/facebook/lexical/tree/main/examples/react-table)
for a minimal example that uses this package and the
[TablePlugin](https://lexical.dev/docs/api/modules/lexical_react_LexicalTablePlugin)
from @lexical/react/LexicalTablePlugin

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/facebook/lexical/tree/main/examples/react-table?file=src/main.tsx)

## Features

### Tables
- Create and edit tables with customizable rows and columns
- Support for table headers
- Cell selection and navigation
- Copy and paste support

### Limitations

#### Nested Tables
Nested tables (tables within table cells) are not supported in the editor. The following behaviors are enforced:

1. When attempting to paste a table inside an existing table cell, the paste operation is blocked.
2. The editor actively prevents the creation of nested tables through the UI or programmatically.

Note: When pasting HTML content with nested tables, the nested content will be removed by default. Make sure to implement appropriate `importDOM` handling if you need to preserve this content in some form.

This approach allows you to:
1. Detect nested tables in the imported HTML
2. Extract their content before it gets removed
3. Preserve the content in a format that works for your use case

Choose an approach that best fits your needs:
- Flatten nested tables into a single table
- Convert nested tables to a different format (e.g., lists or paragraphs)
- Store nested content as metadata for future processing
