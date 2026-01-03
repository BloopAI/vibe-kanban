import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';

// Import styles
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

interface PdfViewerProps {
  fileUrl: string;
  className?: string;
}

export function PdfViewer({ fileUrl, className }: PdfViewerProps) {
  // Create default layout plugin with bookmark sidebar
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => [
      // Only show bookmark/outline tab
      defaultTabs[1], // Bookmarks tab
      defaultTabs[0], // Thumbnails tab
    ],
  });

  return (
    <div className={className} style={{ height: '100%', width: '100%' }}>
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
        <Viewer
          fileUrl={fileUrl}
          plugins={[defaultLayoutPluginInstance]}
          defaultScale={1}
        />
      </Worker>
    </div>
  );
}

export default PdfViewer;
