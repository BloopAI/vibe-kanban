import { useState, useEffect, useCallback } from 'react';
import mammoth from 'mammoth';
import { Loader2, FileWarning } from 'lucide-react';

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

interface DocxViewerProps {
  fileUrl: string;
  className?: string;
  showOutline?: boolean;
}

export function DocxViewer({ fileUrl, className, showOutline = true }: DocxViewerProps) {
  const [html, setHtml] = useState<string>('');
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDocx() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch the DOCX file as ArrayBuffer
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch document: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // Convert DOCX to HTML using mammoth
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            styleMap: [
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh",
              "p[style-name='Heading 4'] => h4:fresh",
              "p[style-name='Title'] => h1.title:fresh",
            ],
          }
        );

        // Log any conversion messages
        if (result.messages.length > 0) {
          console.log('Mammoth conversion messages:', result.messages);
        }

        // Process HTML to add IDs to headings and extract them
        const parser = new DOMParser();
        const doc = parser.parseFromString(result.value, 'text/html');
        const extractedHeadings: HeadingItem[] = [];

        doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading, index) => {
          const level = parseInt(heading.tagName[1]);
          const text = heading.textContent || '';
          const id = `docx-heading-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;

          heading.id = id;
          extractedHeadings.push({ id, text, level });
        });

        setHeadings(extractedHeadings);
        setHtml(doc.body.innerHTML);
      } catch (err) {
        console.error('Failed to load DOCX:', err);
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setIsLoading(false);
      }
    }

    loadDocx();
  }, [fileUrl]);

  const scrollToHeading = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-full ${className || ''}`}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full ${className || ''}`}>
        <div className="text-center">
          <FileWarning className="h-12 w-12 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full ${className || ''}`}>
      {/* Table of Contents Sidebar */}
      {showOutline && headings.length > 0 && (
        <div className="w-64 shrink-0 border-r bg-muted/30 overflow-auto">
          <div className="p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Table of Contents
            </h3>
            <nav className="space-y-1">
              {headings.map((heading) => (
                <button
                  key={heading.id}
                  onClick={() => scrollToHeading(heading.id)}
                  className={`block w-full text-left text-sm py-1 hover:text-primary transition-colors truncate ${
                    heading.level === 1 ? 'font-medium' :
                    heading.level === 2 ? 'pl-3' :
                    heading.level === 3 ? 'pl-6 text-muted-foreground' :
                    'pl-9 text-muted-foreground text-xs'
                  }`}
                >
                  {heading.text}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Document Content */}
      <div className="flex-1 min-w-0 overflow-auto">
        <article
          className="max-w-4xl mx-auto p-6 docx-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      {/* Scoped styles for DOCX content */}
      <style>{`
        .docx-content {
          line-height: 1.6;
        }
        .docx-content h1 {
          font-size: 2rem;
          font-weight: 700;
          margin-top: 2rem;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid hsl(var(--border));
        }
        .docx-content h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .docx-content h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .docx-content h4, .docx-content h5, .docx-content h6 {
          font-size: 1rem;
          font-weight: 500;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .docx-content p {
          margin-top: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .docx-content ul, .docx-content ol {
          margin-left: 1.5rem;
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .docx-content ul {
          list-style-type: disc;
        }
        .docx-content ol {
          list-style-type: decimal;
        }
        .docx-content li {
          margin-top: 0.25rem;
          margin-bottom: 0.25rem;
        }
        .docx-content table {
          border-collapse: collapse;
          width: 100%;
          margin-top: 1rem;
          margin-bottom: 1rem;
        }
        .docx-content th, .docx-content td {
          border: 1px solid hsl(var(--border));
          padding: 0.5rem 1rem;
          text-align: left;
        }
        .docx-content th {
          background-color: hsl(var(--muted));
          font-weight: 600;
        }
        .docx-content img {
          max-width: 100%;
          height: auto;
          margin-top: 1rem;
          margin-bottom: 1rem;
          border-radius: 0.5rem;
        }
        .docx-content a {
          color: hsl(var(--primary));
          text-decoration: underline;
        }
        .docx-content a:hover {
          text-decoration: none;
        }
        .docx-content strong, .docx-content b {
          font-weight: 600;
        }
        .docx-content em, .docx-content i {
          font-style: italic;
        }
      `}</style>
    </div>
  );
}

export default DocxViewer;
