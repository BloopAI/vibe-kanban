import React from 'react';
import { useParams } from '@tanstack/react-router';

export function ProjectFallbackPage() {
  const { projectId } = useParams({ strict: false });
  const resolvedProjectId = projectId ?? 'unknown';

  return React.createElement(
    'div',
    { className: 'mx-auto min-h-screen w-full max-w-5xl px-double py-double' },
    React.createElement(
      'h1',
      { className: 'text-2xl font-semibold text-high' },
      'Project'
    ),
    React.createElement(
      'p',
      { className: 'mt-base text-normal' },
      `Project ID: ${resolvedProjectId}`
    )
  );
}

export default ProjectFallbackPage;
