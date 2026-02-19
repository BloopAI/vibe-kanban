import { createFileRoute } from '@tanstack/react-router';
import { MigratePage } from '@/pages/ui-new/MigratePage';

export const Route = createFileRoute('/_app/migrate')({
  component: MigratePage,
});
