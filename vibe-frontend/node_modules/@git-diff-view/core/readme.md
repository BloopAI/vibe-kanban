## `git diff` for @git-diff-view Component

## Usage

```tsx
// ==== step1: generate diff view data, this part can be used in the worker/server environment for better performance ==== //
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
// light / dark theme, base on current highlight engine
// default is light
file.initTheme(xxx);
// init
file.init();
// or you can use below method to init
file.initRaw();
file.initSyntax(); // if you do not want syntax highlight, you can skip this step

// build the `Split View` data;
file.buildSplitDiffLines();

// build the `Unified View` data;
file.buildUnifiedDiffLines();

// get All the diff data bundle, you can safely to send this data to the client side
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
