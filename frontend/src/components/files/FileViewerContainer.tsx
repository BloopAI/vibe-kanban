import { useQuery } from '@tanstack/react-query';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useFileViewer } from '@/contexts/FileViewerContext';
import { fileBrowserApi } from '@/lib/api';
import { FileViewerSheet } from './FileViewerSheet';
import { FileViewerSidePanel } from './FileViewerSidePanel';

/**
 * Container component that routes between mobile and desktop file viewers.
 *
 * Responsive breakpoints:
 * - Mobile (< 640px): Renders FileViewerSheet (full-screen bottom sheet)
 * - Desktop (>= 640px): Renders FileViewerSidePanel (side panel)
 *
 * Features:
 * - Automatic responsive switching using useMediaQuery hook
 * - Seamless transitions when resizing viewport
 * - Handles file content fetching for mobile view
 * - Desktop panel handles its own data fetching for better performance
 *
 * Uses FileViewerContext for state management, so must be rendered
 * within a FileViewerProvider.
 *
 * @example
 * ```tsx
 * // Add to your main layout alongside the content area
 * <div className="flex">
 *   <main className="flex-1">
 *     <Routes>...</Routes>
 *   </main>
 *   <FileViewerContainer />
 * </div>
 * ```
 */
export function FileViewerContainer() {
  const isMobile = useMediaQuery('(max-width: 639px)');
  const { isOpen, files, activeFileIndex, closePanel } = useFileViewer();

  const activeFile = files[activeFileIndex];
  const fileName = activeFile?.path.split('/').pop() || '';

  // Fetch file content for mobile sheet (desktop panel handles its own fetching)
  const {
    data: fileData,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      'file-viewer',
      activeFile?.path,
      activeFile?.relativePath,
      activeFile?.attemptId,
      activeFile?.isAbsolutePath,
    ],
    queryFn: async () => {
      if (!activeFile) throw new Error('No file selected');

      if (activeFile.isAbsolutePath) {
        return fileBrowserApi.readAbsoluteFile(activeFile.path);
      }
      if (activeFile.relativePath) {
        return fileBrowserApi.readClaudeFile(activeFile.relativePath);
      }
      if (activeFile.attemptId) {
        return fileBrowserApi.readWorktreeFile(
          activeFile.attemptId,
          activeFile.path
        );
      }
      throw new Error('No file source specified');
    },
    enabled: isOpen && !!activeFile && isMobile,
  });

  // Don't render anything if closed or no files
  if (!isOpen || files.length === 0) {
    return null;
  }

  if (isMobile) {
    return (
      <FileViewerSheet
        open={isOpen}
        onClose={closePanel}
        fileName={fileName}
        content={fileData?.content || null}
        isLoading={isLoading}
        error={error instanceof Error ? error : null}
      />
    );
  }

  return <FileViewerSidePanel />;
}
