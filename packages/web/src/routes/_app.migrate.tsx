import { createFileRoute } from '@tanstack/react-router';
import { MigratePage } from '@/pages/migrate/MigratePage';

export const Route = createFileRoute('/_app/migrate')({
  component: MigratePage,
});
