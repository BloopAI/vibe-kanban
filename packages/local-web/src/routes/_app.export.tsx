import { createFileRoute } from '@tanstack/react-router';
import { ExportPageContainer } from '@/pages/export/ExportPage';

export const Route = createFileRoute('/_app/export')({
  component: ExportPageContainer,
});
