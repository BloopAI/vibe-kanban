import { generateDiffFile } from '@git-diff-view/file';

export interface DiffWorkerInput {
  id: number;
  oldFileName: string;
  oldContent: string;
  newFileName: string;
  newContent: string;
  oldLang: string;
  newLang: string;
  theme?: 'light' | 'dark';
}

export interface DiffWorkerOutput {
  id: number;
  bundle?: ReturnType<ReturnType<typeof generateDiffFile>['_getFullBundle']>;
  additions?: number;
  deletions?: number;
  error?: string;
}

const post = (data: DiffWorkerOutput) => postMessage(data);

onmessage = (event: MessageEvent<DiffWorkerInput>) => {
  const input = event.data;

  try {
    const file = generateDiffFile(
      input.oldFileName,
      input.oldContent,
      input.newFileName,
      input.newContent,
      input.oldLang,
      input.newLang
    );

    file.initTheme(input.theme);

    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      file.initRaw();
    } finally {
      console.warn = originalWarn;
    }

    file.buildSplitDiffLines();
    file.buildUnifiedDiffLines();

    const bundle = file._getFullBundle();
    const additions = file.additionLength ?? 0;
    const deletions = file.deletionLength ?? 0;

    file.clear();

    post({
      id: input.id,
      bundle,
      additions,
      deletions,
    });
  } catch (error) {
    post({
      id: input.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
