# download plugin

This plugin allows user to download the current file.

```javascript
import { downloadPlugin } from '@react-pdf-viewer/download';

const downloadPluginInstance = downloadPlugin();

// The button to download the current file
const { Download } = downloadPluginInstance;

// Render
return (
    <>
    <Download />
    <Viewer
        plugins={[
            downloadPluginInstance,
        ]}
    >
    </>
);
```

## Use a custom button

```javascript
import { downloadPlugin } from '@react-pdf-viewer/download';

const downloadPluginInstance = downloadPlugin();

// The button to download the current file
const { Download } = downloadPluginInstance;

// Render
return (
    <>
    <Download>
    {
        (props) => (
            // Your custom button here
            <button onClick={props.onClick}>
                Download
            </button>
        )
    }
    </Download>
    <Viewer
        plugins={[
            downloadPluginInstance,
        ]}
    >
    </>
);
```

## Plugin options

-   `fileNameGenerator` (Optional): Custom the name of download file.

It is a function accepts the current opened file and returns a `string`:

```javascript
(file: OpenFile) => string;
```

By default, the name of download file is determined by the `name` properties of `OpenFile`.
You can customize it as following:

```javascript
import { OpenFile } from '@react-pdf-viewer/core';

const downloadPluginInstance = downloadPlugin({
    fileNameGenerator: (file: OpenFile) => {
        // `file.name` is the URL of opened file
        const fileName = file.name.substring(file.name.lastIndexOf('/') + 1);
        return `a-copy-of-${fileName}`;
    },
});
```
