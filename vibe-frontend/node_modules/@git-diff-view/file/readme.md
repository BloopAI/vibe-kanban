## `file content diff` for @git-diff-view component

This package is a wrapper for [`diff`](https://github.com/kpdecker/jsdiff) and [`@git-diff-view/core`](https://github.com/MrWangJustToDo/git-diff-view) to support pure file content diff.

## Usage

```tsx
// ==== step1: generate diff view data, same as the `@git-diff-view/core` ==== //
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

// get All the bundle
const bundle = file.getBundle();

// ==== step2: render the @git-diff-view component ==== //

// merge bundle
const mergeFile = DiffFile.createInstance(data || {}, bundle);

// used for @git-diff-view/react and @git-diff-view/vue
<DiffView diffFile={mergeFile} />

<DiffView :diffFile="mergeFile" />

```

## Screen Shot

![Screenshot](https://raw.githubusercontent.com/MrWangJustToDo/git-diff-view/aa2e918498270f737d28e7531eab08fa3f1b8831/1.png)
![Screenshot](https://raw.githubusercontent.com/MrWangJustToDo/git-diff-view/69c801e5eb5fcabc9c9655825eb1228f18dc1e0c/5.png)
![Screenshot](https://raw.githubusercontent.com/MrWangJustToDo/git-diff-view/aa2e918498270f737d28e7531eab08fa3f1b8831/theme.png)
![Screenshot](https://raw.githubusercontent.com/MrWangJustToDo/git-diff-view/aa2e918498270f737d28e7531eab08fa3f1b8831/2.png)
![Screenshot](https://raw.githubusercontent.com/MrWangJustToDo/git-diff-view/aa2e918498270f737d28e7531eab08fa3f1b8831/3.png)