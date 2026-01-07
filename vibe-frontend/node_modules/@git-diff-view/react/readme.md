## A React DiffView Component like GitHub, Easy to use and feature complete. 

### Usage

#### There are two ways to use this component:

1. Use the `DiffView` component directly.

```tsx
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";

<DiffView<string>
  // use data
  data={{
    oldFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null };
    newFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null };
    hunks: string[];
  }}
  extendData={{oldFile: {10: {data: 'foo'}}, newFile: {20: {data: 'bar'}}}}
  renderExtendLine={({ data }) => ReactNode}
  diffViewFontSize={number}
  diffViewHighlight={boolean}
  diffViewMode={DiffModeEnum.Split | DiffModeEnum.Unified}
  diffViewWrap={boolean}
  diffViewTheme={'light' | 'dark'}
  diffViewAddWidget
  onAddWidgetClick={({ side, lineNumber }) => void}
  renderWidgetLine={({ onClose, side, lineNumber }) => ReactNode}
/>

```

2. Use the `DiffView` component with `@git-diff-view/core` or `@git-diff-view/file`

```tsx
// with @git-diff-view/file
import { DiffFile, generateDiffFile } from "@git-diff-view/file";
const file = generateDiffFile(
  data?.oldFile?.fileName || "",
  data?.oldFile?.content || "",
  data?.newFile?.fileName || "",
  data?.newFile?.content || "",
  data?.oldFile?.fileLang || "",
  data?.newFile?.fileLang || ""
);
file.initTheme('light' / 'dark');
file.init();
file.buildSplitDiffLines();
file.buildUnifiedDiffLines();

// with @git-diff-view/core
import { DiffFile } from "@git-diff-view/core";
const file = new DiffFile(
  data?.oldFile?.fileName || "",
  data?.oldFile?.content || "",
  data?.newFile?.fileName || "",
  data?.newFile?.content || "",
  data?.hunks || [],
  data?.oldFile?.fileLang || "",
  data?.newFile?.fileLang || ""
);
file.initTheme('light' / 'dark');
file.init();
file.buildSplitDiffLines();
file.buildUnifiedDiffLines();

// use current data to render
<DiffView diffFile={file} {...props} />;
// or use the bundle data to render, eg: postMessage/httpRequest
const bundle = file.getBundle();
const diffFile = DiffFile.createInstance(data || {}, bundle);
<DiffView diffFile={diffFile} {...props} />;
```
### example

#### [react-example](https://github.com/MrWangJustToDo/git-diff-view/tree/main/ui/react-example)
#### [react-ssr-example](https://github.com/MrWangJustToDo/git-diff-view/tree/main/ui/next-page-example)
#### [react-rsc-example](https://github.com/MrWangJustToDo/git-diff-view/tree/main/ui/next-app-example)

### Screen Shot

![Screenshot](https://raw.githubusercontent.com/MrWangJustToDo/git-diff-view/aa2e918498270f737d28e7531eab08fa3f1b8831/1.png)
![Screenshot](https://raw.githubusercontent.com/MrWangJustToDo/git-diff-view/69c801e5eb5fcabc9c9655825eb1228f18dc1e0c/5.png)
![Screenshot](https://raw.githubusercontent.com/MrWangJustToDo/git-diff-view/aa2e918498270f737d28e7531eab08fa3f1b8831/theme.png)

### Props

| Props  | Description  |
| :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| data             | The diff data need to show, type: `{ oldFile: {fileName?: string, content?: string}, newFile: {fileName?: string, content?: string}, hunks: string[] }`, you can only pass hunks data, and the component will generate the oldFile and newFile data automatically |
| diffFile         | the target data to render |
| renderWidgetLine | return a valid `react` element to show the widget, this element will render when you click the `addWidget` button in the diff view  |
| renderExtendLine | return a valid `react` element to show the extend data |
| extendData       | a list to store the extend data to show in the `Diff View`, type: {oldFile: {lineNumber: {data: any}}, newFile: {lineNumber: {data: any}}}   |
| diffViewFontSize | the fontSize for the DiffView component, type: number |
| diffViewHighlight | enable syntax highlight, type: boolean |
| diffViewMode     | the mode for the DiffView component, type: `DiffModeEnum.Split` / `DiffModeEnum.Unified` |
| diffViewWrap     | enable code line auto wrap, type: boolean |
| diffViewTheme    | the theme for the DiffView component, type: `light` / `dark` |
| diffViewAddWidget| enable `addWidget` button, type: boolean |
| onAddWidgetClick | when the `addWidget` button clicked, type: `({ side: "old" / "new", lineNumber: number }) => void` |

