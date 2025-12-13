export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Please return to the Vibe Kanban app
        </h1>
        <p className="text-gray-600 mb-6">
          Or checkout the docs to get started
        </p>
        <a
          href="https://www.vibekanban.com/docs/getting-started"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
        >
          View Documentation
        </a>
      </div>
    </div>
  );
}
