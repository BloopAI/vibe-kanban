import {
  DiffView,
  DiffModeEnum,
} from "@git-diff-view/react";
import { generateDiffFile } from "@git-diff-view/file";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { useDiffStream } from "@/hooks/useDiffStream";
import { useMemo, useContext, useCallback, useState, useEffect } from "react";
import { TaskSelectedAttemptContext } from "@/components/context/taskDetailsContext.ts";
import { Diff, ThemeMode } from "shared/types";
import { getHighLightLanguageFromPath } from "@/utils/extToLanguage";
import { useConfig } from "@/components/config-provider";
import { Loader } from "@/components/ui/loader";

function DiffTab() {
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const [loading, setLoading] = useState(true);
  const { data, isConnected, error } = useDiffStream(
    selectedAttempt?.id ?? null,
    true,
  );

  useEffect(() => {
    if (data && Object.keys(data?.entries).length > 0 && loading) {
      setLoading(false);
    }
  }, [data]);

  const { config } = useConfig()

  // git-diff-view takes light or dark 
  let theme: "light" | "dark" | undefined = "light";
  if (config?.theme === ThemeMode.DARK) {
    theme = "dark";
  }

  const createDiffFile = useCallback((diff: Diff) => {
    const oldFileName = diff.oldFile?.fileName || "old";
    const newFileName = diff.newFile?.fileName || "new";
    const oldContent = diff.oldFile?.content || "";
    const newContent = diff.newFile?.content || "";

    const instance = generateDiffFile(
      oldFileName,
      oldContent,
      newFileName,
      newContent,
      getHighLightLanguageFromPath(oldFileName) || "plaintext",
      getHighLightLanguageFromPath(newFileName) || "plaintext"
    );
    instance.initRaw();
    return instance;
  }, []);

  const diffFiles = useMemo(() => {
    if (!data) return [];
    return Object.values(data.entries)
      .filter((e: any) => e?.type === "DIFF")
      .map((e: any) => createDiffFile(e.content as Diff));
  }, [data, createDiffFile]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <div className="text-red-800 text-sm">
          Failed to load diff: {error}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-4">
        {diffFiles.map((diffFile, idx) => (
          <div key={idx} className="my-4 border">
            <p className="text-md font-mono px-4 py-2 bg-muted text-muted-foreground overflow-x-auto">{diffFile._newFileName} <span className="text-green-600">+{diffFile.additionLength}</span> <span className="text-red-500">-{diffFile.deletionLength}</span></p>
            <DiffView
              diffFile={diffFile}
              diffViewWrap={false}
              diffViewTheme={theme}
              diffViewHighlight
              diffViewMode={DiffModeEnum.Unified}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default DiffTab;
